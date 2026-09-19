const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const client = require('./feituo-client.cjs');
const { generateImage, generateVideo, downloadToFile, retryImageDownload } = require('./media-service.cjs');
function createGenerationJobs(dir) {
  const file = path.join(dir, 'generation-jobs.json');
  const read = () => { if (!fs.existsSync(file)) return []; return JSON.parse(fs.readFileSync(file,'utf8')); };
  const save = job => { const rows = read(); const index = rows.findIndex(r => r.id === job.id); if (index < 0) rows.unshift(job); else rows[index] = job; fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(file+'.tmp',JSON.stringify(rows)); fs.renameSync(file+'.tmp',file); return job; };
  const inFlight = new Map();
  return {
    list: () => read().filter(j=>!j.archived),
    archive({id}) {const job=read().find(j=>j.id===id);if(!job)return; if(['submitting','submitted','downloading'].includes(job.status))throw new Error('运行中的任务请等待完成后移除');save({...job,archived:true});},
    async submit(input) {
      const { apiKey, endpoint, ...snapshot } = input;
      const job = { ...snapshot, id: crypto.randomUUID(), createdAt:new Date().toISOString(), status:'submitting' };
      if (input.model?.startsWith('ft-')) {
        if(new URL(input.endpoint).origin !== 'https://feituokuajing.com')throw new Error('飞拓模型必须使用 https://feituokuajing.com 接口');
        client.validate(input);
        save(job);
        try {
          const result = await client.submit(input);
          const saved=save({...job, jobId:result.jobId, status:input.kind==='image'?'downloading':'submitted', urls:result.resultUrls, costYuan:result.costYuan, normalizedPrompt:result.normalizedPrompt, referenceMappings:result.referenceMappings});
          if(input.kind==='image') {
            if(!result.resultUrls?.length) throw new Error('未返回图片结果地址');
            const files=[];for(const url of result.resultUrls) files.push(await downloadToFile(url,dir,'png'));
            return save({...saved,status:'success',filePath:files[0],files});
          }
          return saved;
        }
        catch (error) { const existing=read().find(r=>r.id===job.id); if(existing?.jobId){save({...existing,warning:error.message});return existing;} save({...job,status:'uncertain',error:`提交未确认：${error.message}。请先核对飞拓任务日志，避免重复扣费。`}); throw error; }
      }
      save(job);
      try {
        const filePath = await (input.kind === 'image' ? generateImage : generateVideo)({...input,destDir:dir});
        return save({...job,status:'success',filePath});
      } catch(error) { if(error.downloadReceiptId)return save({...job,status:'downloading',downloadReceiptId:error.downloadReceiptId,error:error.message}); save({...job,status:'failed',error:error.message}); throw error; }
    },
    async refresh({id,apiKey}) {
      if (inFlight.has(id)) return inFlight.get(id);
      const work = (async () => {
        let job=read().find(r=>r.id===id);
        if (!job) throw new Error('任务不存在');
        if(job.downloadReceiptId){try{const filePath=await retryImageDownload(job.downloadReceiptId,dir);return save({...job,status:'success',filePath,downloadReceiptId:null,error:'',warning:''});}catch(error){return save({...job,warning:error.message});}}
        if (!job.jobId || (job.status === 'success' && job.filePath) || job.status === 'failed') return job;
        try {
          if(job.kind==='image' && job.urls?.length) {const files=[];for(const url of job.urls)files.push(await downloadToFile(url,dir,'png'));return save({...job,status:'success',filePath:files[0],files,warning:''});}
          const result=await client.status({jobId:job.jobId,apiKey});
          job={...job,checkedAt:result.checkedAt || new Date().toISOString(),costYuan:result.costYuan ?? job.costYuan};
          if (result.status === 'failed') return save({...job,status:'failed',error:result.errorMessage || '生成失败'});
          if (result.status !== 'success') return save({...job,status:'submitted',warning:result.warning || '',error:''});
          if (!result.videoUrl) throw new Error('任务完成但视频地址尚未返回');
          job=save({...job,status:'downloading',url:result.videoUrl});
          const filePath=await downloadToFile(result.videoUrl,dir,'mp4');
          return save({...job,status:'success',filePath,error:'',warning:''});
        } catch(error) { return save({...job,warning:error.message}); }
      })();
      inFlight.set(id,work); try{return await work;}finally{inFlight.delete(id);}
    },
    markRecorded({id,mediaId}) {const job=read().find(r=>r.id===id);if(!job)throw new Error('任务不存在');return save({...job,mediaId});},
  };
}
module.exports={createGenerationJobs};

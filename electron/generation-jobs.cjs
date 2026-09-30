const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const client = require('./feituo-client.cjs');
const { generateImage, generateVideo, downloadToFile, retryImageDownload } = require('./media-service.cjs');
function generationRetainedPaths(value) {
  if (typeof value === 'string') return path.isAbsolute(value) ? [value] : [];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(generationRetainedPaths);
}
function createGenerationManagers() {
  const managers = new Map();
  return dir => {
    const resolved = path.resolve(dir), key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (!managers.has(key)) managers.set(key, createGenerationJobs(resolved));
    return managers.get(key);
  };
}
function createGenerationJobs(dir) {
  const file = path.join(dir, 'generation-jobs.json');
  const read = () => { if (!fs.existsSync(file)) return []; return JSON.parse(fs.readFileSync(file,'utf8')); };
  const save = job => { const rows = read(); const index = rows.findIndex(r => r.id === job.id); if (index < 0) rows.unshift(job); else rows[index] = job; fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(file+'.tmp',JSON.stringify(rows)); fs.renameSync(file+'.tmp',file); return job; };
  const inFlight = new Map();
  return {
    list: () => read().filter(j=>!j.archived),
    archive({id}) {const job=read().find(j=>j.id===id);if(!job)return; if(['submitting','submitted','downloading'].includes(job.status))throw new Error('运行中的任务请等待完成后移除');save({...job,archived:true});},
    clear({ ids = [], retainedPaths = [] } = {}) {
      if (!Array.isArray(ids) || !Array.isArray(retainedPaths)) throw new Error('清理参数无效');
      const selected = new Set(ids), rows = read(), targets = rows.filter(job => selected.has(job.id));
      if (targets.some(job => !['success', 'failed'].includes(job.status) || inFlight.has(job.id))) {
        throw new Error('仅可清理已完成或失败的结果；运行中及待核对的任务会保留，请稍后重试。');
      }
      const result = { removed: targets.length, filesDeleted: 0, bytesFreed: 0, filesRetained: 0 };
      if (!targets.length) return result;
      const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
      const remaining = rows.filter(job => !selected.has(job.id));
      const retained = new Set([...retainedPaths, ...generationRetainedPaths(remaining)].filter(value => typeof value === 'string').map(key));
      // A collaborator upload may still be using a finished local file.
      for (const job of targets.filter(job => job.projectId && !job.mediaId)) {
        for (const value of [job.filePath, ...(job.files || [])].filter(Boolean)) retained.add(key(value));
      }
      const root = fs.realpathSync(dir), seen = new Set(), backups = [];
      try {
       for (const value of targets.flatMap(job => [job.filePath, ...(job.files || [])]).filter(value => typeof value === 'string')) {
        const target = path.resolve(value), relative = path.relative(root, target);
        if (seen.has(key(target))) continue;
        seen.add(key(target));
        // Only generated media inside our directory; never metadata, sources or directories.
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !/\.(mp4|webm|mov|png|jpe?g|webp|gif)$/i.test(target) || retained.has(key(target))) {
          result.filesRetained++; continue;
        }
        try {
          const stat = fs.lstatSync(target), resolved = path.relative(root, fs.realpathSync(target));
          if (!stat.isFile() || stat.isSymbolicLink() || !resolved || resolved.startsWith('..') || path.isAbsolute(resolved)) {
            result.filesRetained++; continue;
          }
          // Keep bytes recoverable without copying large videos, including on FAT/exFAT disks.
          const backup = path.join(root, `.xz-clear-${crypto.randomUUID()}.bak`);
          let moved = false;
          try { fs.linkSync(target, backup); }
          catch (error) { if (error.code === 'ENOENT') throw error; fs.renameSync(target, backup); moved = true; }
          backups.push({ target, backup, size: stat.size, moved });
          if (!moved) fs.unlinkSync(target);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
       fs.writeFileSync(file + '.tmp', JSON.stringify(remaining)); fs.renameSync(file + '.tmp', file);
      } catch (error) {
        for (const item of backups) {
          if (!fs.existsSync(item.target)) {
            if (item.moved) fs.renameSync(item.backup, item.target);
            else fs.linkSync(item.backup, item.target);
          }
          if (!item.moved) try { fs.unlinkSync(item.backup); } catch { /* Original file is restored; a duplicate link is harmless. */ }
        }
        throw new Error(`本地文件清理失败，原有结果已保留，请关闭预览后重试：${error.message}`);
      }
      for (const item of backups) {
        try { fs.unlinkSync(item.backup); result.filesDeleted++; result.bytesFreed += item.size; }
        catch { result.filesRetained++; result.warning = '部分本地文件被占用，暂未释放空间。'; }
      }
      return result;
    },
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
module.exports={createGenerationJobs,createGenerationManagers,generationRetainedPaths};

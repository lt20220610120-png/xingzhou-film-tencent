const fnko=require('./fnko-client.cjs');
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
function createGenerationManagers(options={}) {
  const managers = new Map();
  return dir => {
    const resolved = path.resolve(dir), key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (!managers.has(key)) managers.set(key, createGenerationJobs(resolved,options));
    return managers.get(key);
  };
}
function createGenerationJobs(dir,options={}) {
  const file = path.join(dir, 'generation-jobs.json');
  // 2.8.32's local-URL guard ran before the paid POST but its catch called it
  // uncertain. Correct only that exact legacy case, never a real remote task.
  if(fs.existsSync(file)){
    const rows=JSON.parse(fs.readFileSync(file,'utf8'));let changed=false;
    const repaired=rows.map(job=>{let niney=false;try{niney=new URL(job.endpoint).hostname==='9yapi.shop';}catch{}
      if(niney&&job.status==='uncertain'&&!job.jobId&&!job.url&&String(job.error).includes('9Y 视频只接受公网 HTTPS 素材地址')&&job.references?.some(r=>r.filePath&&!/^https:\/\//i.test(r.url||''))){changed=true;return {...job,status:'failed',submissionAttempted:false,error:'参考素材尚未完成上传，生成请求未发出；可复用此条目后重新生成。'};}return job;
    });
    if(changed){fs.writeFileSync(file+'.tmp',JSON.stringify(repaired));fs.renameSync(file+'.tmp',file);}
  }
  const read = () => { if (!fs.existsSync(file)) return []; return JSON.parse(fs.readFileSync(file,'utf8')); };
  const save = job => { const rows = read(); const index = rows.findIndex(r => r.id === job.id); if (index < 0) rows.unshift(job); else rows[index] = job; fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(file+'.tmp',JSON.stringify(rows)); fs.renameSync(file+'.tmp',file); if(['success','failed'].includes(job.status))Promise.resolve().then(()=>options.referenceLifecycle?.(job)).catch(()=>{}); return job; };
  const inFlight = new Map();
  const libtvRunning=new Map();
  const libtv=()=>typeof options.libtvService==='function'?options.libtvService():options.libtvService;
  const libtvNodes=raw=>raw?.nodes||raw?.data?.nodes||[raw?.node||raw];
  const libtvResult=(raw,job)=>require('./libtv-service.cjs').libtvResultURLs(raw).some(u=>!(job.libtvInitialUrls||[]).includes(u));
  const libtvFailed=raw=>libtvNodes(raw).some(n=>{const status=n?.data?.taskInfo?.status??n?.data?.status??n?.taskInfo?.status??n?.status;return status===3||['failed','error','canceled','cancelled'].includes(String(status).toLowerCase());});
  return {
    list: () => read().filter(j=>!j.archived),
    async waitForCompletion(id){if(libtvRunning.has(id))await libtvRunning.get(id);const job=read().find(r=>r.id===id);if(job?.status!=='success')throw Error(job?.warning||job?.error||'LibTV 原任务已保留，请在图视生成结果中刷新或打开原画布');return job;},
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
      const { apiKey, endpoint, signal, accountId, ...snapshot } = input;
      // Reuse carries generation settings, never a previous paid task's identity.
      for(const field of ['jobId','filePath','files','url','urls','mediaId','downloadReceiptId','costYuan','warning','error','checkedAt','nextPollAt','archived'])delete snapshot[field];
      let persistedEndpoint=endpoint;if(input.kind==='video'){const address=new URL(endpoint);address.search='';address.hash='';persistedEndpoint=address.href.replace(/\/$/,'');}
      const job = { ...snapshot, ...((input.kind==='video'||fnko.isFnkoEndpoint(endpoint))?{endpoint:persistedEndpoint}:{}), id: crypto.randomUUID(), createdAt:new Date().toISOString(), status:'submitting' };
      if(input.provider==='libtv'){
        if(!libtv())throw Error('LibTV 连接器尚未就绪，请先连接账号');
        save(job);
        let task;
        try{task=save({...job,...await libtv().prepare(accountId,{...input,id:job.id}),status:'submitted',libtvRunStarted:true});}
        catch(e){save({...job,status:'failed',error:e.message});throw e;}
        const work=(async()=>{
          try{const result=await libtv().run(accountId,task,{signal});if(libtvFailed(result)){save({...task,status:'failed',error:'LibTV 官方任务失败，请在原画布核对'});return;}
            task=save({...task,status:'downloading'});try{save({...task,...await libtv().download(accountId,task,dir),status:'success',warning:''});}catch(e){save({...task,warning:e.message});}
          }catch(e){save({...task,status:'submitted',warning:e.message+'；请刷新或打开原画布核对，不会自动重新生成'});}
        })();
        libtvRunning.set(job.id,work);work.finally(()=>libtvRunning.delete(job.id)).catch(()=>{});
        return task;
      }
      if(fnko.isFnkoEndpoint(endpoint)){
        save(job);
        try{
          const result=await fnko.submit({...input,idempotencyKey:job.id});
          const saved=save({...job,jobId:result.jobId,status:result.status==='failed'?'failed':result.status==='success'?'downloading':'submitted',url:result.videoUrl,urls:result.resultUrls,error:result.errorMessage,costYuan:result.costYuan,nextPollAt:Date.now()+30000});
          if(result.status==='success'&&result.resultUrls?.length){try{const files=[];for(const url of result.resultUrls)files.push(await fnko.download({...saved,apiKey,url},dir));return save({...saved,status:'success',filePath:files[0],files});}catch{return save({...saved,warning:'原任务已完成，下载未完成；刷新仅下载原结果，不重新生成。'});}}
          return saved;
        }catch(e){save({...job,status:e.beforeSubmission?'failed':'uncertain',submissionAttempted:!e.beforeSubmission,error:String(e.message).replaceAll(apiKey?.trim()||'\u0000','[密钥已隐藏]').slice(0,500)});if(!e.beforeSubmission)e.generationJobId=job.id;throw e;}
      }
      const ftHost=(()=>{try{return new URL(endpoint).origin==='https://feituokuajing.com';}catch{return false;}})();
      if (input.kind==='video'&&(!ftHost||!['auto','feituo',undefined].includes(input.videoProtocol))) {
        const provider=require('./video-provider.cjs');await provider.validate(input);await provider.config(input);
        save(job);
        try{
          let prepared=input;try{await provider.preflight(input,{allowLocal:!!options.prepareVideoReferences});if(options.prepareVideoReferences)prepared=await options.prepareVideoReferences({...input,referenceTaskId:job.id});await provider.preflight(prepared);}catch(e){const detail=String(e.message||'素材准备失败').replaceAll(apiKey?.trim()||'\u0000','[密钥已隐藏]').slice(0,500);save({...job,status:'failed',submissionAttempted:false,error:detail});throw Object.assign(new Error(detail),{beforeSubmission:true});}
          const result=await provider.submit({...prepared,idempotencyKey:job.id});const saved=save({...job,jobId:result.jobId,status:result.status==='failed'?'failed':result.videoUrl?'downloading':'submitted',url:result.videoUrl,error:result.errorMessage,nextPollAt:Date.now()+(result.pollAfterSeconds||30)*1000});
          if(result.videoUrl){try{const filePath=await provider.download(saved,apiKey,dir);return save({...saved,status:'success',filePath});}catch(e){return save({...saved,warning:'结果已保留，重试查询下载即可'});}}return saved;
        }catch(e){if(e.beforeSubmission){if(read().find(r=>r.id===job.id)?.status!=='failed')save({...job,status:'failed',submissionAttempted:false,error:String(e.message).replaceAll(apiKey?.trim()||'\u0000','[密钥已隐藏]').slice(0,500)});throw e;}const detail=String(e.message||'网络或响应异常').replaceAll(apiKey?.trim()||'\u0000','[密钥已隐藏]').slice(0,500);const message='提交未确认，请先核对上游任务日志；不会自动重复提交。'+detail;save({...job,status:'uncertain',error:message});throw new Error(message);}
      }
      if (input.model?.startsWith('ft-')||ftHost) {
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
    async refresh({id,apiKey,endpoint,accountId}) {
      if(libtvRunning.has(id))return read().find(r=>r.id===id);
      if (inFlight.has(id)) return inFlight.get(id);
      const work = (async () => {
        let job=read().find(r=>r.id===id);
        if (!job) throw new Error('任务不存在');
        if(job.provider==='libtv'){
          if(job.status==='success'||job.status==='failed')return job;
          try{const raw=await libtv().query(accountId,job);if(libtvFailed(raw))return save({...job,status:'failed',error:'LibTV 官方任务失败，请打开原画布核对'});
            if(job.status!=='downloading'&&!libtvResult(raw,job))return save({...job,warning:'LibTV 原任务尚未完成，刷新只查询原节点，不会重新生成'});
            job=save({...job,status:'downloading'});return save({...job,...await libtv().download(accountId,job,dir),status:'success',warning:''});
          }catch(e){return save({...job,warning:e.message});}
        }
        if(fnko.isFnkoEndpoint(job.endpoint)){
          if(job.status==='success'||job.status==='failed')return job;
          if(!endpoint||new URL(endpoint).origin!==new URL(job.endpoint).origin)return save({...job,warning:'请使用原站新Key查询；未向其他站点发送密钥'});
          if(!job.jobId&&job.status==='downloading'&&job.urls?.length){
            try{const files=[];for(const url of job.urls)files.push(await fnko.download({...job,apiKey,url},dir));return save({...job,status:'success',filePath:files[0],files,warning:'',error:''});}
            catch(e){return save({...job,warning:String(e.message).replaceAll(apiKey?.trim()||'\u0000','[密钥已隐藏]').slice(0,500)});}
          }
          if(!job.jobId)return save({...job,warning:'提交尚未确认，请用原请求编号核对站点任务日志，不自动重发'});
          try{
            const result=await fnko.status({...job,apiKey});
            if(result.status==='failed')return save({...job,status:'failed',error:result.errorMessage||'原任务失败'});
            if(result.status!=='success')return save({...job,status:'submitted',warning:result.warning||'',nextPollAt:Date.now()+30000});
            const urls=result.resultUrls?.length?result.resultUrls:[result.videoUrl].filter(Boolean);
            if(!urls.length)throw Error('原任务结果尚未就绪');
            job=save({...job,status:'downloading',url:urls[0],urls});const files=[];for(const url of urls)files.push(await fnko.download({...job,apiKey,url},dir));return save({...job,status:'success',filePath:files[0],files,warning:'',error:''});
          }catch(e){return save({...job,warning:String(e.message).replaceAll(apiKey?.trim()||'\u0000','[密钥已隐藏]').slice(0,500)});}
        }
        const generic=job.kind==='video'&&job.endpoint&&(new URL(job.endpoint).origin!=='https://feituokuajing.com'||!['auto','feituo',undefined].includes(job.videoProtocol));
        const credentialOrigin=job.endpoint?new URL(job.endpoint).origin:job.model?.startsWith('ft-')?'https://feituokuajing.com':null;
        if((generic&&!endpoint)||(credentialOrigin&&endpoint&&new URL(endpoint).origin!==credentialOrigin))return save({...job,warning:'接口地址已变化，请使用原服务商配置查询这个任务，未发送密钥'});
        if(generic&&!job.jobId&&job.url&&job.status==='downloading'){
          try{const filePath=await require('./video-provider.cjs').download(job,apiKey,dir);return save({...job,status:'success',filePath,warning:''});}catch{return save({...job,warning:'结果地址下载暂未完成，请稍后重试下载'});}
        }
        if(job.downloadReceiptId){try{const filePath=await retryImageDownload(job.downloadReceiptId,dir);return save({...job,status:'success',filePath,downloadReceiptId:null,error:'',warning:''});}catch(error){return save({...job,warning:error.message});}}
        if (!job.jobId || (job.status === 'success' && job.filePath) || job.status === 'failed') return job;
        try {
          if(job.kind==='image' && job.urls?.length) {const files=[];for(const url of job.urls)files.push(await downloadToFile(url,dir,'png'));return save({...job,status:'success',filePath:files[0],files,warning:''});}
          const result=generic?await require('./video-provider.cjs').status({...job,apiKey}):await client.status({jobId:job.jobId,apiKey});
          job={...job,checkedAt:result.checkedAt || new Date().toISOString(),costYuan:result.costYuan ?? job.costYuan};
          if (result.status === 'failed') return save({...job,status:'failed',error:result.errorMessage || '生成失败'});
          if (result.status !== 'success') return save({...job,status:'submitted',nextPollAt:Date.now()+(result.pollAfterSeconds||30)*1000,warning:result.warning || '',error:''});
          if (!result.videoUrl) throw new Error('任务完成但视频地址尚未返回');
          job=save({...job,status:'downloading',url:result.videoUrl});
          const filePath=generic?await require('./video-provider.cjs').download(job,apiKey,dir):await downloadToFile(result.videoUrl,dir,'mp4');
          return save({...job,status:'success',filePath,error:'',warning:''});
        } catch(error) { return save({...job,warning:error.message}); }
      })();
      inFlight.set(id,work); try{return await work;}finally{inFlight.delete(id);}
    },
    markRecorded({id,mediaId}) {const job=read().find(r=>r.id===id);if(!job)throw new Error('任务不存在');return save({...job,mediaId});},
  };
}
module.exports={createGenerationJobs,createGenerationManagers,generationRetainedPaths};

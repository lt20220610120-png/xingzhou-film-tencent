const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const isFnkoEndpoint=value=>{try{return new URL(value).origin==='https://fanke2026.xyz';}catch{return false;}};
function createFnkoClient(deps={}){
 const fetchFn=deps.fetchFn||require('./win-ai-api-fetch.cjs').winAIFetch;
 const readReference=deps.readReference|| (async ref=>ref.filePath?{bytes:await fs.readFile(ref.filePath),mime:({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg'})[path.extname(ref.filePath).toLowerCase()]}:require('./media-network.cjs').readMediaBytes(ref.url,{timeoutMs:120000}));
 const base=input=>{const u=new URL(input.endpoint);if(u.username||u.password||!isFnkoEndpoint(u.href))throw Error('FT连接地址无效');const p=u.pathname.includes('/api/open/v1')?'/api/open/v1':u.pathname.includes('/api/feituo/v1')?'/api/feituo/v1':'/v1';return u.origin+p;};
 const auth=input=>{if(!input.apiKey?.trim())throw Error('请先填写本站新API Key；旧FT Key不能用于新站');return {Authorization:'Bearer '+input.apiKey.trim()};};
 const json=async(response,key)=>{let data;try{data=await response.json();}catch{throw Error(`FT返回非JSON响应（${response.status}）`);}if(!response.ok||data.success===false){const e=Error(`FT请求失败（${response.status}）：${String(data.errorMessage||data.error?.message||data.error||'请检查Key、权限、额度或目录版本').replaceAll(key||'\u0000','[密钥已隐藏]').slice(0,350)}`);e.httpStatus=response.status;throw e;}return data;};
 const signal=input=>input.signal?AbortSignal.any([input.signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000);
 async function models(input){const r=await json(await fetchFn(base(input)+'/models',{headers:auth(input),redirect:'error',signal:signal(input)}),input.apiKey);const rows=r.data||r.models;if(!Array.isArray(rows))throw Error('FT未返回有效模型目录');return rows;}
 function decode(data){
  const raw=data.status||data.state||'',billing=data.tokenBilling?.state||data.billing?.state;
  let status=['succeeded','success','completed'].includes(raw)?'success':['failed','error','cancelled','canceled'].includes(raw)?'failed':'submitted';
  if(['awaiting_usage','awaiting_balance'].includes(billing)||data.billing?.mode==='token'&&data.billing.settled!==true)status='submitted';
  const urls=data.resultUrls||data.result_urls||data.data?.map?.(r=>r.url||r.b64_json&&'data:image/png;base64,'+r.b64_json).filter(Boolean)||[];
  const url=data.videoUrl||data.video_url||data.content?.video_url||urls[0];
  return {jobId:data.jobId||data.taskId||data.id,status,videoUrl:url,resultUrls:urls.length?urls:url?[url]:[],pollAfterSeconds:Math.max(30,Number(data.pollAfterSeconds)||30),warning:status==='submitted'&&billing?`原任务等待结算：${billing}；不重新生成。`:'',errorMessage:typeof data.error==='string'?data.error:data.error?.message||data.errorMessage,costYuan:data.costYuan??data.cost_yuan};
 }
 async function submit(input){
  let attempted=false;
  try{
   const b=base(input),native=b.endsWith('/api/open/v1'),openai=b.endsWith('/v1')&&!b.includes('/api/'),kind=input.kind||'video',refs=input.references||[];
   if(!input.prompt?.trim())throw Error('请填写提示词');
   const model=(await models(input)).find(m=>m.id===input.model&&(m.type||m.kind)===kind);
   if(!model)throw Error('所选模型已下架或当前账号无权限，请刷新模型目录后选择');
   const {normalizeCapabilities}=await import('../core/modelCapabilities.js'),caps=normalizeCapabilities({...model,...model.capabilities});
   if(kind==='image'&&(!input.resolution||/^\d+x\d+$/.test(input.resolution)))input={...input,resolution:model.capabilities?.defaultResolution||caps.resolutions?.[0]};
   if(caps.maxPrompt!=null&&input.prompt.length>caps.maxPrompt)throw Error('提示词超出模型目录限制');
   for(const [k,cap] of [['image','maxImages'],['video','maxVideos'],['audio','maxAudios']])if(caps[cap]!=null&&refs.filter(r=>r.kind===k).length>caps[cap])throw Error('参考素材数量超出目录限制');
   if(refs.some(r=>!['image','video','audio'].includes(r.kind)))throw Error('参考素材类型无效');
   if(kind==='image'&&refs.some(r=>r.kind!=='image'))throw Error('图片接口只接受图片参考');
   if(refs.filter(r=>['image','video'].includes(r.kind)).length<(Number(model.capabilities?.minVisualReferences??model.min_visual_refs)||0))throw Error('此模型需要图片或视频参考');
   if(caps.audioRequiresImage&&refs.some(r=>r.kind==='audio')&&!refs.some(r=>r.kind==='image'))throw Error('此模型的音频参考需要同时提供图片');
   for(const [field,allowed] of [['ratio',caps.ratios],['resolution',caps.resolutions],['duration',caps.durationByResolution?.[input.resolution]||caps.durations]])if((field!=='duration'||kind==='video')&&allowed?.length&&!allowed.includes(field==='duration'?Number(input[field]):input[field]))throw Error(`所选${field}不在当前模型目录规格中，请刷新参数`);
   const headers=auth(input),body={model:input.model,prompt:input.prompt,ratio:input.ratio||'auto',...(kind==='video'?{duration:Number(input.duration)}:{}),...(input.resolution?{resolution:input.resolution}:{})};
   const requestId=input.idempotencyKey||crypto.randomUUID();headers[native?'Idempotency-Key':'X-Client-Request-Id']=requestId;
   if(native){
    for(const key of ['modelVersion','pricingVersion','tokenPricingVersion'])if(model[key]!==undefined)body[key]=model[key];
    if(!Number.isInteger(body.modelVersion))throw Error('模型目录缺少modelVersion，未提交任务');
    body.pricingVersion??=0;if(kind==='video')body.tokenPricingVersion??=0;
    body.assetIds=[];if(kind==='video'){body.videoAssetIds=[];body.audioAssetIds=[];}
    for(const ref of refs){
     const {bytes,mime}=await readReference(ref);if(!mime||!mime.startsWith(ref.kind+'/'))throw Error('参考素材格式与类型不一致');
     if(bytes.length>(ref.kind==='image'?10:25)*1024*1024)throw Error('参考素材超出上传体积限制');
     const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),ref.filePath?path.basename(ref.filePath):ref.name||'reference.'+({image:'png',video:'mp4',audio:'wav'}[ref.kind]));
     const uploaded=await json(await fetchFn(b+'/assets',{method:'POST',headers:auth(input),body:form,redirect:'error',signal:signal(input)}),input.apiKey);
     if(!uploaded.id)throw Error('上传未返回本账号素材ID');body[ref.kind==='image'?'assetIds':ref.kind+'AssetIds'].push(uploaded.id);
    }
   }else{
    for(const k of ['image','video','audio'])body[k+'Urls']=refs.filter(r=>r.kind===k).map(r=>r.url);
    if(kind==='image'&&(input.imageSize||input.resolution))body.imageSize=input.imageSize||input.resolution;
   }
   let requestBody;
   if(!native&&refs.some(r=>r.filePath)){
    const form=new FormData();for(const [key,value] of Object.entries(body))if(!key.endsWith('Urls'))form.append(key,String(value));
    for(const ref of refs){const {bytes,mime}=await readReference(ref);form.append(ref.kind+'s',new Blob([bytes],{type:mime}),ref.filePath?path.basename(ref.filePath):ref.name||'reference.'+({image:'png',video:'mp4',audio:'wav'}[ref.kind]));}requestBody=form;
   }else{headers['Content-Type']='application/json';requestBody=JSON.stringify(body);}
   const suffix=openai?(kind==='video'?'/videos':'/images/generations'):`/${kind}/generate`;
   attempted=true;const data=await json(await fetchFn(b+suffix,{method:'POST',headers,body:requestBody,redirect:'error',signal:signal(input)}),input.apiKey),result=decode(data);
   if(!result.jobId&&!result.resultUrls.length)throw Error('提交未返回任务编号，请核对原幂等编号，不自动重发');
   if(!result.jobId&&result.resultUrls.length)result.status='success';return result;
  }catch(error){if(!attempted||[400,401,402,403,404,422,429].includes(error.httpStatus))error.beforeSubmission=true;throw error;}
 }
 async function status(input){
  const b=base(input),native=b.endsWith('/api/open/v1'),openai=!b.includes('/api/');
  if(!input.jobId)throw Error('原任务编号不存在');
  const suffix=native?'/jobs/'+encodeURIComponent(input.jobId):openai&&input.kind!=='image'?'/videos/'+encodeURIComponent(input.jobId):`/${input.kind||'video'}/status?jobId=${encodeURIComponent(input.jobId)}`;
  const statusFetch=deps.statusFetch||deps.fetchFn||require('./media-network.cjs').fetchMedia;
  return decode(await json(await statusFetch(b+suffix,{headers:auth(input),redirect:'error',credentials:'omit',cache:'no-store',signal:signal(input)}),input.apiKey));
 }
 async function download(input,dir){
  let url=input.url||input.videoUrl||input.resultUrls?.[0];if(!url)throw Error('原任务结果地址尚未返回');
  const b=base(input),downloadFetch=deps.downloadFetch||deps.fetchFn||require('./media-network.cjs').fetchMedia,timeout=signal(input);let response;
  url=new URL(url,b+'/').href;const seen=new Set();
  for(let hop=0;hop<=5;hop++){
   const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('结果下载只允许无凭据的 HTTPS 地址');
   if(seen.has(url))throw Error('结果地址跳转循环，请重新查询原任务');seen.add(url);
   const own=b.endsWith('/api/open/v1')&&u.origin===new URL(b).origin&&u.pathname===`/api/open/v1/jobs/${input.jobId}/content`;
   const readOptions={headers:own?auth(input):{},redirect:'manual',credentials:'omit',signal:timeout};
   try{response=await downloadFetch(url,{...readOptions,signal:AbortSignal.any([timeout,AbortSignal.timeout(30000)])});}
   catch(error){const fallback=deps.fallbackDownloadFetch||(!deps.fetchFn&&!deps.downloadFetch?globalThis.fetch:null);if(!fallback||timeout.aborted)throw error;response=await fallback(url,readOptions);}
   if(response.status<300||response.status>=400)break;
   const location=response.headers.get('location');await response.body?.cancel?.();
   if(!location||hop===5)throw Error('结果地址跳转过多或地址为空，请重新查询原任务');url=new URL(location,url).href;
  }
  if(!response.ok)throw Error(`结果尚未就绪或链接失效（${response.status}），请重新查询原任务，不要重新生成`);
  const mime=response.headers.get('content-type')||'';if(mime&&!(input.kind==='image'?/^(image\/|application\/octet-stream)/:/^(video\/|application\/octet-stream)/).test(mime))throw Error('结果并非所需类型的媒体文件');
  const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length)throw Error('结果下载返回空文件，保留原任务继续下载');
  const file=path.join(dir,`fnko-${Date.now()}-${crypto.randomUUID()}.${input.kind==='image'?'png':'mp4'}`);await fs.mkdir(dir,{recursive:true});await fs.writeFile(file,bytes);return file;
 }
 async function generateImage(input){
  let result=await submit({...input,kind:'image',ratio:input.ratio||'auto',idempotencyKey:input.idempotencyKey||crypto.randomUUID()});
  for(let n=0;n<120;n++){
   if(result.status==='failed')throw Error(result.errorMessage||'图片任务失败');
   if(result.status==='success'&&result.resultUrls.length)return download({...input,kind:'image',jobId:result.jobId,url:result.resultUrls[0]},input.destDir);
   await (deps.wait|| (ms=>new Promise(r=>setTimeout(r,ms))))(30000);result=await status({...input,kind:'image',jobId:result.jobId});
  }throw Error('图片仍在原站生成，请保留原任务编号查询，不要重新提交');
 }
 return {submit,status,download,models,generateImage};
}
module.exports={isFnkoEndpoint,createFnkoClient,...createFnkoClient()};

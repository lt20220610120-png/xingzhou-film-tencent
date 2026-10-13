const fs=require('node:fs'),path=require('node:path');
const shared=import('../core/videoProviderConfig.js'),capabilities=import('../core/modelCapabilities.js');
function getValue(obj,paths=''){for(const key of String(paths).split('|')){let v=obj;for(const part of key.split('.').filter(Boolean))v=v?.[part];if(v!==undefined&&v!==null&&v!=='')return v;}}
function template(value,vars){
 if(typeof value==='string'){const exact=value.match(/^\{\{(\w+)\}\}$/);if(exact){if(!(exact[1] in vars))throw Error('未知模板变量 '+exact[1]);return vars[exact[1]];}return value.replace(/\{\{(\w+)\}\}/g,(_,k)=>{if(!(k in vars))throw Error('未知模板变量 '+k);return String(vars[k]??'');});}
 if(Array.isArray(value))return value.map(v=>template(v,vars));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['__proto__','constructor','prototype'].includes(k)).map(([k,v])=>[k,template(v,vars)]).filter(([,v])=>v!==undefined));return value;
}
function baseUrl(endpoint,protocol){const u=new URL(endpoint);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('视频接口地址无效');u.hash='';u.search='';if(protocol==='autodl'){if(['autodl.art','www.autodl.art'].includes(u.hostname)){u.hostname='autodl.art';u.protocol='https:';}u.pathname='/api/v1/comfyui';return u.href.replace(/\/$/,'');}u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/(?:contents\/generations\/tasks|video\/generate|video\/generations|videos)$/,'');if(protocol==='feituo'&&(!u.pathname||u.pathname==='/'))u.pathname='/api/open/v1';if(['maxforai','niney'].includes(protocol))u.pathname='/v1';else if(protocol.startsWith('videos-')&&(!u.pathname||u.pathname==='/'))u.pathname='/v1';return u.href.replace(/\/$/,'');}
function endpointUrl(base,part,vars={}){const interpolated=String(part||'').replace(/\{\{(taskId|model)\}\}/g,(_,key)=>encodeURIComponent(vars[key]||''));const u=new URL(interpolated,base+'/');if(u.origin!==new URL(base).origin||u.username||u.password)throw Error('提交、查询和鉴权下载必须使用同一服务商地址');return u.href;}
function containsCredential(value,key){if(typeof value==='string')return value===key||value==='Bearer '+key||value==='Key '+key||(key.length>=16&&value.includes(key));return value&&typeof value==='object'&&Object.values(value).some(v=>containsCredential(v,key));}
async function config(input){const {effectiveVideoProtocol,videoAdapterPreset,validateVideoAdapter}=await shared;const protocol=effectiveVideoProtocol(input);const custom=protocol==='custom'?validateVideoAdapter(input.videoAdapter):{};if(input.apiKey&&containsCredential(custom,input.apiKey))throw Error('请将密钥填在 API Key，不能写进协议模板');const adapter={...videoAdapterPreset(protocol),...custom,response:{...videoAdapterPreset(protocol).response,...custom.response}};if(protocol==='feituo'&&input.references?.some(r=>r.filePath)){adapter.bodyType='multipart';adapter.referenceMode='multipart';adapter.fileFields={image:'images',video:'videos',audio:'audios'};}return {protocol,adapter,base:baseUrl(input.endpoint,protocol)};}
function auth(adapter,key){if(adapter.authMode==='none')return {};if(!key?.trim())throw Error('请填写视频 API Key');if(['query','body'].includes(adapter.authMode))return {};const name=adapter.authMode==='header'?adapter.authHeader||'x-api-key':'Authorization';if(!/^[\w-]+$/.test(name)||['host','content-length','content-type'].includes(name.toLowerCase()))throw Error('鉴权请求头无效');return {[name]:(adapter.authMode==='header'?(adapter.authPrefix??''):'Bearer ')+key.trim()};}
function injectAuthentication(url,body,adapter,key){const field=adapter.authField||'key';if(!/^[\w-]+$/.test(field)||['__proto__','constructor','prototype'].includes(field))throw Error('鉴权字段无效');if(adapter.authMode==='query'){const u=new URL(url);u.searchParams.set(field,key.trim());url=u.href;}else if(adapter.authMode==='body'){if(!body)throw Error('body 鉴权需要 POST/PUT 请求体，请按上游文档配置');if(body instanceof FormData)body.append(field,key.trim());else{const obj=JSON.parse(body);obj[field]=key.trim();body=JSON.stringify(obj);}}return {url,body};}
function safeMessage(message,key){let text=typeof message==='string'?message:'请核对服务商任务详情';if(key?.trim())text=text.replaceAll(key.trim(),'[密钥已隐藏]');return text.slice(0,500);}
async function readJson(response,key){let data;try{data=await response.json();}catch{throw Error('视频上游返回非 JSON 响应（HTTP '+response.status+'）');}const outerFailure=data.success===false||(data.code&&String(data.code).toLowerCase()!=='success'&&!getValue(data,'id|task_id|data.id|data.task_id'));if(!response.ok||outerFailure)throw Error('视频上游请求失败（HTTP '+response.status+'）：'+safeMessage(getValue(data,'errorMessage|error.message|data.error.message|message|msg|fail_reason'),key));return data;}
function decode(data,adapter,key){const r=adapter.response;const raw=String(getValue(data,r.status)||'').toLowerCase();const status=adapter.failedStatuses.map(x=>String(x).toLowerCase()).includes(raw)?'failed':adapter.successStatuses.map(x=>String(x).toLowerCase()).includes(raw)?'success':'submitted';const jobId=getValue(data,r.taskId),url=adapter.resultKind==='video'?data.data?.results?.find(result=>result?.type==='video'&&result.output_type!=='temp')?.url:getValue(data,r.url),error=getValue(data,r.error);return {jobId:jobId===undefined?undefined:String(jobId),status,videoUrl:typeof url==='string'?url:undefined,errorMessage:status==='failed'?safeMessage(error||'视频上游任务失败，请核对服务商任务详情',key):undefined,pollAfterSeconds:Number(data.pollAfterSeconds||data.poll_after_seconds||adapter.pollSeconds)||30};}
const mime=r=>({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp','.mp4':'video/mp4','.mov':'video/quicktime','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.webm':'video/webm'})[path.extname(r.filePath||r.filename||'').toLowerCase()]||'application/octet-stream';
async function referenceBytes(ref,signal){if(ref.filePath)return {bytes:await fs.promises.readFile(ref.filePath),mime:mime(ref)};const media=await require('./media-network.cjs').readMediaBytes(ref.url,{signal});return {bytes:media.bytes,mime:media.mime||mime(ref)};}
async function uploadMaxAsset(base,key,ref,signal){const {bytes,mime:type}=await referenceBytes(ref,signal);const form=new FormData();form.append('file',new Blob([bytes],{type}),ref.filePath?path.basename(ref.filePath):ref.filename||`reference.${ref.kind==='image'?'png':ref.kind==='video'?'mp4':'mp3'}`);const response=await fetch(endpointUrl(base,'assets'),{method:'POST',headers:{Authorization:'Bearer '+key.trim()},body:form,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});const data=await readJson(response,key),url=getValue(data,'url|data.url');if(typeof url!=='string'||!/^https?:\/\//i.test(url))throw Error('MaxForAI 素材上传成功但未返回可用地址');return url;}
function compact(value){if(Array.isArray(value))return value.map(compact).filter(v=>v!==undefined);if(value&&typeof value==='object'&&!(value instanceof Blob)&&!(value instanceof FormData))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,compact(v)]).filter(([,v])=>v!==undefined&&(!Array.isArray(v)||v.length)));return value;}
function maxPromptAliases(prompt){return String(prompt||'').replace(/@(?:图片|图)(\d+)/g,'@image$1').replace(/@视频(\d+)/g,'@video$1').replace(/@音频(\d+)/g,'@audio$1');}
function publicHttpsReference(value){
 try{
  const u=new URL(value),host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(u.protocol!=='https:'||u.username||u.password||host==='localhost'||/\.(?:localhost|local|internal)$/.test(host))return false;
  const ipv4=host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if(ipv4){const [a,b]=ipv4.slice(1).map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127));}
  if(require('node:net').isIP(host)===6)return /^2[0-9a-f]{3}:/.test(host);
  return host.includes('.');
 }catch{return false;}
}
async function validate(input){const {normalizeCapabilities}=await capabilities;const caps=normalizeCapabilities(input.modelCapabilities||{}),refs=input.references||[];
 if(!input.model?.trim()||!input.prompt?.trim())throw Error('请填写视频模型编号与提示词');if(!Number.isFinite(Number(input.duration))||Number(input.duration)<=0||Number(input.duration)>3600)throw Error('视频时长无效');
 for(const [k,v] of [['durations',Number(input.duration)],['resolutions',input.resolution],['ratios',input.ratio]]){const list=k==='durations'?(caps.durationByResolution?.[input.resolution]||caps.durations):caps[k];if(list?.length&&!list.includes(v))throw Error('所选视频型号不支持此'+({durations:'时长',resolutions:'分辨率',ratios:'比例'}[k]));}
 for(const [kind,key] of [['image','maxImages'],['video','maxVideos'],['audio','maxAudios']])if(caps[key]!=null&&refs.filter(r=>r.kind===kind).length>caps[key])throw Error('参考素材数量超过模型限制');
 if(refs.filter(r=>r.kind==='image').length<(caps.minImages||0))throw Error('此模型需要更多参考图片');if(caps.maxPrompt&&input.prompt.length>caps.maxPrompt)throw Error('提示词超过模型字符限制');
 if(caps.maxTotalRefs!=null&&refs.length>caps.maxTotalRefs)throw Error('参考素材总数超过模型限制');if(caps.maxVisualRefs!=null&&refs.filter(r=>['image','video'].includes(r.kind)).length>caps.maxVisualRefs)throw Error('图片与视频参考总数超过模型限制');
 if(refs.some(r=>r.kind==='audio')&&caps.audioRequiresImage&&!refs.some(r=>r.kind==='image'))throw Error('音频参考需要图片');
 if(refs.some(r=>r.kind==='audio')&&caps.audioRequiresVisual&&!refs.some(r=>['image','video'].includes(r.kind)))throw Error('音频参考需要图片或视频');
 for(const r of refs)if(!['image','video','audio'].includes(r.kind))throw Error('参考素材类型无效');return caps;
}
async function preflight(input,{allowLocal=false}={}){
 await validate(input);const {protocol,adapter}=await config(input);auth(adapter,input.apiKey);
 const refs=input.references||[];
 if(protocol==='autodl'){
  const {validateAutoDLInput}=await import('../core/autodlVideo.js');validateAutoDLInput(input);
  if(refs.some(r=>!publicHttpsReference(r.url)&&!(allowLocal&&r.filePath)))throw Error('AutoDL 参考素材需要公网HTTPS地址；本地文件会在生成前临时上传');
 }
 if(protocol==='niney'&&refs.some(r=>!publicHttpsReference(r.url)&&!(allowLocal&&r.filePath)))throw Error('9Y 参考素材需要公网 HTTPS 地址；本地文件会在生成前临时上传');
 if(protocol==='niney'&&/^官转wan/i.test(input.model)){
  const videos=refs.filter(r=>r.kind==='video'),durations=videos.map(r=>Number(r.duration??r.seconds));
  if(durations.some(s=>!Number.isFinite(s)||s<1||s>15))throw Error('9Y 的 Wan 视频参考需要填写每段素材时长（1–15 秒）');
  const total=durations.reduce((n,s)=>n+s,0);if(total>15||total+Number(input.duration)>30)throw Error('9Y 官转 Wan 视频参考合计不能超过15秒，参考加生成时长不能超过30秒');
 }
}
async function submit(input){let started=false;try{return await submitPrepared({...input,onSubmissionStart:()=>{started=true;}});}catch(error){if(!started)error.beforeSubmission=true;throw error;}}
async function submitPrepared(input){await preflight(input);const {adapter,base,protocol}=await config(input),refs=input.references||[],headers=auth(adapter,input.apiKey);
 if(protocol==='feituo')headers['X-Public-Model-Ids']='1';
 if(protocol.startsWith('videos-')&&(refs.length>1||refs.some(r=>r.kind!=='image')))throw Error('Videos 兼容预设仅支持一张首帧；多素材协议请按上游文档使用自定义模板');
 if(protocol==='maxforai'&&refs.some(r=>!r.filePath&&!publicHttpsReference(r.url)))throw Error('MaxForAI 远程参考素材必须使用公网 HTTPS 地址；本地文件请通过素材选择器导入');
 if(protocol==='niney'&&refs.some(r=>!publicHttpsReference(r.url)))throw Error(protocol==='autodl'?'AutoDL参考素材需要公网HTTPS地址；本地文件会在生成前临时上传':'9Y 视频只接受公网 HTTPS 素材地址；请先把本地素材上传到可公开访问的存储，再粘贴地址');
 const urls={image:[],video:[],audio:[]};
 for(const r of refs){
  let url=r.url;
  if(adapter.referenceMode==='provider-upload'&&!publicHttpsReference(url))url=await uploadMaxAsset(base,input.apiKey,r,input.signal);
  else if(r.filePath&&adapter.referenceMode==='data-url'){const bytes=await fs.promises.readFile(r.filePath);url=`data:${mime(r)};base64,${bytes.toString('base64')}`;}
  if(adapter.referenceMode==='public-urls'&&!/^https:\/\//i.test(url||''))throw Error(protocol==='autodl'?'AutoDL参考素材需要公网HTTPS地址；本地文件会在生成前临时上传':'9Y 视频只接受公网 HTTPS 素材地址；请先把本地素材上传到可公开访问的存储，再粘贴地址');
  if(adapter.referenceMode!=='multipart'&&r.filePath&&!url)throw Error('此上游需要公网素材链接，请上传到上游或选择支持本地文件的协议');
  if(url&&!/^https?:\/\//i.test(url)&&!url.startsWith('data:'))throw Error('参考素材地址无效');
  if(url)urls[r.kind].push(url);
 }
 const prompt=protocol==='maxforai'?maxPromptAliases(input.prompt):protocol==='niney'?String(input.prompt||'').replace(/@image(\d+)/g,'@图片$1').replace(/@video(\d+)/g,'@视频$1').replace(/@audio(\d+)/g,'@音频$1'):input.prompt;
 const content=[{type:'text',text:prompt},...refs.map((r,i)=>({type:r.kind+'_url',[r.kind+'_url']:{url:urls[r.kind][refs.slice(0,i).filter(p=>p.kind===r.kind).length]},role:r.role||(r.kind==='image'?(refs.filter(r=>r.kind==='image').length>1?'reference_image':'first_frame'):r.kind==='video'?'reference_video':'reference_audio')}))];
 const pixels=String(input.resolution||'720p').match(/^(\d+)p$/i),ratio=String(input.ratio||'16:9').split(':').map(Number),edge=pixels?Number(pixels[1]):720;
 const scaled=ratio[0]>=ratio[1]?`${Math.round(edge*ratio[0]/ratio[1]/2)*2}x${edge}`:`${edge}x${Math.round(edge*ratio[1]/ratio[0]/2)*2}`;
 const size=input.size||(/^\d+x\d+$/.test(input.resolution||'')?input.resolution:scaled);
 const imageReferences=urls.image,audioReferences=urls.audio;
 const videoReferences=urls.video.map((url,index)=>{const ref=refs.filter(r=>r.kind==='video')[index],seconds=Number(ref?.duration??ref?.seconds);return protocol==='niney'&&/^官转wan/i.test(input.model)&&Number.isFinite(seconds)&&seconds>0?{url,duration:seconds}:url;});
 const vars={model:input.model,prompt,ratio:input.ratio,duration:Number(input.duration),seconds:String(input.duration),resolution:input.resolution,size,firstImage:urls.image[0],imageUrls:urls.image,videoUrls:urls.video,audioUrls:urls.audio,imageReferences,videoReferences,audioReferences,content};let body=compact(template(adapter.requestTemplate,vars));
 if(protocol==='autodl')body=(await import('../core/autodlVideo.js')).autodlRequest(input,urls);
 if(protocol==='niney'&&/^官转wan/i.test(input.model)){body.size=String(input.resolution||'1080p').toUpperCase();delete body.resolution;body.reference_images=urls.image.length?urls.image.map((url,i)=>({url,role:refs.filter(r=>r.kind==='image')[i].role||'reference_image'})):undefined;}
 if(adapter.bodyType==='multipart'){const form=new FormData();for(const [k,v] of Object.entries(body))if(v!==undefined)form.append(k,typeof v==='object'?JSON.stringify(v):String(v));for(const r of refs){const field=adapter.fileFields?.[r.kind];if(!field)throw Error('此协议未设置'+r.kind+'文件字段');let bytes,type;if(r.filePath){bytes=await fs.promises.readFile(r.filePath);type=mime(r);}else{const media=await require('./media-network.cjs').readMediaBytes(r.url,{signal:input.signal});bytes=media.bytes;type=media.mime;}form.append(field,new Blob([bytes],{type}),r.filePath?path.basename(r.filePath):r.filename||'reference.'+(r.kind==='image'?'png':r.kind==='video'?'mp4':'mp3'));}body=form;}else{body=JSON.stringify(body);headers['Content-Type']='application/json';}
 let url=endpointUrl(base,adapter.submitPath,{model:input.model});const method=adapter.submitMethod||'POST';if(method==='GET'){if(adapter.bodyType==='multipart')throw Error('GET 提交不支持文件表单，请按上游文档改为 JSON 地址参数');const target=new URL(url);for(const [k,v] of Object.entries(JSON.parse(body)))target.searchParams.set(k,typeof v==='object'?JSON.stringify(v):String(v));url=target.href;body=undefined;delete headers['Content-Type'];}const signal=input.signal?AbortSignal.any([input.signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000);
 // A generation POST is attempted once. Never probe another protocol with it.
 if(adapter.idempotencyHeader&&input.idempotencyKey)headers[adapter.idempotencyHeader]=String(input.idempotencyKey);
 ({url,body}=injectAuthentication(url,body,adapter,input.apiKey));input.onSubmissionStart();const data=await readJson(await fetch(url,{method,headers,body,redirect:'error',signal}),input.apiKey);const result=decode(data,adapter,input.apiKey);if(!result.jobId&&!result.videoUrl)throw Error('提交响应没有任务编号或视频地址，请先核对上游任务，避免重复付费');return result;
}
async function status(input){const {adapter,base,protocol}=await config(input);if(!input.jobId)throw Error('缺少任务编号');if(!adapter.queryPath)throw Error('请配置任务查询路径');let url=endpointUrl(base,adapter.queryPath,{taskId:input.jobId});const vars={taskId:input.jobId};const headers=auth(adapter,input.apiKey);if(protocol==='feituo')headers['X-Public-Model-Ids']='1';const method=adapter.queryMethod||'GET';let body;if(method!=='GET'){headers['Content-Type']='application/json';body=JSON.stringify(template(adapter.queryTemplate||{id:'{{taskId}}'},vars));}else if(adapter.queryTemplate){const target=new URL(url);for(const [k,v] of Object.entries(template(adapter.queryTemplate,vars)))target.searchParams.set(k,String(v));url=target.href;}
 ({url,body}=injectAuthentication(url,body,adapter,input.apiKey));const result=decode(await readJson(await fetch(url,{method,headers,body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)}),input.apiKey),adapter,input.apiKey);
 if(result.status==='success'&&adapter.contentPath&&(adapter.preferContentPath||!result.videoUrl))result.videoUrl=endpointUrl(base,adapter.contentPath,{taskId:input.jobId});
 return result;
}
async function download(job,apiKey,dir){const {adapter,base}=await config(job);let url=job.url;if(!url)throw Error('任务完成但上游尚未返回视频地址');
 const publicDownload=async address=>{const {bytes,mime}=await require('./media-network.cjs').readMediaBytes(address,{timeoutMs:120000});if(mime&& !/^(video\/|application\/octet-stream)/.test(mime))throw Error('上游结果返回了非视频文件，请重新查询下载');await fs.promises.mkdir(dir,{recursive:true});const file=path.join(dir,'video-'+Date.now()+'-'+require('node:crypto').randomUUID()+'.mp4');await fs.promises.writeFile(file,bytes);return file;};
 const own=adapter.contentPath&&url===endpointUrl(base,adapter.contentPath,{taskId:job.jobId});
 if(!own)return publicDownload(url);
 // Protected content endpoints may redirect to a CDN. Credentials stay at origin.
 const protectedUrl=injectAuthentication(url,undefined,adapter,apiKey).url;const response=await fetch(protectedUrl,{headers:auth(adapter,apiKey),redirect:'manual',signal:AbortSignal.timeout(120000)});
 if([301,302,303,307,308].includes(response.status)){const next=new URL(response.headers.get('location'),url).href;await response.body?.cancel();return publicDownload(next);}
 const mime=response.headers.get('content-type')||'';if(!response.ok||!/video\/|application\/octet-stream/.test(mime))throw Error('视频内容尚不可下载，请重试查询下载');const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length)throw Error('视频文件为空');await fs.promises.mkdir(dir,{recursive:true});const file=path.join(dir,'video-'+Date.now()+'-'+require('node:crypto').randomUUID()+'.mp4');await fs.promises.writeFile(file,bytes);return file;
}
module.exports={submit,status,download,validate,preflight,config,template,endpointUrl,getValue};

// 图片 / 视频生成服务：兼容 OpenAI 格式与火山方舟（即梦/Seedance）格式
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {winAIFetch:fetch}=require('./win-ai-api-fetch.cjs');
const { readMediaBytes, isMediaNetworkError } = require('./media-network.cjs');
const {validateGeneratedImage}=require('./generated-image.cjs');
const requestSignal=(signal,timeout)=>signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
function waitForPoll(delay,signal){
 if(!signal)return new Promise(resolve=>setTimeout(resolve,delay));
 signal.throwIfAborted();return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delay);
  signal.addEventListener('abort',abort,{once:true});
 });
}

function normalizeBase(endpoint = '') {
  return String(endpoint).trim().replace(/\/+$/, '')
    .replace(/\/images\/(?:generations|edits)$/, '')
    .replace(/\/contents\/generations\/tasks$/, '');
}

function authHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`接口返回异常：${text.slice(0, 160) || '空响应'}`); }
}

function isFeituoEndpoint(endpoint = '') {
  try { return new URL(endpoint).hostname === 'feituokuajing.com'; } catch { return false; }
}
function buildFeituoVideoPayload({ model, prompt, ratio, duration, resolution, imageUrls = [], videoUrls = [], audioUrls = [] }) {
  return { model: String(model || '').trim(), prompt: String(prompt || '').trim(), ratio, duration, ...(resolution ? { resolution } : {}), imageUrls, videoUrls, audioUrls };
}
function parseFeituoStatus(data) {
  const status = String(data?.status || '').toLowerCase();
  if (['success', 'succeeded', 'completed'].includes(status)) {
    if (!data.videoUrl) throw new Error('飞拓任务完成但没有返回视频地址');
    return { state: 'success', url: data.videoUrl };
  }
  if (['failed', 'cancelled', 'canceled', 'error'].includes(status)) throw new Error(data.errorMessage || '视频生成失败');
  return { state: 'pending', jobId: data?.jobId || '' };
}
async function generateFeituoVideo({ apiKey, model, prompt, ratio, duration, resolution, imageUrls = [], destDir, signal, onStatus = () => {} }) {
  if (!apiKey?.trim()) throw new Error('请在 API 接口中填写飞拓 API Key');
  if (!model?.trim()) throw new Error('请先选择飞拓视频模型');
  const base = 'https://feituokuajing.com';
  const auth = `Bearer ${apiKey.trim()}`;
  const create = await fetch(`${base}/api/open/v1/video/generate`, { method: 'POST', headers: { Authorization: auth, 'X-Public-Model-Ids': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(buildFeituoVideoPayload({ model, prompt, ratio, duration, resolution, imageUrls })), redirect:'error', signal: requestSignal(signal,120000) });
  const submitted = await readJson(create);
  if (!create.ok || submitted.success === false) throw new Error(submitted.error || submitted.errorMessage || `飞拓提交失败（${create.status}）`);
  if (!submitted.jobId) throw new Error('飞拓接口未返回 jobId');
  onStatus('submitted');
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    await waitForPoll(15000,signal);
    const response = await fetch(`${base}/api/open/v1/video/status?jobId=${encodeURIComponent(submitted.jobId)}&_=${Date.now()}`, { cache: 'no-store', redirect:'error', headers: { Authorization: auth, 'X-Public-Model-Ids': '1', 'Cache-Control': 'no-cache' }, signal: requestSignal(signal,60000) });
    const result = await readJson(response);
    if (!response.ok || result.success === false) throw new Error(result.error || result.errorMessage || `飞拓状态查询失败（${response.status}）`);
    const parsed = parseFeituoStatus(result); onStatus(parsed.state);
    if (parsed.state === 'success') return downloadToFile(parsed.url, destDir, 'mp4',{signal});
  }
  throw new Error('飞拓视频生成超时，请稍后在任务记录中查看');
}

async function downloadToFile(url, destDir, ext,{verifyImage=false,fileName,signal}={}) {
  signal?.throwIfAborted();
  const file = path.join(destDir, fileName||`${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`);
  const bytes=url.startsWith('data:')?Buffer.from(url.split(',')[1]||'','base64'):(await readMediaBytes(url, { timeoutMs: ext === 'mp4' ? 120000 : 60000,signal })).bytes;
  if(verifyImage)await validateGeneratedImage(bytes);
  signal?.throwIfAborted();
  const temporary=file+'.'+crypto.randomBytes(4).toString('hex')+'.part';
  try{await fs.promises.mkdir(destDir,{recursive:true});await fs.promises.writeFile(temporary,bytes,{signal});signal?.throwIfAborted();await require('./atomic-json.cjs').renameWithRetry(temporary,file,{signal});return file;}
  catch(error){await fs.promises.unlink(temporary).catch(()=>{});if(verifyImage)error.imageVerified=true;throw error;}
}

function imageReceiptPath(receiptId, destDir) {
  if (!/^[a-f0-9-]{36}$/.test(String(receiptId))) throw new Error('图片恢复记录无效');
  return path.join(destDir, '.pending-image-downloads', `${receiptId}.json`);
}

const pendingImageDownloads = new Map();
async function writeImageReceipt(file,receipt){
 await require('./atomic-json.cjs').writeJsonAtomic(file,receipt);
}
async function pendingImageSource(receiptId,destDir){
 let receipt;try{receipt=JSON.parse(await fs.promises.readFile(imageReceiptPath(receiptId,destDir),'utf8'));}catch{throw new Error('图片结果记录不存在，请检查本地资料目录');}
 if(!/^https?:\/\//i.test(receipt.source))throw new Error('该结果为内嵌图片，请继续保存或手动上传');
 return receipt.source;
}
async function pruneImageDownloadReceipts(destDir,{now=Date.now()}={}){
 const folder=path.join(destDir,'.pending-image-downloads');
 try{
  const root=await fs.promises.lstat(folder);
  if(!root.isDirectory()||root.isSymbolicLink())return;
 }catch(error){if(error.code==='ENOENT')return;throw error;}
 for(const entry of await fs.promises.readdir(folder,{withFileTypes:true})){
  if(!entry.isFile()||!(/^[a-f0-9-]{36}\.json(?:\.tmp)?$/.test(entry.name)))continue;
  const file=path.join(folder,entry.name);
  try{
   if(entry.name.endsWith('.tmp')){
    if(now-(await fs.promises.stat(file)).mtimeMs>86400000)await fs.promises.unlink(file);
    continue;
   }
   if(pendingImageDownloads.has(file))continue;
   const image='image-result-'+entry.name.slice(0,-5)+'.png';
   const imageFile=path.join(destDir,image);
   const stat=await fs.promises.lstat(imageFile,{bigint:true});
   if(!stat.isFile()||!stat.size)continue;
   const handle=await fs.promises.open(file,'r'),head=Buffer.alloc(32);
   try{await handle.read(head);}finally{await handle.close();}
   if(!head.toString('ascii').startsWith('{"source":"data:'))continue;
   const receipt=JSON.parse(await fs.promises.readFile(file,'utf8'));
   if(!receipt.verified||receipt.downloadedFile!==image||!/^data:[^,]*;base64,/i.test(receipt.source)||pendingImageDownloads.has(file))continue;
   const {source,...metadata}=receipt;
   const expected=Buffer.from(source.slice(source.indexOf(',')+1),'base64');
   if(BigInt(expected.length)!==stat.size)continue;
   const [onDisk,original]=await Promise.all([
    require('./file-digest.cjs').sha256File(imageFile),
    crypto.subtle.digest('SHA-256',expected)
   ]);
   if(onDisk!==Buffer.from(original).toString('hex'))continue;
   const current=await fs.promises.lstat(imageFile,{bigint:true});
   if(!current.isFile()||current.ino!==stat.ino||current.size!==stat.size||current.mtimeNs!==stat.mtimeNs||current.ctimeNs!==stat.ctimeNs||pendingImageDownloads.has(file))continue;
   await require('./atomic-json.cjs').writeJsonAtomic(file,metadata);
  }catch(error){if(!['ENOENT','EPERM','EBUSY'].includes(error.code)&&!(error instanceof SyntaxError))throw error;}
 }
}
function retryImageDownload(receiptId, destDir, {signal} = {}) {
  signal?.throwIfAborted();
  const receiptPath = imageReceiptPath(receiptId, destDir);
  const active=pendingImageDownloads.get(receiptPath);
  if(active&&!active.signal?.aborted&&active.signal===signal)return active.work;
  if(active)return active.work.catch(()=>{}).then(()=>retryImageDownload(receiptId,destDir,{signal}));
  const work = (async () => {
    let receipt;
    try { receipt = JSON.parse(await fs.promises.readFile(receiptPath, 'utf8')); }
    catch { throw new Error('已保存的图片结果记录不存在，请先检查本地资料目录'); }
    try {
      // A stable filename closes the crash gap between writing bytes and sending
      // the IPC result. Never fetch or generate again if verified bytes exist.
      const fileName=`image-result-${receiptId}.png`,cached=path.join(destDir,fileName);
      try{await validateGeneratedImage(await fs.promises.readFile(cached,{signal}));signal?.throwIfAborted();return cached;}
      catch(error){if(!['ENOENT','IMAGE_CONTENT_INVALID'].includes(error.code))throw error;}
      if(!receipt.source)throw Error('已保存的本机图片不存在或损坏');
      const filePath = await downloadToFile(receipt.source, destDir, 'png',{verifyImage:true,fileName,signal});
      const {source,...metadata}=receipt;
      try{await writeImageReceipt(receiptPath,{...metadata,...(/^https?:\/\//i.test(source)?{source}:{}),verified:true,downloadedFile:fileName,verifiedAt:new Date().toISOString(),lastFailure:null});}catch{/* The stable file can be recovered without changing the original receipt. */}
      return filePath;
    } catch (cause) {
      signal?.throwIfAborted();
      const reason=cause.status?'upstream':['IMAGE_CONTENT_INVALID','MEDIA_CONTENT_EMPTY'].includes(cause.code)?'invalid':isMediaNetworkError(cause)||isMediaNetworkError(cause.cause)?'network':'save';
      const unavailable=[401,403,404,410].includes(cause.status)||/不存在|已过期|not found|expired/i.test(cause.upstreamMessage||'');
      const advice=reason==='upstream'?(unavailable?'上游表示源图片不存在、过期或拒绝访问；这不是本地磁盘故障。可打开结果地址核对，仍不可用时主动放弃旧结果后再生成。':'上游结果地址下载失败，可稍后重试取回原图，或在浏览器核对。'):reason==='invalid'?'尚未确认生成了可显示的图片，请核对上游结果；不会把错误网页保存为图片。':reason==='network'?'请检查系统代理或网络；可在浏览器打开原结果后上传。':'请检查本地资料目录、磁盘空间或权限后继续保存。';
      const verified=Boolean(cause.imageVerified);
      try{await writeImageReceipt(receiptPath,{...receipt,lastFailure:{reason,httpStatus:cause.status,upstreamCode:cause.upstreamCode,upstreamMessage:cause.upstreamMessage,verified,at:new Date().toISOString()}});}catch{}
      throw Object.assign(new Error(`${verified?'已验证图片，但本地保存未完成':'接口已返回结果，尚未取回有效图片'}：${cause.message}。${advice} 不会自动重新生图。`), {
        cause, code: 'IMAGE_DOWNLOAD_PENDING', downloadReceiptId: receiptId, downloadReason:reason,httpStatus:cause.status,upstreamCode:cause.upstreamCode,imageVerified:verified,
      });
    }
  })().finally(() => {if(pendingImageDownloads.get(receiptPath)?.work===work)pendingImageDownloads.delete(receiptPath);});
  pendingImageDownloads.set(receiptPath, {work,signal});
  return work;
}

async function saveGeneratedImage(source, destDir, {signal} = {}) {
  const receiptId = crypto.randomUUID();
  const receiptPath = imageReceiptPath(receiptId, destDir);
  await fs.promises.mkdir(path.dirname(receiptPath), { recursive: true });
  // Save the provider result before downloading it. No API key is recorded.
  await writeImageReceipt(receiptPath,{source,createdAt:new Date().toISOString()});
  return retryImageDownload(receiptId, destDir,{signal});
}

async function imageReferenceFile(reference, index, signal) {
  if (reference.kind && reference.kind !== 'image') throw new Error('图片生成仅支持图片参考');
  const source = reference.filePath || reference.url || '';
  let bytes, mime = '';
  if (reference.filePath) {
    bytes = await fs.promises.readFile(reference.filePath,{signal}).catch(() => { signal?.throwIfAborted();throw new Error('参考图片无法读取，请重新选择图片'); });
  } else if (/^data:image\/(png|jpeg|webp);base64,/i.test(source)) {
    mime = source.slice(5, source.indexOf(';')).toLowerCase();
    bytes = Buffer.from(source.slice(source.indexOf(',') + 1), 'base64');
  } else if (/^https?:\/\//i.test(source)) {
    // Reference hosts must never receive the generation provider's API key.
    const downloaded = await readMediaBytes(source, { label: '参考图片读取',signal });
    mime = downloaded.mime;
    bytes = downloaded.bytes;
  } else throw new Error('参考图片缺少有效地址，请重新选择图片');
  if (!bytes.length) throw new Error('参考图片为空，请重新选择图片');
  // Object storage may return application/octet-stream; identify actual image bytes.
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
  else if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') mime = 'image/webp';
  if (!['image/png','image/jpeg','image/webp'].includes(mime)) throw new Error('参考图片需为 PNG、JPEG 或 WebP 格式');
  return { blob: new Blob([bytes], { type: mime }), name: `reference-${index + 1}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}` };
}

// OpenAI-compatible APIs use multipart /images/edits when reference images are supplied.
// https://developers.openai.com/api/reference/resources/images/methods/edit
async function generateImage({ provider, endpoint, apiKey, model, prompt, size = '1024x1024', ratio, resolution, references = [], destDir, signal }) {
  if(provider==='codexLocalImage')return require('./codex-image.cjs').generateCodexImage({model,prompt,size,ratio,references,destDir,signal});
  if (!endpoint?.trim()) throw new Error('请先在画布中配置图片生成 API');
  if (!prompt?.trim()) throw new Error('请填写画面描述');
  if (!model?.trim()) throw new Error('请先在 API 接口中填写图片模型名称');
  if(require('./fnko-client.cjs').isFnkoEndpoint(endpoint))return require('./fnko-client.cjs').generateImage({endpoint,apiKey,model,prompt,ratio,resolution:resolution||size,references,destDir,signal});
  if(isFeituoEndpoint(endpoint)) {
    const sizes={'1024x1024':'1:1','1280x720':'16:9','720x1280':'9:16','1024x768':'4:3','768x1024':'3:4','1152x768':'3:2','768x1152':'2:3'};
    const result=await require('./feituo-client.cjs').submit({kind:'image',apiKey,model,prompt,ratio:ratio||sizes[size]||'auto',references,signal});
    if(!result.resultUrls?.length)throw new Error('飞拓没有返回图片结果');
    return saveGeneratedImage(result.resultUrls[0],destDir,{signal});
  }
  const base = normalizeBase(endpoint);
  if((await import('../core/videoProviderConfig.js')).isMuseLocal(endpoint)){size=ratio||({'1024x1024':'1:1','1280x720':'16:9','720x1280':'9:16','1024x768':'4:3','768x1024':'3:4'}[size])||'1:1';}
  const headers = authHeaders(apiKey);
  let body;
  if (references.length) {
    body = new FormData();
    for (const [key, value] of Object.entries({ model: model.trim(), prompt: prompt.trim(), size, n: 1 })) body.append(key, String(value));
    for (const [index, reference] of references.entries()) {
      const file = await imageReferenceFile(reference, index,signal);
      body.append(references.length === 1 ? 'image' : 'image[]', file.blob, file.name);
    }
    // fetch adds the multipart boundary; GPT Image edits return base64 by default.
    delete headers['Content-Type'];
  } else {
    const inline=/^(?:gpt-image|dall-e)/i.test(model.trim());
    const officialGpt=/^gpt-image/i.test(model.trim())&&new URL(base).hostname==='api.openai.com';
    body=JSON.stringify({model:model.trim(),prompt:prompt.trim(),size,n:1,...(officialGpt?{}:{response_format:inline?'b64_json':'url'})});
  }
  let response, data;
  try {
    response = await fetch(`${base}/images/${references.length ? 'edits' : 'generations'}`, {
      method: 'POST', headers, body, signal: requestSignal(signal,300000),
    });
    data = await readJson(response);
  } catch (cause) {
    if (isMediaNetworkError(cause)) throw Object.assign(new Error('生图接口连接中断或超时，未收到完整生成结果。服务商可能已计费，请先核对任务记录后再生成。'), { cause });
    throw cause;
  }
  if (!response.ok) {
    const reason = data?.error?.message || data?.message || `图片接口请求失败（${response.status}）`;
    throw new Error(references.length ? `参考图生成失败（HTTP ${response.status}）：${reason}` : reason);
  }
  const item = data?.data?.[0] || {};
  const url = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url || '';
  if (!url) throw new Error('接口已响应，但没有返回图片');
  return await saveGeneratedImage(url, destDir,{signal});
}

// ---------- 视频生成（火山方舟 Seedance 任务式 API，同时兼容一次性返回） ----------
function buildVideoContent({ prompt, ratio, duration, resolution, audioEnabled, firstFrameDataUrl, firstFrameUrl }) {
  let text = prompt.trim();
  if (ratio) text += ` --ratio ${ratio}`;
  if (duration) text += ` --duration ${duration}`;
  if (resolution) text += ` --resolution ${resolution}`;
  if (typeof audioEnabled === 'boolean') text += ` --audio ${audioEnabled ? 'on' : 'off'}`;
  const content = [{ type: 'text', text }];
  const frame = firstFrameDataUrl || firstFrameUrl;
  if (frame) content.push({ type: 'image_url', image_url: { url: frame }, role: 'first_frame' });
  return content;
}

async function generateVideo({ endpoint, apiKey, model, prompt, ratio, duration, resolution, audioEnabled, firstFramePath, firstFrameUrl, references = [], destDir, signal, onStatus = () => {} }) {
  if((await import('../core/videoProviderConfig.js')).isMuseLocal(endpoint)){const provider=require('./video-provider.cjs');const input={endpoint,apiKey,model,prompt,ratio:ratio||'16:9',duration:duration||5,resolution:resolution||'720p',references:references.length?references:firstFramePath?[{kind:'image',filePath:firstFramePath}]:firstFrameUrl?[{kind:'image',url:firstFrameUrl}]:[],signal};let result=await provider.submit(input);const deadline=Date.now()+20*60*1000;while(!['success','failed'].includes(result.status)&&Date.now()<deadline){await waitForPoll(5000,signal);result=await provider.status({...input,jobId:result.jobId});onStatus(result.status);}if(result.status==='failed')throw Error(result.errorMessage||'Muse 视频生成失败');if(result.status!=='success')throw Error('Muse 视频仍在处理，请在号池核对原任务，避免重复提交');return provider.download({...input,jobId:result.jobId,url:result.videoUrl},apiKey,destDir);}

  if (!endpoint?.trim()) throw new Error('请先在画布中配置视频生成 API');
  if (!prompt?.trim()) throw new Error('请填写视频描述');
  if(references.length>1 || references.some(r=>r.kind!=='image'))throw new Error('当前自定义视频接口仅支持一张首帧参考，请切换飞拓接口使用多素材参考');
  firstFramePath=firstFramePath||references[0]?.filePath;firstFrameUrl=firstFrameUrl||references[0]?.url;
  const feituo=isFeituoEndpoint(endpoint);
  let firstFrameDataUrl = '';
  if(firstFramePath&&!(feituo&&firstFrameUrl)){
    try{
      const bytes=await fs.promises.readFile(firstFramePath,{signal});
      const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(firstFramePath).toLowerCase()]||'image/png';
      firstFrameDataUrl=`data:${mime};base64,${bytes.toString('base64')}`;
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(feituo)return generateFeituoVideo({ apiKey, model, prompt, ratio, duration, resolution, onStatus, destDir, signal, imageUrls: [firstFrameUrl||firstFrameDataUrl].filter(Boolean) });
  const base=normalizeBase(endpoint);
  const createResponse = await fetch(`${base}/contents/generations/tasks`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model: model?.trim() || undefined, audio: audioEnabled, content: buildVideoContent({ prompt, ratio, duration, resolution, audioEnabled, firstFrameDataUrl, firstFrameUrl }) }),
    signal: requestSignal(signal,120000),
  });
  const created = await readJson(createResponse);
  if (!createResponse.ok) throw new Error(created?.error?.message || created?.message || `视频接口请求失败（${createResponse.status}）`);
  // 一次性返回视频地址的兼容分支
  const direct = created?.content?.video_url || created?.data?.[0]?.url;
  if (direct) return await downloadToFile(direct, destDir, 'mp4',{signal});
  const taskId = created?.id || created?.task_id;
  if (!taskId) throw new Error('接口未返回任务 ID，无法查询视频生成进度');
  // 轮询任务状态
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await waitForPoll(5000,signal);
    const pollResponse = await fetch(`${base}/contents/generations/tasks/${encodeURIComponent(taskId)}`, { headers: authHeaders(apiKey), redirect:'error', signal: requestSignal(signal,60000) });
    const task = await readJson(pollResponse);
    if (!pollResponse.ok) throw new Error(task?.error?.message || `任务查询失败（${pollResponse.status}）`);
    const status = String(task.status || '').toLowerCase();
    onStatus(status);
    if (['succeeded', 'success', 'completed'].includes(status)) {
      const url = task?.content?.video_url || task?.outputs?.[0]?.url || task?.result?.video_url;
      if (!url) throw new Error('任务已完成，但没有返回视频地址');
      return await downloadToFile(url, destDir, 'mp4',{signal});
    }
    if (['failed', 'cancelled', 'canceled', 'error'].includes(status)) {
      throw new Error(task?.error?.message || task?.failure_reason || '视频生成任务失败');
    }
  }
  throw new Error('视频生成超时（10 分钟），请稍后在服务商控制台查看任务');
}

module.exports = { imageReferenceFile, saveGeneratedImage, downloadToFile, retryImageDownload, pendingImageSource,pruneImageDownloadReceipts, generateImage, generateVideo, normalizeBase, buildVideoContent, buildFeituoVideoPayload, parseFeituoStatus };

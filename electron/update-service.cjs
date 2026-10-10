const fs=require('fs');const path=require('path');const crypto=require('node:crypto');const {pipeline}=require('stream/promises');const {Readable,Transform}=require('stream');
const {createProgressReporter}=require('./update-progress.cjs');
const {assertDownloadUrl}=require('./update-trust.cjs');
function safeName(version){return `Xingzhou-Film-Setup-${String(version).replace(/[^0-9A-Za-z._-]/g,'')}.exe`}
async function trustedDownload(url,fetchImpl,options={}){
 for(let redirects=0;redirects<=5;redirects++){
  assertDownloadUrl(url);
  const response=await fetchImpl(url,{redirect:'manual',cache:'no-store',...options,signal:options.signal||AbortSignal.timeout(1800000)});
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();const location=response.headers.get('location');if(!location)throw new Error('更新下载跳转无效');url=new URL(location,url).toString();continue;}
  if(response.url)assertDownloadUrl(response.url);
  if(!response.ok)throw new Error(`安装包下载失败：${response.status}`);
  return response;
 }
 throw new Error('更新下载跳转次数过多');
}
async function verifyInstaller(file,manifest){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==manifest.size)throw new Error('安装包大小校验失败，请重新下载');
 const hash=crypto.createHash('sha256');let count=0;const header=Buffer.alloc(2);
 for await(const chunk of fs.createReadStream(file)){if(count===0)chunk.copy(header,0,0,2);count+=chunk.length;hash.update(chunk);}
 if(count!==manifest.size||hash.digest('hex')!==manifest.sha256)throw new Error('安装包完整性校验失败，请重新下载');
 if(header[0]!==0x4d||header[1]!==0x5a)throw new Error('更新文件不是有效的 Windows 安装包');
 return true;
}
async function downloadInstaller({url,version,sha256,size,destinationDir,onProgress,fetchImpl=fetch,mirrors=[],attempts=3,idleMs=90000,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!/^https:\/\//i.test(url))throw new Error('安装包地址必须使用 HTTPS');
 assertDownloadUrl(url);
 if(!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(size)||size<64||size>512*1024*1024)throw new Error('安装包缺少可信校验信息');
 fs.mkdirSync(destinationDir,{recursive:true});const target=path.join(destinationDir,safeName(version)),temp=target+'.'+sha256+'.part';
 const manifest={sha256,size};try{await verifyInstaller(target,manifest);return target;}catch{}
 const sources=[...mirrors,url];sources.forEach(assertDownloadUrl);
 const report=createProgressReporter(onProgress);let lastError;
 for(const source of sources)for(let attempt=0;attempt<attempts;attempt++){
  const controller=new AbortController();let idle;
  const resetIdle=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(new Error('下载连接空闲超时')),idleMs);};
  try{
   let transferred=fs.existsSync(temp)?fs.statSync(temp).size:0;if(transferred>=size){try{await verifyInstaller(temp,manifest);fs.renameSync(temp,target);report({transferred:size,total:size},true);return target;}catch{fs.unlinkSync(temp);transferred=0;}}
   resetIdle();const response=await trustedDownload(source,fetchImpl,{headers:transferred?{Range:'bytes='+transferred+'-'}:{},signal:controller.signal});
   if(response.status===206){const range=String(response.headers.get('content-range')||'').match(/^bytes (\d+)-(\d+)\/(\d+)$/);if(!range||Number(range[1])!==transferred||Number(range[3])!==size||Number(range[2])>=size){await response.body?.cancel();throw new Error('安装包断点范围无效');}}
   else if(response.status===200){transferred=0;}else throw new Error('安装包响应状态无效');
   const progress=new Transform({transform(chunk,_enc,cb){resetIdle();transferred+=chunk.length;if(transferred>size)return cb(new Error('安装包超过签名清单大小'));report({transferred,total:size});cb(null,chunk);}});
   await pipeline(Readable.fromWeb(response.body),progress,fs.createWriteStream(temp,{flags:response.status===206?'a':'w',mode:0o600}));
   await verifyInstaller(temp,manifest);fs.renameSync(temp,target);report({transferred,total:size},true);return target;
  }catch(e){lastError=e;
   // Only interrupted transfers are resumable. Bad size/hash/ranges are purged.
   const network=controller.signal.aborted||e.code==='ERR_STREAM_PREMATURE_CLOSE'||require('./media-network.cjs').isMediaNetworkError(e);
   if(!network){try{fs.unlinkSync(temp);}catch{}if(/非可信地址|HTTPS/.test(e.message))throw e;}
   if(attempt+1<attempts)await sleep(400*(attempt+1));
  }finally{clearTimeout(idle);controller.abort();}
 }
 throw new Error('更新下载未完成，已尝试官方备用线路；网络中断时已保留下载进度，再次点击可继续。'+(lastError?.message||''));
}
module.exports={downloadInstaller,safeName,verifyInstaller,trustedDownload};

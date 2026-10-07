const fs=require('fs');const path=require('path');const crypto=require('node:crypto');const {pipeline}=require('stream/promises');const {Readable,Transform}=require('stream');
const {createProgressReporter}=require('./update-progress.cjs');
const {assertDownloadUrl}=require('./update-trust.cjs');
function safeName(version){return `Xingzhou-Film-Setup-${String(version).replace(/[^0-9A-Za-z._-]/g,'')}.exe`}
async function trustedDownload(url,fetchImpl){
 for(let redirects=0;redirects<=5;redirects++){
  assertDownloadUrl(url);
  const response=await fetchImpl(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(120000)});
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
async function downloadInstaller({url,version,sha256,size,destinationDir,onProgress,fetchImpl=fetch}){
 if(!/^https:\/\//i.test(url))throw new Error('安装包地址必须使用 HTTPS');
 if(!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(size)||size<64||size>512*1024*1024)throw new Error('安装包缺少可信校验信息');
 fs.mkdirSync(destinationDir,{recursive:true});const target=path.join(destinationDir,safeName(version));const temp=target+'.download';
 const response=await trustedDownload(url,fetchImpl);
 const total=size;let transferred=0;const report=createProgressReporter(onProgress);
 const progress=new Transform({transform(chunk,_enc,cb){transferred+=chunk.length;if(transferred>size)return cb(new Error('安装包超过签名清单大小'));report({transferred,total});cb(null,chunk)}});
 try{await pipeline(Readable.fromWeb(response.body),progress,fs.createWriteStream(temp,{flags:'w',mode:0o600}));await verifyInstaller(temp,{sha256,size});fs.renameSync(temp,target);report({transferred,total},true);return target}catch(e){try{fs.unlinkSync(temp)}catch{}throw e}
}
module.exports={downloadInstaller,safeName,verifyInstaller,trustedDownload};

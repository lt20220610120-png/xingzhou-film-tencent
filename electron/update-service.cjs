const fs=require('fs');const path=require('path');const {pipeline}=require('stream/promises');const {Readable,Transform}=require('stream');
const {createProgressReporter}=require('./update-progress.cjs');
function safeName(version){return `Xingzhou-Film-Setup-${String(version).replace(/[^0-9A-Za-z._-]/g,'')}.exe`}
async function downloadInstaller({url,version,destinationDir,onProgress,fetchImpl=fetch}){
 if(!/^https:\/\//i.test(url))throw new Error('安装包地址必须使用 HTTPS');
 fs.mkdirSync(destinationDir,{recursive:true});const target=path.join(destinationDir,safeName(version));const temp=target+'.download';
 const response=await fetchImpl(url,{redirect:'follow',cache:'no-store'});if(!response.ok)throw new Error(`安装包下载失败：${response.status}`);
 const total=Number(response.headers.get('content-length')||0);let transferred=0;const report=createProgressReporter(onProgress);
 const progress=new Transform({transform(chunk,_enc,cb){transferred+=chunk.length;report({transferred,total});cb(null,chunk)}});
 try{await pipeline(Readable.fromWeb(response.body),progress,fs.createWriteStream(temp));fs.renameSync(temp,target);report({transferred,total:total||transferred},true);return target}catch(e){try{fs.unlinkSync(temp)}catch{}throw e}
}
module.exports={downloadInstaller,safeName};

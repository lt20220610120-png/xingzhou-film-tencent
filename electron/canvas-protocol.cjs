const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {verifiedDataFile}=require('./workspace-file.cjs');

function createCanvasProtocolHandler({appDir,fetchFile,runtime}){
 return async request=>{
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
  let relative;
  try{
   const url=new URL(request.url);
   if(url.protocol!=='xzapp:'||url.host!=='canvas'||url.username||url.password)return new Response(null,{status:403});
   relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
  }catch{return new Response(null,{status:400});}
  if(relative.split('/').some(part=>part==='..'||part==='.')||/[\\:%\x00-\x1f]/.test(relative)||path.isAbsolute(relative))return new Response(null,{status:403});
  try{
   if(relative==='config.js')return new Response(request.method==='HEAD'?null:runtime(),{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});
   const file=await verifiedDataFile(path.resolve(appDir,relative),appDir);
   return await fetchFile(pathToFileURL(file).href,{method:request.method});
  }catch(error){
   if(['ENOENT','ENOTDIR'].includes(error.code))return new Response(null,{status:404});
   return new Response(null,{status:403});
  }
 };
}
module.exports={createCanvasProtocolHandler};

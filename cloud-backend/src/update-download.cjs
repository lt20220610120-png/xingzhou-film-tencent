const fs=require('node:fs'),path=require('node:path');
function serveUpdate(request,response,root='/opt/xingzhou-updates'){
 if(request.method!=='GET'&&request.method!=='HEAD')return false;
 const url=new URL(request.url,'http://localhost');if(!url.pathname.startsWith('/api/updates/'))return false;
 const name=url.pathname.slice('/api/updates/'.length);
 if(!/^(latest\.json|Xingzhou-Film-Tencent-Setup-\d+\.\d+\.\d+\.exe)$/.test(name)){response.writeHead(404);response.end();return true;}
 const file=path.join(root,name);let stat;try{stat=fs.lstatSync(file);}catch{response.writeHead(404);response.end();return true;}
 if(!stat.isFile()||stat.isSymbolicLink()){response.writeHead(404);response.end();return true;}
 const etag='"'+stat.size+'-'+stat.mtimeMs+'"';let start=0,end=stat.size-1,status=200;
 if(name!=='latest.json'&&request.headers.range&&(!request.headers['if-range']||request.headers['if-range']===etag)){
  const range=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range);if(!range||Number(range[1])>=stat.size||(range[2]&&Number(range[2])<Number(range[1]))){response.writeHead(416,{'Content-Range':'bytes */'+stat.size});response.end();return true;}
  start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;status=206;
 }
 response.writeHead(status,{'Content-Type':name==='latest.json'?'application/json; charset=utf-8':'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes',ETag:etag,'Cache-Control':name==='latest.json'?'no-store':'public, max-age=31536000, immutable',...(status===206?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
 if(request.method==='HEAD'){response.end();return true;}
 const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);return true;
}
module.exports={serveUpdate};

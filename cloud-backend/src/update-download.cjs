const fs = require('node:fs');
const path = require('node:path');

const PREFIX = '/api/updates/';
const NAME = /^(latest\.json|Xingzhou-Film-Tencent-Setup-\d+\.\d+\.\d+\.exe)$/;

function serveUpdate(request,response,root='/opt/xingzhou-updates'){
  if (request.method!=='GET'&&request.method!=='HEAD') return false;
  const pathname = request.url?.split('?')[0];
  if (!pathname?.startsWith(PREFIX)) return false;
  const reject = (status,headers) => { response.writeHead(status,headers);response.end();return true; };
  const name = pathname.slice(PREFIX.length);
  if (!NAME.test(name)) return reject(404);

  let fd, stat;
  try {
    const file = path.join(root,name);
    const before = fs.lstatSync(file);
    if (!before.isFile()||before.isSymbolicLink()) return reject(404);
    fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));
    stat=fs.fstatSync(fd);
    if (!stat.isFile()||stat.size===0||stat.dev!==before.dev||stat.ino!==before.ino) {
      fs.closeSync(fd);
      return reject(404);
    }
  } catch {
    if (fd!==undefined) fs.closeSync(fd);
    return reject(404);
  }

  const manifest=name==='latest.json';
  const etag='"'+stat.size+'-'+stat.mtimeMs+'"';
  let start=0,end=stat.size-1,status=200;
  const {range,'if-range':ifRange}=request.headers;
  if (!manifest&&range&&(!ifRange||ifRange===etag)) {
    const match=/^bytes=(\d+)-(\d*)$/.exec(range);
    const first=Number(match?.[1]),last=match?.[2]?Number(match[2]):end;
    if (!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first>=stat.size||last<first) {
      fs.closeSync(fd);
      return reject(416,{'Content-Range':'bytes */'+stat.size});
    }
    start=first;
    end=Math.min(last,end);
    status=206;
  }

  response.writeHead(status,{
    'Content-Type':manifest?'application/json; charset=utf-8':'application/octet-stream',
    'Content-Length':end-start+1,
    'Accept-Ranges':'bytes',
    ETag:etag,
    'Cache-Control':manifest?'no-store':'public, max-age=31536000, immutable',
    ...(status===206?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{}),
  });
  if (request.method==='HEAD') {
    fs.closeSync(fd);
    response.end();
    return true;
  }
  const stream=fs.createReadStream(null,{fd,start,end});
  stream.on('error',()=>response.destroy());
  response.on('close',()=>stream.destroy());
  stream.pipe(response);
  return true;
}

module.exports={serveUpdate};

const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');

// Standard origins are required for Chromium's MP4 demuxer to seek to a tail moov atom.
const LOCAL_MEDIA_PRIVILEGES={standard:true,secure:true,supportFetchAPI:true,stream:true};
const types={'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.flac':'audio/flac','.ogg':'audio/ogg','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
const inside=(root,file)=>{const relative=path.relative(root,file);return !!relative&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};
function createLocalMediaHandler(getDataDir,allowFile=()=>true){
 return async request=>{
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
  let file;
  try{
   const prefix=/^xzmedia:\/\/(?:local\/|\/)/i;
   if(!prefix.test(request.url))return new Response(null,{status:400});
   const decoded=decodeURIComponent(request.url.replace(prefix,''));
   if(!path.isAbsolute(decoded))return new Response(null,{status:400});
   file=path.resolve(decoded);
  }catch{return new Response(null,{status:400});}
  try{
   const directory=getDataDir();
   const root=await fs.promises.realpath(directory);
   if(!inside(path.resolve(directory),file))return new Response(null,{status:403});
   file=await fs.promises.realpath(file);
   if(directory!==getDataDir()||!inside(root,file)||!allowFile(file,root))return new Response(null,{status:403});
   const stat=await fs.promises.stat(file);
   if(!stat.isFile())return new Response(null,{status:404});
   const headers={'content-type':types[path.extname(file).toLowerCase()]||'application/octet-stream','accept-ranges':'bytes','content-length':String(stat.size)};
   let start=0,end=stat.size-1,status=200;
   const range=request.method==='GET'&&request.headers.get('range');
   if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(match&&(match[1]||match[2])){
     start=match[1]?Number(match[1]):Math.max(0,stat.size-Number(match[2]));
     end=match[1]&&match[2]?Math.min(Number(match[2]),end):end;
    }else start=NaN;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=stat.size)return new Response(null,{status:416,headers:{'content-range':`bytes */${stat.size}`}});
    status=206;headers['content-range']=`bytes ${start}-${end}/${stat.size}`;headers['content-length']=String(end-start+1);
   }
   if(request.method==='HEAD'||!stat.size)return new Response(null,{status,headers});
   if(request.signal?.aborted)return new Response(null,{status:499});
   const stream=fs.createReadStream(file,{start,end});
   // Chromium cancels its first read when it seeks; release that file handle promptly.
   const abort=()=>stream.destroy();
   request.signal?.addEventListener('abort',abort,{once:true});
   if(request.signal?.aborted)abort();
   stream.once('close',()=>request.signal?.removeEventListener('abort',abort));
   return new Response(Readable.toWeb(stream),{status,headers});
  }catch(error){return new Response(null,{status:['ENOENT','ENOTDIR'].includes(error.code)?404:500});}
 };
}
async function audioExportExtension(file) {
 const handle=await fs.promises.open(file,'r');
 try {
  const header=Buffer.alloc(12);
  await handle.read(header,0,header.length,0);
  const signature=header.toString('ascii',0,4);
  if((signature==='RIFF'||signature==='RF64')&&header.toString('ascii',8,12)==='WAVE')return '.wav';
  if(signature==='fLaC')return '.flac';
  if(signature==='OggS')return '.ogg';
  if(header.toString('ascii',4,8)==='ftyp')return '.m4a';
  if(header.toString('ascii',0,3)==='ID3')return '.mp3';
  if(header[0]===0xff&&(header[1]&0xf6)===0xf0)return '.aac';
  if(header[0]===0xff&&(header[1]&0xe0)===0xe0&&(header[1]&0x06)!==0)return '.mp3';
  const extension=path.extname(file).toLowerCase();
  if(types[extension]?.startsWith('audio/'))return extension;
  throw Error('无法识别这份音频的格式，请刷新样音后重试');
 }finally{await handle.close();}
}
async function exportMediaFile({filePath,url,kind,filename},{showSaveDialog,downloadToFile,mediaDir,dataDir}){
 const verify=dataDir?file=>require('./workspace-file.cjs').verifiedDataFile(file,dataDir()):async file=>file;
 if(filePath){
  try{filePath=await verify(filePath);}
  catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;filePath=null;}
 }
 if(!filePath||!fs.existsSync(filePath)){
  if(!url)throw new Error('素材文件不存在，请刷新结果或检查本地资料目录');
  if(!/^https?:\/\//i.test(url))throw new Error('下载地址无效');
  filePath=await verify(await downloadToFile(url,mediaDir(),kind==='image'?'png':kind==='audio'?'wav':'mp4'));
 }
 if(!filePath||!fs.existsSync(filePath)||!fs.statSync(filePath).isFile())throw new Error('素材文件不存在');
 const sourceExt=path.extname(filePath).toLowerCase();
 const ext=kind==='audio'?await audioExportExtension(filePath):types[sourceExt]?sourceExt:kind==='image'?'.png':'.mp4';
 const withExtension=name=>{
  const current=path.extname(name).toLowerCase();
  return current===ext?name:(types[current]?name.slice(0,-current.length):name)+ext;
 };
 const name=filename?String(filename).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_'):path.basename(filePath);
 const result=await showSaveDialog({defaultPath:withExtension(name),filters:[{name:ext.slice(1).toUpperCase()+' 文件',extensions:[ext.slice(1)]}]});
 if(result.canceled||!result.filePath)return null;
 const destination=withExtension(result.filePath);
 if(path.resolve(filePath)!==path.resolve(destination)){
  // Electron only confirmed overwrite of the exact path returned by the dialog.
  // If we added/repaired its extension, refuse an unconfirmed collision atomically.
  try{await fs.promises.copyFile(filePath,destination,destination!==result.filePath?fs.constants.COPYFILE_EXCL:0);}
  catch(error){if(error.code==='EEXIST')throw Error('同名文件已存在，请选择其他文件名');throw error;}
 }
 return destination;
}
module.exports={LOCAL_MEDIA_PRIVILEGES,createLocalMediaHandler,exportMediaFile};

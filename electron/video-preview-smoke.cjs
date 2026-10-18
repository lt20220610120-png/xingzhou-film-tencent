// Valid H.264/AAC fixture with metadata at the end. No real profile, account or paid API.
module.exports=async function verifyVideoPreview(win,mediaDir){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
 const {net}=require('electron');
 const {exportMediaFile}=require('./local-media.cjs');
 const source=path.join(__dirname,'fixtures','preview-seek.mp4'),file=path.join(mediaDir,'视频拖动验证.mp4');
 fs.copyFileSync(source,file);
 const url=`xzmedia://local/${encodeURIComponent(file)}`;
 const range=await net.fetch(url,{headers:{Range:'bytes=-1024'}});
 assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
 const playback=await win.webContents.executeJavaScript(`new Promise(resolve=>{
  const v=document.createElement('video');v.muted=true;v.controls=true;document.body.append(v);
  let timer;const done=value=>{clearTimeout(timer);v.pause();v.removeAttribute('src');v.load();v.remove();resolve(value);};
  timer=setTimeout(()=>done({timeout:true}),6000);
  v.onerror=()=>done({error:v.error?.code});
  v.onloadedmetadata=()=>{v.currentTime=1.5;v.play().then(()=>setTimeout(()=>done({duration:v.duration,time:v.currentTime,ready:v.readyState}),350)).catch(()=>done({playFailed:true}));};
  v.src=${JSON.stringify(url)};
 })`);
 assert(playback.duration>=3&&playback.time>1.5&&playback.ready>=2,JSON.stringify(playback));
 const dest=path.join(mediaDir,'下载验证.mp4');
 await exportMediaFile({filePath:file,kind:'video'},{showSaveDialog:async()=>({filePath:dest})});
 assert.deepEqual(fs.readFileSync(dest),fs.readFileSync(file));
 return {range206:true,playback,downloadBytesIdentical:true};
};

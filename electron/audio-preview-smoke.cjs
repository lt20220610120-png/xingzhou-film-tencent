// Offline decoder/export check for the packaged runtime; no user data or model invocation.
module.exports=async function verifyAudioPreview(win,mediaDir){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
 const frames=48000,b=Buffer.alloc(44+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let n=0;n<frames;n++)b.writeInt16LE(Math.round(Math.sin(n*2*Math.PI*440/24000)*1000),44+n*2);
 const generated=await require('./audio-provider.cjs').generateSpeech({endpoint:'http://127.0.0.1:7891/v1',model:'test',input:'offline fixture',requiresApiKey:false,destDir:mediaDir},{fetchFn:async()=>new Response(b,{headers:{'content-type':'audio/wav'}})});
 const playback=await win.webContents.executeJavaScript(`new Promise(resolve=>{const audio=document.createElement('audio');audio.muted=true;document.body.append(audio);let timer;const done=value=>{clearTimeout(timer);audio.pause();audio.removeAttribute('src');audio.load();audio.remove();resolve(value);};timer=setTimeout(()=>done({timeout:true}),4000);audio.onerror=()=>done({error:audio.error?.code});audio.onloadedmetadata=()=>audio.play().then(()=>setTimeout(()=>done({duration:audio.duration,time:audio.currentTime,ready:audio.readyState}),250)).catch(()=>done({playFailed:true}));audio.src=${JSON.stringify(`xzmedia://local/${encodeURIComponent(generated.filePath)}`)};})`);
 assert.equal(playback.duration,2);assert(playback.time>0&&playback.ready>=2,JSON.stringify(playback));
 const exported=path.join(mediaDir,'语音导出验证.wav');
 await require('./local-media.cjs').exportMediaFile({...generated,kind:'audio'},{showSaveDialog:async()=>({filePath:exported})});
 assert.deepEqual(fs.readFileSync(exported),b);
 const bridge=await win.webContents.executeJavaScript("typeof window.xingzhou.audioGenerate==='function'");assert(bridge,'audio preload bridge missing');
 return {bridge,playback,downloadBytesIdentical:true};
};

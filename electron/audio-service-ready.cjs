const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {speechUrl}=require('./audio-provider.cjs');
const QWEN='Qwen3-TTS-12Hz-1.7B-VoiceDesign';
function startLocalQwen(){
 const root=[process.env.XINGZHOU_QWEN_ROOT,'D:/AI/Qwen3-TTS',path.join(os.homedir(),'AI','Qwen3-TTS')].filter(Boolean).find(p=>fs.existsSync(path.join(p,'.venv','Scripts','python.exe'))&&fs.existsSync(path.join(p,'Start-Qwen3TTS.ps1')));
 if(!root)throw Error('未找到已部署的本地 Qwen 语音模型，请先安装本地模型或选择已启动的语音接口');
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'Start-Qwen3TTS.ps1')],{cwd:root,windowsHide:true,stdio:'ignore'});
  const timer=setTimeout(()=>{child.kill();reject(Error('本地语音模型启动超时，请检查模型目录 logs/server.err.log'));},150000);
  child.once('error',()=>{clearTimeout(timer);reject(Error('无法启动本地语音模型，请检查 PowerShell 与模型部署'));});
  child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('本地语音模型启动失败，请检查模型目录 logs/server.err.log'));});
 });
}
function waitSignal(promise,signal){
 if(!signal)return promise;signal.throwIfAborted();
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
function createAudioServiceReady({fetchFn=globalThis.fetch,startLocal=startLocalQwen,delay=ms=>new Promise(r=>setTimeout(r,ms)),maxPolls=60}={}){
 const starting=new Map();
 return async function ensure(config){
  config.signal?.throwIfAborted();
  const speech=new URL(speechUrl(config.endpoint)),local=['127.0.0.1','localhost','[::1]'].includes(speech.hostname)&&speech.port==='7891'&&String(config.model).replace(/^Qwen\//,'')===QWEN;
  const checked=value=>{const u=new URL(value);if(u.origin!==speech.origin||u.username||u.password||u.search||u.hash)throw Error('语音服务健康/启动地址必须与语音接口同源，且不含密钥或查询参数');return u.href;};
  const health=checked(config.serviceHealthUrl||(local?new URL('/health',speech).href:speech.href.replace(/\/audio\/speech$/,'/models'))),start=config.serviceStartUrl?checked(config.serviceStartUrl):'';
  const headers=config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{},probe=async()=>{
   try{const response=await fetchFn(health,{headers,redirect:'error',signal:AbortSignal.timeout(4000)});if(!response.ok){await response.body?.cancel?.();return !local&&!config.serviceHealthUrl&&[404,405].includes(response.status);}const data=await response.json();return local?data.ready===true&&data.model===QWEN:config.serviceHealthUrl?data.ready===true:data.ready!==false&&!['stopped','loading','starting'].includes(data.status);}catch{return false;}
  };
  if(await waitSignal(probe(),config.signal))return;
  config.signal?.throwIfAborted();
  if(!local&&!start)throw Error('语音服务尚未启动或无法连接；云端请配置服务启动地址与健康检查地址，自动化将重新检查后接续');
  // Readiness is shared; an individual cancelled caller does not cancel another card's startup.
  const key=JSON.stringify([speech.origin,health,start,config.apiKey||'']);
  if(!starting.has(key)){
   const pending=(async()=>{
    if(local)await startLocal();else{const response=await fetchFn(start,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(15000)});await response.body?.cancel?.();if(!response.ok)throw Error(`云语音服务启动失败（HTTP ${response.status}）`);}
    for(let i=0;i<maxPolls;i++){if(await probe())return;await delay(2000);}
    throw Error('语音模型仍未就绪，已等待启动；后续重试会重新检查服务状态');
   })();starting.set(key,pending);pending.finally(()=>{if(starting.get(key)===pending)starting.delete(key);}).catch(()=>{});
  }
  await waitSignal(starting.get(key),config.signal);config.signal?.throwIfAborted();
 };
}
module.exports={createAudioServiceReady,startLocalQwen};

const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const LANGUAGES=['Auto','Chinese','English','Japanese','Korean','German','French','Russian','Portuguese','Spanish','Italian'];
const MAX_BYTES=32*1024*1024;

function speechUrl(endpoint){
 const url=new URL(String(endpoint||'').trim());
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('请输入有效的语音接口地址，不包含密钥或查询参数');
 let route=url.pathname.replace(/\/+$/,'');
 if(!route)route='/v1';
 if(!route.endsWith('/audio/speech'))route+='/audio/speech';
 url.pathname=route;return url.href;
}
function wavDuration(bytes){
 if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(4)+8!==bytes.length)throw Error('接口未返回有效的 WAV 音频');
 let rate=0,data=0,alignment=0;
 for(let pos=12;pos+8<=bytes.length;){
  const name=bytes.toString('ascii',pos,pos+4),size=bytes.readUInt32LE(pos+4),start=pos+8;
  if(start+size>bytes.length)throw Error('WAV 音频不完整');
  if(name==='fmt '&&size>=16){
   const format=bytes.readUInt16LE(start),channels=bytes.readUInt16LE(start+2),sampleRate=bytes.readUInt32LE(start+4),bits=bytes.readUInt16LE(start+14);
   alignment=bytes.readUInt16LE(start+12);rate=bytes.readUInt32LE(start+8);
   if(![1,3,65534].includes(format)||!channels||channels>32||!sampleRate||!bits||bits%8||alignment!==channels*bits/8||rate!==sampleRate*alignment)throw Error('WAV 音频格式无效');
   if(format===65534&&size<40)throw Error('WAV 扩展音频格式不完整');
  }
  if(name==='data')data+=size;
  pos=start+size+(size%2);
 }
 if(!rate||!data||data%alignment)throw Error('接口返回空白或无效 WAV 音频');
 return data/rate;
}
async function generateSpeech(config,{fetchFn=globalThis.fetch,timeoutMs=600000}={}){
 const url=speechUrl(config.endpoint),model=String(config.model||'').trim(),input=String(config.input||'').trim(),key=String(config.apiKey||'').trim();
 if(!model||!input||input.length>1000)throw Error('请填写模型和配音文本，文本最多 1000 字符');
 if(config.requiresApiKey!==false&&!key)throw Error('请填写 API Key；本地服务可勾选无需密钥');
 const language=config.language||'Auto',instructions=String(config.instructions||'').trim();
 if(!LANGUAGES.includes(language)||instructions.length>2000)throw Error('语音语言或音色描述无效');
 if(config.speed!==undefined&&Number(config.speed)!==1)throw Error('当前语音生成使用原始语速');
 const controller=new AbortController(),signal=config.signal;
 const abort=()=>controller.abort(signal.reason||Error('语音生成已停止'));
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(Error('语音生成超时，请检查本地服务；未自动重新提交')),timeoutMs);
 try{
  controller.signal.throwIfAborted();
  const headers={'Content-Type':'application/json'};if(key)headers.Authorization=`Bearer ${key}`;
  const response=await fetchFn(url,{method:'POST',headers,body:JSON.stringify({model,input,voice:String(config.voice||'default'),instructions,language,response_format:'wav',speed:1}),redirect:'error',signal:controller.signal});
  if(!response.ok){await response.body?.cancel?.();throw Error(`语音生成失败（HTTP ${response.status}），请检查模型服务；未自动重试`);}
  if(Number(response.headers?.get('content-length'))>MAX_BYTES){await response.body?.cancel?.();throw Error('语音文件过大（上限 32 MB）');}
  const chunks=[];let size=0;
  const reader=response.body?.getReader();
  if(!reader)throw Error('接口未返回音频');
  try{while(true){controller.signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_BYTES)throw Error('语音文件过大（上限 32 MB）');chunks.push(Buffer.from(part.value));}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=Buffer.concat(chunks),duration=wavDuration(bytes);
  controller.signal.throwIfAborted();
  await fs.promises.mkdir(config.destDir,{recursive:true});
  const filePath=path.join(config.destDir,`speech-${Date.now()}-${randomUUID()}.wav`);
  try{await fs.promises.writeFile(filePath,bytes,{flag:'wx',signal:controller.signal});}
  catch(error){if(error.code!=='EEXIST')await fs.promises.unlink(filePath).catch(()=>{});throw error;}
  if(controller.signal.aborted){await fs.promises.unlink(filePath).catch(()=>{});controller.signal.throwIfAborted();}
  return {filePath,mime:'audio/wav',duration,bytes:bytes.length};
 }catch(error){
  if(controller.signal.aborted)throw controller.signal.reason;
  if(/fetch failed|ECONNREFUSED|network|ENOTFOUND/i.test(String(error?.message)+' '+String(error?.cause?.code)))throw Error('无法连接语音服务，请先启动本地模型并检查接口地址；未自动重试');
  throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
module.exports={speechUrl,generateSpeech};

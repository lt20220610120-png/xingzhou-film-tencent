const https=require('node:https');const fs=require('node:fs');const path=require('node:path');const {Readable}=require('node:stream');
const {createGunzip}=require('node:zlib');
const {IP_TLS_CA_FILE,IP_TLS_CERT_FINGERPRINT}=require('./cloud-config.public.cjs');
const ORIGIN='https://winai.xingzhoufilm.cn';
async function storeCookies(session,values){for(const raw of values||[]){const [pair,...attributes]=raw.split(';'),equals=pair.indexOf('=');if(equals<1)continue;const entry={url:ORIGIN,name:pair.slice(0,equals).trim(),value:pair.slice(equals+1),path:'/',secure:true};let expired=false;for(const part of attributes){const [key,...rest]=part.trim().split('='),value=rest.join('=');switch(key.toLowerCase()){case 'domain':if(value.replace(/^\./,'')!=='winai.xingzhoufilm.cn')throw new Error('Win AI Cookie 域名无效');break;case 'path':entry.path=value.startsWith('/')?value:'/';break;case 'httponly':entry.httpOnly=true;break;case 'samesite':entry.sameSite=['strict','lax','none'].includes(value.toLowerCase())?(value.toLowerCase()==='none'?'no_restriction':value.toLowerCase()):'lax';break;case 'max-age':{const seconds=Number(value);if(Number.isFinite(seconds)){expired=seconds<=0;entry.expirationDate=Date.now()/1000+Math.max(0,seconds);}break;}case 'expires':if(entry.expirationDate===undefined){const date=Date.parse(value);if(Number.isFinite(date))entry.expirationDate=date/1000;}break;}}
 if(expired)await session.cookies.remove(ORIGIN+entry.path,entry.name);else await session.cookies.set(entry);
}}
function createWinAITransport({session,signal}){
 const ca=fs.readFileSync(path.join(__dirname,IP_TLS_CA_FILE));
 // A resumed TLS handshake may omit the peer certificate. Keep this private
 // session's connections alive while requiring a full certificate on new ones.
 const agent=new https.Agent({keepAlive:true,maxSockets:8,maxCachedSessions:0});
 signal?.addEventListener('abort',()=>agent.destroy(),{once:true});
 return async incoming=>{
  const target=new URL(incoming.url);if(target.origin!==ORIGIN||target.username||target.password)return new Response('forbidden',{status:403});
  const body=['GET','HEAD'].includes(incoming.method)?null:Buffer.from(await incoming.arrayBuffer());if(body?.length>64*1024*1024)return new Response('Request too large',{status:413});
  const headers=Object.fromEntries(incoming.headers);delete headers.host;delete headers.connection;delete headers['content-length'];delete headers.cookie;delete headers['accept-encoding'];
  // Built-in protocol interception happens before Chromium adds network-only
  // Origin headers. This isolated transport accepts only our own origin.
  if(headers.origin&&headers.origin!==ORIGIN&&headers.origin!=='null')return new Response('Origin forbidden',{status:403});
  if(!['GET','HEAD'].includes(incoming.method))headers.Origin=ORIGIN;
  headers.Host='winai.xingzhoufilm.cn';headers['Accept-Encoding']='gzip';
  const cookies=await session.cookies.get({url:incoming.url});if(cookies.length)headers.Cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');if(body)headers['Content-Length']=body.length;
  return new Promise((resolve,reject)=>{
   const request=https.request({hostname:'106.55.41.128',port:443,path:target.pathname+target.search,method:incoming.method,headers,ca,servername:'',rejectUnauthorized:true,signal:signal||incoming.signal,agent},async response=>{
    try{await storeCookies(session,response.headers['set-cookie']);const compressed=response.headers['content-encoding']==='gzip';const resultHeaders=new Headers();for(const [key,value]of Object.entries(response.headers)){if(value===undefined||['set-cookie','connection','transfer-encoding'].includes(key)||(compressed&&['content-length','content-encoding'].includes(key)))continue;resultHeaders.set(key,Array.isArray(value)?value.join(', '):String(value));}
     let bodyStream=response;if(compressed){bodyStream=createGunzip();response.on('error',error=>bodyStream.destroy(error));response.on('aborted',()=>bodyStream.destroy(new Error('Win AI 传输中断')));response.pipe(bodyStream);}
     resolve(new Response(['HEAD'].includes(incoming.method)||[204,205,304].includes(response.statusCode)?null:Readable.toWeb(bodyStream),{status:response.statusCode,headers:resultHeaders}));
    }catch{response.destroy();reject(new Error('Win AI 登录会话保存失败'));}
   });
   request.once('socket',socket=>{const verify=()=>{if(String(socket.getPeerCertificate()?.fingerprint256||'').replaceAll(':','').toUpperCase()!==IP_TLS_CERT_FINGERPRINT.replaceAll(':','').toUpperCase())request.destroy(new Error('Win AI 官方服务器证书校验失败'));};if(socket.getPeerCertificate()?.fingerprint256)verify();else socket.once('secureConnect',verify);});
   request.setTimeout(600000,()=>request.destroy(new Error('Win AI 连接超时')));request.on('error',()=>reject(new Error('Win AI 暂时无法连接，请稍后重试')));if(body)request.write(body);request.end();
  });
 };
}
module.exports={createWinAITransport,storeCookies,ORIGIN};

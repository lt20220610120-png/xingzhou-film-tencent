const https=require('node:https'),fs=require('node:fs'),path=require('node:path');
const {Readable}=require('node:stream');
const {IP_TLS_CA_FILE,IP_TLS_CERT_FINGERPRINT}=require('./cloud-config.public.cjs');
const UPDATE_MIRRORS=['https://106.55.41.128/api/updates','https://xingzhoufilm.cn/api/updates'];
function createUpdateFetch(systemFetch=fetch){return (url,init={})=>{
 const parsed=new URL(url);if(parsed.hostname!=='106.55.41.128')return systemFetch(url,init);
 return new Promise((resolve,reject)=>{
  const request=https.request(url,{method:'GET',headers:{'Accept-Encoding':'identity',...(init.headers||{})},ca:fs.readFileSync(path.join(__dirname,IP_TLS_CA_FILE)),servername:'',rejectUnauthorized:true},response=>{
   const headers=new Headers();for(const [k,v] of Object.entries(response.headers))if(v!=null)headers.set(k,Array.isArray(v)?v.join(', '):String(v));
   resolve(new Response(Readable.toWeb(response),{status:response.statusCode,headers}));
  });
  request.once('socket',socket=>socket.once('secureConnect',()=>{if(String(socket.getPeerCertificate().fingerprint256||'').replaceAll(':','').toUpperCase()!==IP_TLS_CERT_FINGERPRINT)request.destroy(Error('官方更新备用证书校验失败'));}));
  request.on('error',reject);const abort=()=>request.destroy(init.signal.reason||Error('更新下载已取消'));if(init.signal){if(init.signal.aborted){abort();return;}init.signal.addEventListener('abort',abort,{once:true});request.once('close',()=>init.signal.removeEventListener('abort',abort));}request.end();
 });
};}
module.exports={UPDATE_MIRRORS,createUpdateFetch};

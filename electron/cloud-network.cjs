const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),https=require('node:https'),dns=require('node:dns'),net=require('node:net');
const{Readable}=require('node:stream');const{IP_TLS_CA_FILE,IP_TLS_CERT_FINGERPRINT}=require('./cloud-config.public.cjs');
let directory=null;
function configure(options={}){directory=options.directory||null;}
function interfaces(){return Object.entries(os.networkInterfaces()).flatMap(([name,rows])=>rows.filter(r=>r.family==='IPv4'&&!r.internal&&!/^(?:198\.1[89]\.|169\.254\.)/.test(r.address)&&!/tun|tap|meta|clash|mihomo|loopback|veth|vethernet|virtual|vmware|virtualbox|tailscale|zerotier/i.test(name)).map(r=>({name,address:r.address})));}
function settings(){let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(directory,'network-routing.json'),'utf8'));}catch{}const available=interfaces();return{enabled:saved.enabled===true,interfaceName:String(saved.interfaceName||''),interfaces:available,activeInterface:available.find(i=>i.name===saved.interfaceName)||available[0]||null};}
function update(value){if(!directory)throw Error('网络设置尚未初始化');if(typeof value.enabled!=='boolean'||typeof(value.interfaceName??'')!=='string')throw Error('网络设置无效');const available=interfaces();if(value.interfaceName&&!available.some(i=>i.name===value.interfaceName))throw Error('所选物理网络当前不可用');if(value.enabled&&!available.length)throw Error('未检测到可用物理网络');fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'network-routing.json');fs.writeFileSync(file+'.tmp',JSON.stringify({enabled:value.enabled,interfaceName:value.interfaceName||''}));fs.renameSync(file+'.tmp',file);return settings();}
function domesticHost(host){return host==='106.55.41.128'||host==='xingzhoufilm.cn'||host.endsWith('.xingzhoufilm.cn')||/\.cos\.[a-z0-9-]+\.myqcloud\.com$/i.test(host)||/\.cos\.[a-z0-9-]+\.tencentcos\.cn$/i.test(host);}
function shouldRoute(url){try{const u=new URL(url);return settings().enabled&&u.protocol==='https:'&&!u.username&&!u.password&&domesticHost(u.hostname);}catch{return false;}}
function lookupFor(address){const resolver=new dns.Resolver({timeout:2500,tries:2});resolver.setServers(['223.5.5.5','119.29.29.29']);resolver.setLocalAddress(address);return(host,options,callback)=>{resolver.resolve4(host,(error,rows)=>{if(error||!rows?.length){callback(error||Error('国内DNS没有返回地址'));return;}const publicRows=rows.filter(ip=>!/^198\.1[89]\./.test(ip));if(!publicRows.length){callback(Error('国内DNS返回了代理虚拟地址'));return;}callback(null,options?.all?publicRows.map(address=>({address,family:4})):publicRows[0],4);});};}
function directFetch(url,init={}){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!domesticHost(parsed.hostname)||parsed.username||parsed.password)throw Error('此连接仅用于行舟官方云端和腾讯云素材');
 const info=settings(),iface=info.activeInterface;if(!iface)throw Error('物理网络未连接，请检查国内云端直连设置');
 const pinned=parsed.hostname==='106.55.41.128';
 return new Promise((resolve,reject)=>{
  let responseStream,settled=false;const headers=Object.fromEntries(new Headers(init.headers||{}));headers['accept-encoding']='identity';const body=init.body,streaming=body&&typeof body.pipe==='function';if(body!=null&&!streaming&&!(typeof body==='string'||Buffer.isBuffer(body)||body instanceof Uint8Array)){reject(Error('国内直连请求体格式不支持'));return;}if(body!=null&&!streaming)headers['content-length']=String(Buffer.byteLength(body));
  const request=https.request(parsed,{method:init.method||'GET',headers,localAddress:iface.address,family:4,lookup:lookupFor(iface.address),agent:false,rejectUnauthorized:true,...(pinned?{ca:fs.readFileSync(path.join(__dirname,IP_TLS_CA_FILE)),servername:''}:{})},response=>{
   const responseHeaders=new Headers();for(const[k,v]of Object.entries(response.headers))if(v!=null)responseHeaders.set(k,Array.isArray(v)?v.join(', '):String(v));
   const status=response.statusCode||0;if(init.redirect==='error'&&status>=300&&status<400){response.resume();reject(Error('国内直连不接受重定向'));return;}
   const noBody=[204,205,304].includes(status)||init.method==='HEAD';responseStream=response;
   response.on('aborted',()=>response.destroy(Error('国内直连响应中断')));
   response.once('end',cleanup);response.once('close',cleanup);settled=true;resolve(new Response(noBody?null:Readable.toWeb(response),{status,headers:responseHeaders}));if(noBody)response.resume();
  });
  const abort=()=>{request.destroy(init.signal?.reason||Error('国内直连已取消'));responseStream?.destroy(init.signal?.reason||Error('国内直连已取消'));};
  function cleanup(){init.signal?.removeEventListener('abort',abort);}
  request.setTimeout(120000,()=>request.destroy(Error('国内直连响应超时')));
  request.on('error',error=>{cleanup();if(!settled)reject(error);else responseStream?.destroy(error);});
  if(pinned)request.once('socket',socket=>socket.once('secureConnect',()=>{if(String(socket.getPeerCertificate().fingerprint256||'').replaceAll(':','').toUpperCase()!==IP_TLS_CERT_FINGERPRINT)request.destroy(Error('官方云端证书指纹不匹配'));}));
  if(init.signal?.aborted){abort();return;}init.signal?.addEventListener('abort',abort,{once:true});if(streaming){body.once('error',error=>request.destroy(error));body.pipe(request);}else{if(body!=null)request.write(body);request.end();}
 });
}
function routeFetch(url,init={},fallback=globalThis.fetch){return shouldRoute(url)?directFetch(url,init):fallback(url,init);}
async function probe(){const before=Date.now(),response=await routeFetch('https://106.55.41.128/healthz',{signal:AbortSignal.timeout(10000)});await response.arrayBuffer();if(!response.ok)throw Error('云端检查失败（'+response.status+'）');return{ok:true,latencyMs:Date.now()-before,...settings()};}
module.exports={configure,settings,update,interfaces,domesticHost,shouldRoute,directFetch,routeFetch,probe};

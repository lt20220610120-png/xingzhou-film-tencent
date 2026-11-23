// The CLI uses Node fetch. Chromium's effective proxy rules determine each
// tunnel route, and a TLS stream is relayed only after CONNECT succeeds.
const http=require('node:http'),net=require('node:net'),tls=require('node:tls'),crypto=require('node:crypto');
const {Duplex}=require('node:stream');
const {failure,codeOf}=require('./libtv-network-error.cjs');
const API_HOSTS=['api2.liblib.art','api.liblib.tv','passport.liblib.art','bridge.liblib.art'];
const officialHost=host=>/^canva\.xingliu\.art$/i.test(host)||/^(?:[a-z0-9-]+\.)*liblib\.(?:art|tv|cloud|ai)$/i.test(host);
// OSS bucket names are globally unique. Allow public endpoints of the exact
// buckets observed in the LibTV CLI; never route an arbitrary Alibaba bucket.
const mediaHost=host=>/^(?:libtv-resource-prod|liblibai-(?:online|tmp-image))\.oss-(?:accelerate|[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.aliyuncs\.com$/i.test(host)&&!/-internal(?:[-.]|$)/i.test(host);
const acceptsHost=host=>officialHost(host)||mediaHost(host);
const CONNECT_TIMEOUT=7000, PROBE_TIMEOUT=8500;
const basic=secret=>'Basic '+Buffer.from('xz:'+secret).toString('base64');

function proxyFromRules(rules){
 for(const rule of String(rules||'DIRECT').split(';')){
  const match=/^\s*(PROXY|HTTPS)\s+([^\s]+)\s*$/i.exec(rule);
  if(match){try{const u=new URL((match[1].toUpperCase()==='HTTPS'?'https':'http')+'://'+match[2]);if(!u.username&&!u.password&&u.pathname==='/'&&u.hostname)return u.href;}catch{}}
  if(/^\s*DIRECT\s*$/i.test(rule))return null;
 }
 return null;
}
async function desktopProxy(url){
 try{const electron=require('electron');if(electron.session?.defaultSession)return await electron.session.defaultSession.resolveProxy(url);}catch{}
 const configured=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy;
 if(configured){try{const u=new URL(configured);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return (u.protocol==='https:'?'HTTPS ':'PROXY ')+u.host;}catch{}}
 return 'DIRECT';
}
function openRoute(row){
 if(row.mode!=='system-proxy')return net.connect({host:row.host,port:443});
 const proxy=new URL(row.proxy),request=(proxy.protocol==='https:'?require('node:https'):http).request({
  host:proxy.hostname,port:proxy.port||(proxy.protocol==='https:'?443:80),
  method:'CONNECT',path:row.host+':443',headers:{Host:row.host+':443'},agent:false,
 });
 // A Duplex proxy socket lets CONNECT setup errors reject like ordinary sockets.
 let upstream;const pending=[];
 const stream=new Duplex({
  read(){upstream?.resume();},
  write(chunk,encoding,done){if(upstream)upstream.write(chunk,encoding,done);else pending.push([chunk,encoding,done]);},
  final(done){if(upstream)upstream.end(done);else done();},
  destroy(error,done){request.destroy();upstream?.destroy();done(error);},
 });
 request.on('connect',(response,socket,head)=>{
  if(response.statusCode!==200){socket.destroy();stream.destroy(Object.assign(Error('Proxy CONNECT failed'),{code:'PROXY_HTTP_'+response.statusCode}));return;}
  upstream=socket;socket.pause();
  socket.on('data',chunk=>{if(!stream.push(chunk))socket.pause();});
  socket.on('end',()=>stream.push(null));
  socket.on('error',error=>stream.destroy(error));socket.on('close',()=>stream.destroy());
  if(head.length)stream.push(head);
  for(const [chunk,encoding,done]of pending)socket.write(chunk,encoding,done);
  stream.emit('connect');
 });
 request.on('error',error=>stream.destroy(error));request.end();return stream;
}
function probeRoute(row,{signal}={}){
 return new Promise((resolve,reject)=>{
  const socket=openRoute(row);let secure,settled=false;
  const finish=error=>{
   if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
   secure?.destroy();socket.destroy();error?reject(error):resolve();
  };
  const abort=()=>finish(signal.reason);
  const timer=setTimeout(()=>finish(Object.assign(Error('TLS timeout'),{code:'TLS_TIMEOUT'})),PROBE_TIMEOUT);
  socket.on('error',finish);
  socket.once('connect',()=>{secure=tls.connect({socket,servername:row.host,rejectUnauthorized:true},()=>finish());secure.once('error',finish);});
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 });
}
function untilAbort(work,signal){
 if(!signal)return work;
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}

function createLibTVNetwork({resolveProxy=desktopProxy,probe=probeRoute,connect=openRoute,connectTimeout=CONNECT_TIMEOUT}={}){
 const controller=new AbortController(),sockets=new Set(),commands=new Map();
 let server,starting,selected,pending,closed=false,revision=0;
 const track=socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));return socket;};
 function candidates(host,rule){
  const direct={host,mode:'direct'},primary=proxyFromRules(rule);
  if(primary)return [{host,mode:'system-proxy',proxy:primary},direct];
  const backup=String(rule||'').split(';').map(proxyFromRules).find(Boolean);
  return backup?[direct,{host,mode:'system-proxy',proxy:backup}]:[direct];
 }
 async function selectRoute(host,rule){
  const choices=candidates(host,rule),attempts=[];
  for(const row of choices){
   try{await probe(row,{signal:controller.signal});return {host,order:[row,...choices.filter(item=>item!==row)]};}
   catch(error){if(controller.signal.aborted)throw error;attempts.push({mode:row.mode,code:codeOf(error)});}
  }
  const preferred=attempts.find(row=>failure(row.code).retryable)||attempts[0];
  throw failure(preferred.code,{host,attempts});
 }
 async function dynamicRoute(plan,host){
  let work=plan.dynamicRoutes.get(host);
  if(!work){
   work=selectRouteForHost();
   plan.dynamicRoutes.set(host,work);
   work.catch(()=>{if(plan.dynamicRoutes.get(host)===work)plan.dynamicRoutes.delete(host);});
  }
  return work;

  async function selectRouteForHost(){
   return selectRoute(host,await resolveProxy('https://'+host));
  }
 }
 function connectBeforeRelay(row,client){
  return new Promise((resolve,reject)=>{
   const upstream=track(connect(row));
   const timeout=setTimeout(()=>finish(Object.assign(Error('CONNECT timeout'),{code:'CONNECT_TIMEOUT'})),connectTimeout);
   const onError=error=>finish(error);
   const onClose=()=>finish(Object.assign(Error('CONNECT closed'),{code:'ECONNRESET'}));
   const onConnect=()=>finish(),onClientClose=()=>finish(Error('CLI tunnel closed'));
   function finish(error){
    clearTimeout(timeout);upstream.off('error',onError);upstream.off('close',onClose);upstream.off('connect',onConnect);client.off('close',onClientClose);
    if(error){upstream.destroy();reject(error);}else resolve(upstream);
   }
   upstream.once('error',onError);upstream.once('close',onClose);upstream.once('connect',onConnect);client.once('close',onClientClose);
  });
 }
 async function handleConnect(request,client,head){
  const deny=status=>{if(!client.destroyed)client.end('HTTP/1.1 '+status+'\r\nConnection: close\r\n\r\n');};
  const scope=commands.get(request.headers['proxy-authorization']);
  if(!scope)return deny('407 Proxy Authentication Required');
  const upload=scope.upload?scope:null;
  const match=/^([a-z0-9.-]+):443$/i.exec(request.url||'');
  if(!match||!acceptsHost(match[1])){
   if(upload)upload.failure=failure('BLOCKED_HOST');
   return deny('403 Forbidden');
  }
  const host=match[1].toLowerCase();
  try{
   const routePlan=scope.plan;
   const known=routePlan.routes.find(row=>row.host===host)||await dynamicRoute(routePlan,host);
   const choices=[...known.order];
   if(upload?.retryRoute?.host===host&&choices.length===2&&choices[0].mode===upload.retryRoute.mode)choices.reverse();
   const attempts=[];
   let upstream,mode;
   for(const row of choices){
    if(closed||client.destroyed)return;
    try{upstream=await connectBeforeRelay(row,client);mode=row.mode;break;}
    catch(error){attempts.push({mode:row.mode,code:codeOf(error)});}
   }
   if(!upstream){
    const preferred=attempts.find(row=>failure(row.code).retryable)||attempts[0];
    throw failure(preferred.code,{host,attempts});
   }
   if(closed||client.destroyed){upstream.destroy();return;}
   if(upload){upload.failure=null;upload.lastRoute={host,mode};}
   // Once CONNECT succeeds, the CLI owns the TLS stream. Only the caller
   // for an unpaid upload may launch a new command if this stream fails.
   const abandon=()=>{client.destroy();upstream.destroy();};
   const broken=error=>{
    if(upload&&error)upload.failure=failure(codeOf(error),{host,mode,routeHint:{host,mode}});
    abandon();
   };
   client.once('error',abandon);
   upstream.once('error',broken);
   client.setTimeout(120000,()=>broken(Object.assign(Error('Idle timeout'),{code:'ETIMEDOUT'})));
   client.once('close',()=>upstream.destroy());
   upstream.once('close',()=>client.destroy());
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head.length)upstream.write(head);
   client.pipe(upstream);upstream.pipe(client);
  }catch(error){
   if(upload&&error?.code==='LIBTV_NETWORK')upload.failure=error;
   deny('502 Bad Gateway');
  }
 }
 async function start(){
  if(server?.listening)return;
  if(starting)return starting;
  starting=new Promise((resolve,reject)=>{
   server=http.createServer((_q,response)=>{response.writeHead(405);response.end();});
   server.on('connection',track);server.on('connect',handleConnect);server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  try{await starting;}finally{starting=null;}
 }
 async function getPlan(){
  if(closed)throw Error('LibTV 网络连接已关闭');
  const rules=await Promise.all(API_HOSTS.map(host=>resolveProxy('https://'+host))),signature=JSON.stringify(rules);
  if(closed)throw Error('LibTV 网络连接已关闭');
  if(selected?.signature===signature&&selected.revision===revision&&Date.now()-selected.time<60000)return selected;
  if(pending?.signature===signature&&pending.revision===revision)return pending.work;
  const next={signature,revision};
  next.work=(async()=>{
   const settled=await Promise.allSettled(API_HOSTS.map((host,index)=>selectRoute(host,rules[index])));
   if(closed)throw Error('LibTV 网络连接已关闭');
   const routes=settled.filter(row=>row.status==='fulfilled').map(row=>row.value);
   if(!routes.length)throw settled.find(row=>row.status==='rejected').reason;
   const plan={signature,revision:next.revision,time:Date.now(),routes,dynamicRoutes:new Map(),proxyConfigured:rules.some(rule=>String(rule||'').split(';').some(proxyFromRules))};
   if(pending===next&&revision===plan.revision)selected=plan;
   return plan;
  })();
  pending=next;
  try{return await next.work;}finally{if(pending===next)pending=null;}
 }
 async function environment({upload=false,signal,retryRoute}={}){
  signal?.throwIfAborted();
  const plan=await untilAbort(getPlan(),signal);
  const routes=plan.routes.map(({host,order})=>({host,mode:order[0].mode}));
  // Uploads resolve OSS hosts independently, even when every API connection
  // uses DIRECT. A command-specific token keeps diagnostics apart.
  if(!upload&&!plan.proxyConfigured)return{env:{HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NODE_USE_ENV_PROXY:undefined},routes};
  await untilAbort(start(),signal);
  signal?.throwIfAborted();
  const credential=crypto.randomBytes(24).toString('hex');
  const url='http://xz:'+credential+'@127.0.0.1:'+server.address().port;
  const env={HTTP_PROXY:url,HTTPS_PROXY:url,ALL_PROXY:'',http_proxy:url,https_proxy:url,all_proxy:'',NO_PROXY:'localhost,127.0.0.1,::1',no_proxy:'localhost,127.0.0.1,::1',NODE_USE_ENV_PROXY:'1'};
  const authorization=basic(credential),state={plan,upload,retryRoute};
  commands.set(authorization,state);
  const dispose=()=>commands.delete(authorization);
  if(!upload)return{env,routes,dispose};
  return {env,routes,dispose,diagnose:error=>{
   if(error.code!=='LIBTV_NETWORK')return error;
   if(state.failure?.networkCode==='BLOCKED_HOST'&&['FETCH_FAILED','PROXY_HTTP_403'].includes(error.networkCode))return state.failure;
   if(state.failure&&['FETCH_FAILED','PROXY_HTTP_502'].includes(error.networkCode))return state.failure;
   if(error.retryable&&state.lastRoute&&(!error.host||error.host===state.lastRoute.host)&&error.networkCode!=='HTTP_429'){
    return failure(error.networkCode,{...state.lastRoute,routeHint:state.lastRoute});
   }
   return error;
  }};
 }
 async function close(){
  closed=true;controller.abort();commands.clear();for(const socket of sockets)socket.destroy();
  await starting?.catch(()=>{});if(server?.listening)await new Promise(resolve=>server.close(resolve));
 }
 return{environment,close,invalidate:()=>{revision++;}};
}
module.exports={createLibTVNetwork,officialHost,acceptsHost,proxyFromRules,untilAbort};

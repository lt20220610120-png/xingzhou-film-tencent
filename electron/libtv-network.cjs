// System and custom modes route CLI traffic through an authenticated loopback
// tunnel. Forced direct mode clears the child's proxy environment and skips it.
const http=require('node:http');
const crypto=require('node:crypto');
const {failure,codeOf}=require('./libtv-network-error.cjs');
const {connectLibTVRoute,networkError,untilAbort}=require('./libtv-proxy-transport.cjs');

const officialHost=host=>/^canva\.xingliu\.art$/i.test(host)||/^(?:[a-z0-9-]+\.)*liblib\.(?:art|tv|cloud|ai)$/i.test(host);
// OSS bucket names are globally unique. Keep other buckets and private OSS endpoints outside the tunnel.
const mediaHost=host=>/^(?:libtv-resource-prod|liblibai-(?:online|tmp-image))\.oss-(?:accelerate|[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.aliyuncs\.com$/i.test(host)&&!/-internal(?:[-.]|$)/i.test(host);
const acceptsHost=host=>officialHost(host)||mediaHost(host);
const CONNECT_TIMEOUT=8500,PAC_TIMEOUT=4000,ROUTE_TTL=120000,ROUTE_LIMIT=64,IDLE_TIMEOUT=120000;
const basic=secret=>'Basic '+Buffer.from('xz:'+secret).toString('base64');
const noAmbientProxy=()=>Object.fromEntries(
 [...new Set([...Object.keys(process.env).filter(key=>/^(?:(?:https?|all|no)_proxy|node_use_env_proxy)$/i.test(key)),
  'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_USE_ENV_PROXY'])]
  .map(key=>[key,undefined]),
);
const unverifiedTunnel=code=>code==='TUNNEL_CONNECT_FAILED'||/^PROXY_HTTP_/.test(code);
const safeHost=host=>typeof host==='string'&&acceptsHost(host)?host.toLowerCase():'';

const schemes=new Set(['http','https','socks4','socks5']);
const pacSchemes={PROXY:'http',HTTP:'http',HTTPS:'https',SOCKS:'socks4',SOCKS4:'socks4',SOCKS5:'socks5'};
function parseProxy(value){
 if(typeof value!=='string'||value.length>320)return null;
 const text=value.trim().replace(/^socks(?:5h)?:\/\//i,'socks5://');
 if(!/^[a-z0-9]+:\/\/[^\s\\/@?#]+\/?$/i.test(text))return null;
 try{
  const address=new URL(text),protocol=address.protocol.slice(0,-1);
  if(!schemes.has(protocol)||!address.hostname||address.port==='0'||!/^([a-z\d.-]+|\[[a-f\d:.]+\])$/i.test(address.hostname))return null;
  return {protocol,proxy:address.protocol+'//'+address.host};
 }catch{return null;}
}
function normalizeLibTVNetworkOptions(input={}){
 const {mode='system',proxyUrl}=input||{};
 if(!['system','direct','custom'].includes(mode))throw Error('请选择有效的 LibTV 网络模式');
 if(mode!=='custom')return {mode,proxyUrl:''};
 const proxy=parseProxy(proxyUrl);
 if(!proxy)throw Error('请输入有效的 HTTP、HTTPS 或 SOCKS5 代理地址，不含用户名或密码');
 return {mode,proxyUrl:proxy.proxy};
}
function pacRoutes(rules){
 const rows=[];
 for(const rule of String(rules||'DIRECT').split(';')){
  if(/^\s*DIRECT\s*$/i.test(rule)){rows.push({mode:'direct',protocol:'direct'});continue;}
  const match=/^\s*(PROXY|HTTP|HTTPS|SOCKS5?|SOCKS4)\s+(\S+)\s*$/i.exec(rule);
  const proxy=match&&parseProxy(pacSchemes[match[1].toUpperCase()]+'://'+match[2]);
  if(proxy)rows.push({mode:'system-proxy',...proxy});
 }
 if(!rows.some(row=>row.mode==='direct'))rows.push({mode:'direct',protocol:'direct'});
 return rows.filter((row,index)=>rows.findIndex(candidate=>candidate.proxy===row.proxy)===index);
}
function proxyFromRules(rules){
 return pacRoutes(rules)[0].proxy||null;
}
async function desktopProxy(url){
 try{const electron=require('electron');if(electron.session?.defaultSession)return await electron.session.defaultSession.resolveProxy(url);}catch{}
 const configured=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy||process.env.ALL_PROXY||process.env.all_proxy;
 const parsed=parseProxy(configured);
 if(!parsed)return 'DIRECT';
 const kind={http:'PROXY',https:'HTTPS',socks4:'SOCKS4',socks5:'SOCKS5'}[parsed.protocol];
 return kind+' '+new URL(parsed.proxy).host;
}

function directEnvironment(){
 const route={mode:'direct',protocol:'direct'};
 let code;
 return {
  env:noAmbientProxy(),
  dispose(){},
  timeoutFailure:()=>failure('ETIMEDOUT',route),
  routeReport:()=>({route:'direct',source:'direct',...(code?{code}:{})}),
  diagnose(error){
   if(error?.code!=='LIBTV_NETWORK')return error;
   // A proxy error read from stderr is not evidence of an actual proxy in
   // direct mode. Without a confirmed response report connection failure.
   code=unverifiedTunnel(error.networkCode)?'FETCH_FAILED':error.networkCode;
   return failure(code,{...route,host:safeHost(error.host)});
  },
 };
}

function createLibTVNetwork({resolveProxy=desktopProxy,getSettings=()=>({mode:'system'}),connect,connectTimeout=CONNECT_TIMEOUT}={}){
 const controller=new AbortController(),sockets=new Set(),commands=new Map(),routes=new Map(),preferredRoutes=new Map();
 let server,starting,closed=false;
 const track=socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));return socket;};
 function routePlan(host,scope){
  const cached=scope.plans.get(host);
  if(cached)return cached;
  let plan=routes.get(host);
  if(scope.settings.mode==='custom')plan={rows:Promise.resolve([{mode:'custom-proxy',...parseProxy(scope.settings.proxyUrl)}])};
  else if(!plan){
   const budget=AbortSignal.any([controller.signal,AbortSignal.timeout(PAC_TIMEOUT)]);
   const resolution=untilAbort(Promise.resolve().then(()=>resolveProxy('https://'+host)),budget);
   plan={rows:resolution.then(pacRoutes,()=>pacRoutes('DIRECT')).finally(()=>{
    if(routes.get(host)===plan)routes.delete(host);
   })};
   routes.set(host,plan);
   while(routes.size>ROUTE_LIMIT)routes.delete(routes.keys().next().value);
  }
  scope.plans.set(host,plan);
  return plan;
 }
 const identify=(row,host,variant)=>({host,mode:row.mode,protocol:row.protocol,variant});
 function prioritize(rows,routeKey,scope,host){
  if(scope.allowFallback&&scope.retryRoute?.host===host&&rows.length>1){
   const previous=scope.retryRoute;
   const index=rows.findIndex((row,i)=>row.mode===previous.mode&&(!previous.protocol||row.protocol===previous.protocol)&&(previous.variant==null||i===previous.variant));
   if(index>=0)return [...rows.filter((_,i)=>i!==index),rows[index]];
  }
  const previous=preferredRoutes.get(host),index=previous?.index;
  if(previous?.routeKey===routeKey&&Date.now()<=previous.expires&&rows[index])return [rows[index],...rows.filter((_,i)=>i!==index)];
  return rows;
 }
 function recordFailure(scope,error){
  scope.failure=error;
  if(error.routeHint)scope.lastRoute=error.routeHint;
 }
 async function handleConnect(request,client,head){
  const deny=status=>{if(!client.destroyed)client.end('HTTP/1.1 '+status+'\r\nConnection: close\r\n\r\n');};
  const scope=commands.get(request.headers['proxy-authorization']);
  if(!scope||scope.signal.aborted)return deny('407 Proxy Authentication Required');
  const match=/^([a-z0-9.-]+):443$/i.exec(request.url||'');
  if(!match||!acceptsHost(match[1])){
   recordFailure(scope,failure('BLOCKED_HOST'));
   return deny('403 Forbidden');
  }
  const host=match[1].toLowerCase(),disconnect=new AbortController();
  scope.clients.add(client);
  client.once('close',()=>{scope.clients.delete(client);disconnect.abort();});
  const signal=AbortSignal.any([scope.signal,disconnect.signal]);
  let upstream;
  try{
   const plan=routePlan(host,scope);
   const rows=await untilAbort(plan.rows,signal);
   const routeKey=JSON.stringify(rows);
   const ordered=prioritize(rows,routeKey,scope,host);
   const candidates=scope.allowFallback?ordered:ordered.slice(0,1);
   const attempts=[];
   let route;
   for(const row of candidates){
    signal.throwIfAborted();
    route=identify(row,host,rows.indexOf(row));
    scope.lastRoute=route;
    const budget=AbortSignal.timeout(connectTimeout);
    try{
     upstream=await connectLibTVRoute({...row,host},AbortSignal.any([signal,budget]),connect);
     signal.throwIfAborted();
     preferredRoutes.delete(host);
     preferredRoutes.set(host,{routeKey,index:route.variant,expires:Date.now()+ROUTE_TTL});
     while(preferredRoutes.size>ROUTE_LIMIT)preferredRoutes.delete(preferredRoutes.keys().next().value);
     break;
    }catch(error){
     if(upstream){upstream.destroy();upstream=null;}
     if(signal.aborted)throw error;
     attempts.push({...route,code:budget.aborted?'CONNECT_TIMEOUT':codeOf(error)});
    }
   }
   if(!upstream){
    const preferred=attempts.find(row=>failure(row.code).retryable)||attempts[0];
    throw failure(preferred.code,{host,mode:preferred.mode,protocol:preferred.protocol,routeHint:preferred,attempts});
   }
   track(upstream);
   scope.tunnelFailures.delete(host);
   scope.failure=null;scope.lastRoute=route;
   // The TLS stream stays opaque. A sent CONNECT is never transparently replayed.
   const abandon=()=>{client.destroy();upstream.destroy();};
   const broken=error=>{
    if(error&&!signal.aborted)recordFailure(scope,failure(codeOf(error),{...route,routeHint:route}));
    abandon();
   };
   client.once('error',abandon);
   upstream.once('error',broken);
   client.setTimeout(IDLE_TIMEOUT,()=>broken(networkError('ETIMEDOUT')));
   client.once('close',()=>upstream.destroy());
   upstream.once('close',()=>client.destroy());
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head.length)upstream.write(head);
   client.pipe(upstream);upstream.pipe(client);
  }catch(error){
   if(signal.aborted){upstream?.destroy();return;}
   const cause=error?.code==='LIBTV_NETWORK'?error:failure(codeOf(error),{host});
   recordFailure(scope,cause);
   scope.tunnelFailures.delete(host);
   scope.tunnelFailures.set(host,cause);
   // This is an internal CONNECT status, not the origin's HTTP 502 or a
   // status returned by a configured upstream proxy.
   deny('599 Tunnel Connection Failed');
  }
 }
 async function start(){
  if(server?.listening)return;
  if(starting)return starting;
  starting=new Promise((resolve,reject)=>{
   server=http.createServer((_request,response)=>{response.writeHead(405);response.end();});
   server.on('connection',track);server.on('connect',handleConnect);server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  try{await starting;}finally{starting=null;}
 }
 async function environment({signal,retryRoute,allowFallback=true}={}){
  if(closed)throw Error('LibTV 网络连接已关闭');
  const settings=normalizeLibTVNetworkOptions(getSettings());
  signal?.throwIfAborted();
  if(settings.mode==='direct')return directEnvironment();
  const commandController=new AbortController();
  const scopeSignal=AbortSignal.any([controller.signal,commandController.signal,...(signal?[signal]:[])]);
  scopeSignal.throwIfAborted();
  await untilAbort(start(),scopeSignal);
  scopeSignal.throwIfAborted();
  const credential=crypto.randomBytes(24).toString('hex');
  const url='http://xz:'+credential+'@127.0.0.1:'+server.address().port;
  // Clear ambient alternate-proxy variables. The CLI's browser callback stays local.
  const env={...noAmbientProxy(),HTTP_PROXY:url,HTTPS_PROXY:url,http_proxy:url,https_proxy:url,NO_PROXY:'localhost,127.0.0.1,::1',no_proxy:'localhost,127.0.0.1,::1',NODE_USE_ENV_PROXY:'1'};
  const authorization=basic(credential),state={settings,signal:scopeSignal,clients:new Set(),plans:new Map(),tunnelFailures:new Map(),allowFallback,retryRoute};
  commands.set(authorization,state);
  const dispose=()=>{
   scopeSignal.removeEventListener('abort',dispose);
   commands.delete(authorization);
   commandController.abort();
   for(const client of state.clients)client.destroy();
  };
  scopeSignal.addEventListener('abort',dispose,{once:true});
  const routeReport=()=>({
   route:state.lastRoute?.protocol||null,source:state.lastRoute?.mode||null,
   ...(state.failure?{code:state.failure.networkCode}:{}),
  });
  function diagnose(error){
   if(error?.code!=='LIBTV_NETWORK')return error;
   const host=safeHost(error.host);
   const code=error.networkCode;
   const latest=state.failure;
   if(latest?.networkCode==='BLOCKED_HOST'&&['FETCH_FAILED','PROXY_HTTP_403'].includes(code))return latest;
   if(code==='TUNNEL_CONNECT_FAILED'){
    // Only the router can authenticate the upstream CONNECT outcome. A
    //  successful CONNECT to a second host must not erase a failed first one.
    const recorded=host?state.tunnelFailures.get(host):[...state.tunnelFailures.values()].at(-1);
    if(recorded){recordFailure(state,recorded);return recorded;}
   }
   if(code==='FETCH_FAILED'&&latest&&(!host||host===latest.host))return latest;
   const displayCode=unverifiedTunnel(code)?'TUNNEL_CONNECT_FAILED':code;
   const route=state.lastRoute;
   if(route&&(!host||host===route.host)){
    const hint=error.retryable&&displayCode!=='HTTP_429'?route:null;
    const detail=failure(displayCode,{...route,routeHint:hint});
    recordFailure(state,detail);
    return detail;
   }
   const detail=failure(displayCode,{host});
   recordFailure(state,detail);
   return detail;
  }
  const timeoutFailure=()=>failure('ETIMEDOUT',{...(state.lastRoute||{}),routeHint:state.lastRoute});
  return {env,dispose,routeReport,diagnose,timeoutFailure};
 }
 async function close(){
  closed=true;controller.abort();commands.clear();routes.clear();preferredRoutes.clear();
  for(const socket of sockets)socket.destroy();
  await starting?.catch(()=>{});
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
 }
 function invalidate(hint){
  if(hint?.host){routes.delete(hint.host);preferredRoutes.delete(hint.host);}
  else {routes.clear();preferredRoutes.clear();}
 }
 return {environment,close,invalidate};
}
module.exports={createLibTVNetwork,officialHost,acceptsHost,proxyFromRules,untilAbort,normalizeLibTVNetworkOptions};

// The official CLI bundles Node fetch. It does not inherit Chromium's proxy/PAC
// routing. Select a verified route before a command; never replay its HTTP work.
const http=require('node:http'),net=require('node:net'),tls=require('node:tls'),crypto=require('node:crypto');
const API_HOSTS=['api2.liblib.art','api.liblib.tv','passport.liblib.art','bridge.liblib.art'];
const officialHost=host=>/^canva\.xingliu\.art$/i.test(host)||/^(?:[a-z0-9-]+\.)*liblib\.(?:art|tv|cloud|ai)$/i.test(host);
// Exact buckets are published in the pinned official CLI's public config.
const mediaHost=host=>/^liblibai-(?:online|tmp-image)\.oss-(?:accelerate|[a-z]{2}-[a-z0-9-]+)\.aliyuncs\.com$/i.test(host)&&!/-internal\./i.test(host);
const safeCode=error=>String(error?.cause?.code||error?.code||error?.name||'NETWORK_ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,60)||'NETWORK_ERROR';
function proxyFromRules(rules){for(const rule of String(rules||'DIRECT').split(';')){const match=/^\s*(PROXY|HTTPS)\s+([^\s]+)\s*$/i.exec(rule);if(match){try{const url=new URL((match[1].toUpperCase()==='HTTPS'?'https':'http')+'://'+match[2]);if(url.username||url.password||url.pathname!=='/'||!url.hostname)return null;return url.href;}catch{return null;}}if(/^\s*DIRECT\s*$/i.test(rule))return null;}return null;}
async function desktopProxy(url){try{const electron=require('electron');if(electron.session?.defaultSession)return await electron.session.defaultSession.resolveProxy(url);}catch{}const configured=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy;if(configured){try{const u=new URL(configured);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return (u.protocol==='https:'?'HTTPS ':'PROXY ')+u.host;}catch{}}return 'DIRECT';}
function openRoute(row){
 if(row.mode!=='system-proxy')return net.connect({host:row.host,port:443});
 const proxy=new URL(row.proxy),request=(proxy.protocol==='https:'?require('node:https'):http).request({host:proxy.hostname,port:proxy.port||(proxy.protocol==='https:'?443:80),method:'CONNECT',path:row.host+':443',headers:{Host:row.host+':443'},agent:false});
 // A Duplex proxy socket lets CONNECT setup errors reject like ordinary sockets.
 const {Duplex}=require('node:stream');let upstream;const pending=[];const stream=new Duplex({read(){upstream?.resume();},write(chunk,encoding,done){if(upstream)upstream.write(chunk,encoding,done);else pending.push([chunk,encoding,done]);},final(done){if(upstream)upstream.end(done);else done();},destroy(error,done){request.destroy();upstream?.destroy();done(error);}});
 request.on('connect',(response,socket,head)=>{if(response.statusCode!==200){socket.destroy();stream.destroy(Object.assign(Error('Proxy CONNECT failed'),{code:'PROXY_HTTP_'+response.statusCode}));return;}upstream=socket;socket.pause();socket.on('data',chunk=>{if(!stream.push(chunk))socket.pause();});socket.on('end',()=>stream.push(null));socket.on('error',error=>stream.destroy(error));socket.on('close',()=>stream.destroy());if(head.length)stream.push(head);for(const [chunk,encoding,done]of pending)socket.write(chunk,encoding,done);stream.emit('connect');});
 request.on('error',error=>stream.destroy(error));request.end();return stream;
}
function probeRoute(row,{signal}={}){return new Promise((resolve,reject)=>{const socket=openRoute(row);let secure,settled=false;const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);secure?.destroy();socket.destroy();error?reject(error):resolve();},abort=()=>finish(signal.reason||Object.assign(Error('aborted'),{code:'ABORT_ERR'}));const timer=setTimeout(()=>finish(Object.assign(Error('TLS timeout'),{code:'ETIMEDOUT'})),3500);socket.on('error',finish);socket.once('connect',()=>{secure=tls.connect({socket,servername:row.host,rejectUnauthorized:true},()=>finish());secure.once('error',finish);});if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});}
function createLibTVNetwork({resolveProxy=desktopProxy,probe=probeRoute,connect=openRoute}={}){
 const controller=new AbortController(),sockets=new Set(),dynamicRoutes=new Map();let server,starting,selected,pending,closed=false;const secret=crypto.randomBytes(24).toString('hex'),authorization='Basic '+Buffer.from('xz:'+secret).toString('base64');
 const track=socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));return socket;};
 async function selectRoute(host,rule){
  const proxy=proxyFromRules(rule),normal={host,mode:proxy?'system-proxy':'direct',...(proxy?{proxy}:{})},choices=[normal,...(proxy?[{host,mode:'direct'}]:[])],attempts=[];
  for(const row of choices){try{await probe(row,{signal:controller.signal});return row;}catch(error){attempts.push({mode:row.mode,code:safeCode(error)});if(controller.signal.aborted)throw error;}}
  throw Object.assign(Error('LibTV 网络连接失败 '+host+'：'+attempts.map(row=>({'system-proxy':'系统代理',direct:'系统直连'}[row.mode])+':'+row.code).join(' / ')+'。'),{code:'LIBTV_NETWORK',host,attempts});
 }
 async function dynamicRoute(host){
  const plan=selected,key=plan.signature+'|'+host;let work=dynamicRoutes.get(key);
  if(!work){work=(async()=>{const row=await selectRoute(host,await resolveProxy('https://'+host));if(selected===plan)plan.routes.push(row);return row;})();dynamicRoutes.set(key,work);work.catch(()=>dynamicRoutes.delete(key));}
  return work;
 }
 function connectBeforeRelay(row,client){
  return new Promise((resolve,reject)=>{
   const upstream=track(connect(row));
   const timeout=setTimeout(()=>finish(Object.assign(Error('CONNECT timeout'),{code:'ETIMEDOUT'})),3500);
   const onError=error=>finish(error);
   const onClose=()=>finish(Object.assign(Error('CONNECT closed'),{code:'ECONNRESET'}));
   const onConnect=()=>finish();
   const onClientClose=()=>finish(Error('CLI tunnel closed'));
   function finish(error){
    clearTimeout(timeout);
    upstream.off('error',onError);
    upstream.off('close',onClose);
    upstream.off('connect',onConnect);
    client.off('close',onClientClose);
    if(error){upstream.destroy();reject(error);}else resolve(upstream);
   }
   upstream.once('error',onError);
   upstream.once('close',onClose);
   upstream.once('connect',onConnect);
   client.once('close',onClientClose);
  });
 }
 async function handleConnect(request,client,head){
  const deny=status=>{if(!client.destroyed)client.end('HTTP/1.1 '+status+'\r\nConnection: close\r\n\r\n');};
  if(request.headers['proxy-authorization']!==authorization)return deny('407 Proxy Authentication Required');
  const match=/^([a-z0-9.-]+):443$/i.exec(request.url||'');
  if(!match||!(officialHost(match[1])||mediaHost(match[1])))return deny('403 Forbidden');
  const host=match[1].toLowerCase();
  try{
   const row=selected?.routes.find(row=>row.host===host)||await dynamicRoute(host);
   if(closed||client.destroyed)return client.destroy();
   let upstream;
   try{upstream=await connectBeforeRelay(row,client);}
   catch(error){
    if(closed||client.destroyed||row.mode!=='system-proxy')throw error;
    upstream=await connectBeforeRelay({host,mode:'direct'},client);
   }
   if(closed||client.destroyed){upstream.destroy();return;}
   // Once CONNECT succeeds the CLI owns the TLS stream. Never replay it.
   const fail=()=>{client.destroy();upstream.destroy();};
   client.once('error',fail);
   upstream.once('error',fail);
   upstream.setTimeout?.(120000,fail);
   client.once('close',()=>upstream.destroy());
   upstream.once('close',()=>client.destroy());
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head.length)upstream.write(head);
   client.pipe(upstream);
   upstream.pipe(client);
  }catch{deny('502 Bad Gateway');}
 }
 async function start(){
  if(server?.listening)return;
  if(starting)return starting;
  starting=new Promise((resolve,reject)=>{
   server=http.createServer((_q,response)=>{response.writeHead(405);response.end();});
   server.on('connection',track);
   server.on('connect',handleConnect);
   server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  try{await starting;}finally{starting=null;}
 }
 async function environment(){if(closed)throw Error('LibTV 网络连接已关闭');const rules=await Promise.all(API_HOSTS.map(host=>resolveProxy('https://'+host))),signature=JSON.stringify(rules);if(selected?.signature===signature&&Date.now()-selected.time<60000)return output();if(pending)return pending;
  pending=(async()=>{const settled=await Promise.allSettled(API_HOSTS.map((host,index)=>selectRoute(host,rules[index])));if(closed)throw Error('LibTV 网络连接已关闭');const routes=settled.filter(row=>row.status==='fulfilled').map(row=>row.value);if(!routes.length)throw settled.find(row=>row.status==='rejected')?.reason||Error('LibTV 网络连接失败');dynamicRoutes.clear();selected={signature,time:Date.now(),routes};if(routes.some(row=>row.mode!=='direct'))await start();return output();})();try{return await pending;}finally{pending=null;}
 }
 function output(){const routes=selected.routes.map(({host,mode})=>({host,mode}));if(selected.routes.every(row=>row.mode==='direct'))return{env:{HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NODE_USE_ENV_PROXY:undefined},routes};const url='http://xz:'+secret+'@127.0.0.1:'+server.address().port;return{env:{HTTP_PROXY:url,HTTPS_PROXY:url,ALL_PROXY:'',http_proxy:url,https_proxy:url,all_proxy:'',NO_PROXY:'localhost,127.0.0.1,::1',no_proxy:'localhost,127.0.0.1,::1',NODE_USE_ENV_PROXY:'1'},routes};}
 async function close(){closed=true;controller.abort();for(const socket of sockets)socket.destroy();if(server?.listening)await new Promise(resolve=>server.close(resolve));}
 return{environment,close,invalidate:()=>{selected=null;dynamicRoutes.clear();}};
}
module.exports={createLibTVNetwork,officialHost,proxyFromRules};

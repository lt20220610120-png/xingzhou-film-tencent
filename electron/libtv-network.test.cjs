const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const source=path.join(__dirname,'libtv-network.cjs'),network=fs.existsSync(source)?require(source):{};
function create(options={}){assert.equal(typeof network.createLibTVNetwork,'function');return network.createLibTVNetwork({resolveProxy:async()=> 'DIRECT',probe:async()=>{},...options});}
test('ordinary desktop networking keeps native direct transport after read-only TLS capability checks',async()=>{const seen=[],n=create({probe:async row=>seen.push(row)});try{const result=await n.environment();assert.equal(result.env.NODE_USE_ENV_PROXY,undefined);assert(seen.length>=3);assert(seen.every(row=>row.mode==='direct'));assert.equal(result.routes.every(row=>row.mode==='direct'),true);}finally{await n.close();}});
test('normal system proxy opts bundled Node fetch into proxy support',async()=>{const seen=[],n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',probe:async row=>seen.push(row)});try{const result=await n.environment();assert.equal(result.env.NODE_USE_ENV_PROXY,'1');assert(result.env.HTTPS_PROXY.startsWith('http://'));assert(seen.every(row=>row.mode==='system-proxy'));assert(result.routes.every(row=>row.mode==='system-proxy'));}finally{await n.close();}});
test('reference uploads resolve the storage host’s PAC route even when all API hosts are direct',async t=>{
 const host='libtv-resource-prod.oss-accelerate.aliyuncs.com',attempts=[];
 const n=create({
  resolveProxy:async url=>new URL(url).hostname===host?'PROXY 127.0.0.1:7897':'DIRECT',
  connect:row=>{attempts.push(row);const stream=new (require('node:stream').PassThrough)();queueMicrotask(()=>stream.emit('connect'));return stream;}
 });
 t.after(()=>n.close());
 const [ordinary,upload]=await Promise.all([n.environment(),n.environment({upload:true})]);
 assert.equal(ordinary.env.NODE_USE_ENV_PROXY,undefined);
 assert.equal(upload.env.NODE_USE_ENV_PROXY,'1');
 const proxy=new URL(upload.env.HTTPS_PROXY);
 await new Promise((resolve,reject)=>{
  const request=http.request({host:proxy.hostname,port:proxy.port,path:host+':443',method:'CONNECT',headers:{'Proxy-Authorization':'Basic '+Buffer.from(proxy.username+':'+proxy.password).toString('base64')}});
  request.on('connect',(response,socket)=>{socket.destroy();try{assert.equal(response.statusCode,200);resolve();}catch(error){reject(error);}});
  request.on('error',reject);request.end();
 });
 assert.deepEqual(attempts.map(row=>[row.host,row.mode]),[[host,'system-proxy']]);
});
test('when the system proxy drops a fresh CONNECT, direct fallback runs before any CLI bytes',async t=>{
 const echo=net.createServer(socket=>socket.pipe(socket));
 await new Promise(resolve=>echo.listen(0,'127.0.0.1',resolve));
 t.after(()=>echo.close());
 const attempts=[];
 const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',connect:row=>{
  attempts.push(row.mode);
  if(row.mode==='direct')return net.connect(echo.address().port,'127.0.0.1');
  const socket=new (require('node:stream').PassThrough)();
  queueMicrotask(()=>socket.destroy(Object.assign(Error('reset'),{code:'ECONNRESET'})));
  return socket;
 }});
 t.after(()=>n.close());
 const proxy=new URL((await n.environment()).env.HTTPS_PROXY);
 const socket=await new Promise((resolve,reject)=>{
  const request=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:'api.liblib.tv:443',headers:{'Proxy-Authorization':'Basic '+Buffer.from(proxy.username+':'+proxy.password).toString('base64')}});
  request.on('connect',(r,s)=>{if(r.statusCode===200)resolve(s);else{s.destroy();reject(Error(String(r.statusCode)));}});
  request.on('error',reject);
  request.end();
 });
 const response=new Promise(resolve=>socket.once('data',resolve));
 socket.write('one payload');
 assert.equal(String(await response),'one payload');
 socket.destroy();
 assert.deepEqual(attempts,['system-proxy','direct']);
});
test('one auxiliary LibTV host timeout does not reject the whole account connection',async()=>{const seen=[],n=create({probe:async row=>{seen.push(row.host);if(row.host==='bridge.liblib.art')throw Object.assign(Error('timeout'),{code:'ETIMEDOUT'});}});try{const result=await n.environment();assert.equal(result.routes.some(row=>row.host==='bridge.liblib.art'),false);assert.equal(result.routes.length,3);assert(seen.includes('api2.liblib.art'));}finally{await n.close();}});
test('proxy-aware routing stays active for media when all API hosts select direct',async()=>{
 const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',probe:async row=>{
  if(row.mode==='system-proxy')throw Object.assign(Error('API proxy unavailable'),{code:'ECONNRESET'});
 }});
 try{
  const route=await n.environment();
  assert.ok(route.routes.every(row=>row.mode==='direct'));
  assert.equal(route.env.NODE_USE_ENV_PROXY,'1');
  assert.match(route.env.HTTPS_PROXY,/127\.0\.0\.1/);
 }finally{await n.close();}
});
test('scoped CONNECT tunnel carries opaque TLS bytes once and rejects unknown hosts or unauthenticated users',async t=>{let connections=0;const echo=net.createServer(socket=>{connections++;socket.pipe(socket);});await new Promise(resolve=>echo.listen(0,'127.0.0.1',resolve));t.after(()=>echo.close());const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',connect:row=>net.connect(echo.address().port,'127.0.0.1')});t.after(()=>n.close());const result=await n.environment(),proxy=new URL(result.env.HTTPS_PROXY),auth='Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64');const connect=(host,credentials=auth)=>new Promise((resolve,reject)=>{const req=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:host+':443',headers:credentials?{'Proxy-Authorization':credentials}:{}});req.on('connect',(res,socket)=>resolve({status:res.statusCode,socket}));req.on('error',reject);req.end();});const denied=await connect('evil.invalid');assert.equal(denied.status,403);denied.socket.destroy();const unauthorized=await connect('api.liblib.tv',null);assert.equal(unauthorized.status,407);unauthorized.socket.destroy();const tunnel=await connect('api.liblib.tv');assert.equal(tunnel.status,200);const bytes=Buffer.from([22,3,1,0,4,0,255,1,2]);const response=new Promise(resolve=>tunnel.socket.once('data',resolve));tunnel.socket.write(bytes);assert.deepEqual(await response,bytes);tunnel.socket.destroy();assert.equal(connections,1);});
test('official upload buckets receive authenticated HTTPS tunnels while foreign buckets and internal endpoints remain blocked',async t=>{const echo=net.createServer(socket=>socket.pipe(socket));await new Promise(resolve=>echo.listen(0,'127.0.0.1',resolve));t.after(()=>echo.close());const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',connect:()=>net.connect(echo.address().port,'127.0.0.1')});t.after(()=>n.close());const proxy=new URL((await n.environment()).env.HTTPS_PROXY),auth='Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64');async function status(host){return new Promise((resolve,reject)=>{const request=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:host+':443',headers:{'Proxy-Authorization':auth}});request.on('connect',(response,socket)=>{socket.destroy();resolve(response.statusCode);});request.on('error',reject);request.end();});}for(const host of ['liblibai-online.oss-accelerate.aliyuncs.com','liblibai-tmp-image.oss-cn-beijing.aliyuncs.com'])assert.equal(await status(host),200);for(const host of ['foreign.oss-cn-beijing.aliyuncs.com','liblibai-online.oss-cn-beijing-internal.aliyuncs.com','liblibai-online.oss-cn-beijing.aliyuncs.com.evil.invalid','127.0.0.1','169.254.169.254','localhost'])assert.equal(await status(host),403);});
test('upload bridge is verified before exposing a child route',async()=>{const seen=[],n=create({probe:async row=>seen.push(row.host)});try{await n.environment();assert(seen.includes('bridge.liblib.art'));}finally{await n.close();}});
test('the production storage host actually used by CLI 1.1.3 is eligible for its own upload route',()=>{
 assert.equal(network.acceptsHost('libtv-resource-prod.oss-accelerate.aliyuncs.com'),true);
 for(const foreign of ['libtv-resource-test.oss-accelerate.aliyuncs.com','libtv-resource-prod.oss-accelerate.aliyuncs.com.example.test','libtv-resource-prod.oss-accelerate-internal.aliyuncs.com','foreign.oss-accelerate.aliyuncs.com']){
  assert.equal(network.acceptsHost(foreign),false,foreign);
 }
});
test('dynamic official media hosts use the normal direct route before CONNECT accepts child bytes',async t=>{let chosen;const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',connect:row=>{chosen=row;const {PassThrough}=require('node:stream'),socket=new PassThrough();socket.setTimeout=()=>{};queueMicrotask(()=>socket.emit('connect'));return socket;}});t.after(()=>n.close());const proxy=new URL((await n.environment()).env.HTTPS_PROXY);await new Promise((resolve,reject)=>{const request=http.request({host:proxy.hostname,port:proxy.port,path:'libtv-res.liblib.art:443',method:'CONNECT',headers:{'Proxy-Authorization':'Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64')}});request.on('connect',(_r,socket)=>{socket.destroy();resolve();});request.on('error',reject);request.end();});assert.equal(chosen.mode,'system-proxy');assert.equal(chosen.host,'libtv-res.liblib.art');assert.equal(chosen.ip,undefined);});
test('official default watermark endpoint is tunneled without opening other Xingliu hosts',async t=>{const echo=net.createServer(socket=>socket.pipe(socket));await new Promise(resolve=>echo.listen(0,'127.0.0.1',resolve));t.after(()=>echo.close());const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',connect:()=>net.connect(echo.address().port,'127.0.0.1')});t.after(()=>n.close());const proxy=new URL((await n.environment()).env.HTTPS_PROXY),auth='Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64');async function status(host){return new Promise((resolve,reject)=>{const request=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:host+':443',headers:{'Proxy-Authorization':auth}});request.on('connect',(response,socket)=>{socket.destroy();resolve(response.statusCode);});request.on('error',reject);request.end();});}assert.equal(await status('canva.xingliu.art'),200);for(const host of ['client.xingliu.art','other.xingliu.art','canva.xingliu.art.evil.invalid'])assert.equal(await status(host),403);});

function requestTunnel(environment,host){
 const proxy=new URL(environment.env.HTTPS_PROXY);
 return new Promise((resolve,reject)=>{
  const request=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:host+':443',headers:{
   'Proxy-Authorization':'Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64'),
  }});
  request.on('connect',(response,socket)=>{socket.destroy();resolve(response.statusCode);});
  request.on('error',reject);request.end();
 });
}

test('a slow first CONNECT can use the direct route before the tunnel accepts CLI bytes',async t=>{
 const {PassThrough}=require('node:stream'),calls=[];
 const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',probe:async()=>{},connectTimeout:30,connect:row=>{
  calls.push(row.mode);const socket=new PassThrough();
  if(row.mode==='direct')queueMicrotask(()=>socket.emit('connect'));
  return socket;
 }});
 t.after(()=>n.close());
 const environment=await n.environment({upload:true});
 assert.equal(await requestTunnel(environment,'libtv-resource-prod.oss-accelerate.aliyuncs.com'),200);
 assert.deepEqual(calls,['system-proxy','direct']);
});

test('upload diagnoses a blocked destination or least-successful CONNECT without leaking other command data',async t=>{
 const {PassThrough}=require('node:stream');
 const n=create({probe:async()=>{},connect:()=>{
  const socket=new PassThrough();
  queueMicrotask(()=>socket.destroy(Object.assign(Error('private-proxy.example?key=secret'),{code:'ECONNRESET'})));
  return socket;
 }});
 t.after(()=>n.close());
 const left=await n.environment({upload:true}),right=await n.environment({upload:true});
 const generic={code:'LIBTV_NETWORK',networkCode:'FETCH_FAILED',retryable:true};
 assert.equal(await requestTunnel(left,'forbidden-test-bucket.oss-cn-beijing.aliyuncs.com'),403);
 assert.equal(await requestTunnel(right,'libtv-resource-prod.oss-accelerate.aliyuncs.com'),502);
 const blocked=left.diagnose(generic),broken=right.diagnose(generic);
 assert.equal(blocked.retryable,false);
 assert.match(blocked.message,/域名.*拦截/);
 assert.doesNotMatch(blocked.message,/forbidden-test-bucket/);
 assert.equal(broken.retryable,true);
 assert.match(broken.message,/连接被重置/);
 assert.match(broken.message,/libtv-resource-prod\.oss-accelerate\.aliyuncs\.com/);
 assert.doesNotMatch(broken.message,/private-proxy|secret/);
 left.dispose();right.dispose();
});

test('same verified OSS production bucket may use a public regional endpoint, never a different or internal bucket',()=>{
 assert.ok(network.acceptsHost('libtv-resource-prod.oss-cn-shanghai.aliyuncs.com'));
 assert.ok(network.acceptsHost('libtv-resource-prod.oss-ap-southeast-1.aliyuncs.com'));
 for(const host of ['libtv-resource-staging.oss-cn-shanghai.aliyuncs.com','libtv-resource-prod.oss-cn-shanghai-internal.aliyuncs.com','libtv-resource-prod.oss-cn-shanghai.aliyuncs.com.evil.invalid']){
  assert.equal(network.acceptsHost(host),false);
 }
});

test('a blocked optional tunnel does not overwrite a later approved upload route or explicit CLI error',async t=>{
 const {PassThrough}=require('node:stream');
 const n=create({probe:async()=>{},connect:()=>{
  const socket=new PassThrough();queueMicrotask(()=>socket.emit('connect'));return socket;
 }});
 t.after(()=>n.close());
 const environment=await n.environment({upload:true});
 const authorization=Error('authorization from CLI');
 const generic={code:'LIBTV_NETWORK',networkCode:'FETCH_FAILED',retryable:true};
 assert.equal(await requestTunnel(environment,'hidden.invalid'),403);
 assert.equal(environment.diagnose(authorization),authorization);
 assert.equal(await requestTunnel(environment,'bridge.liblib.art'),200);
 const current=environment.diagnose(generic);
 assert.equal(current.retryable,true);
 assert.deepEqual(current.routeHint,{host:'bridge.liblib.art',mode:'direct'});
 environment.dispose();
 assert.equal(await requestTunnel(environment,'bridge.liblib.art'),407);
});

test('an upload retry tries the other route only for the host whose stream failed',async t=>{
 const {PassThrough}=require('node:stream'),modes=[];
 const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',probe:async()=>{},connect:row=>{
  modes.push(row.mode);const socket=new PassThrough();queueMicrotask(()=>socket.emit('connect'));return socket;
 }});
 t.after(()=>n.close());
 const first=await n.environment({upload:true});
 const host='libtv-resource-prod.oss-accelerate.aliyuncs.com';
 assert.equal(await requestTunnel(first,host),200);
 const failed=first.diagnose({code:'LIBTV_NETWORK',networkCode:'FETCH_FAILED',retryable:true});
 first.dispose();n.invalidate();
 const second=await n.environment({upload:true,retryRoute:failed.routeHint});
 assert.equal(await requestTunnel(second,'bridge.liblib.art'),200);
 assert.equal(await requestTunnel(second,host),200);
 assert.deepEqual(modes,['system-proxy','system-proxy','direct']);
 second.dispose();
});

test('a route invalidation during a probe keeps a subsequent upload off the expired plan',async t=>{
 const {PassThrough}=require('node:stream');
 let old=true;
 const parked=[];
 const n=create({resolveProxy:async()=>old?'PROXY 127.0.0.1:7897':'DIRECT',probe:row=>old?new Promise(resolve=>parked.push(resolve)):Promise.resolve(),connect:row=>{
  const socket=new PassThrough();assert.equal(row.mode,'direct');queueMicrotask(()=>socket.emit('connect'));return socket;
 }});
 t.after(()=>n.close());
 const stale=n.environment({upload:true}),observed=new Promise(resolve=>setImmediate(resolve));
 await observed;
 assert.equal(parked.length,4);
 old=false;n.invalidate();
 try{
  const current=await n.environment({upload:true,signal:AbortSignal.timeout(150)});
  assert.equal(await requestTunnel(current,'bridge.liblib.art'),200);
  current.dispose();
 }finally{
  for(const unblock of parked)unblock();
  (await stale).dispose();
 }
});

test('a DIRECT-first PAC rule may fall back to its configured proxy before relaying',async t=>{
 const {PassThrough}=require('node:stream'),attempted=[];
 const n=create({resolveProxy:async()=> 'DIRECT; PROXY 127.0.0.1:7897',probe:async()=>{},connect:row=>{
  attempted.push(row.mode);const socket=new PassThrough();
  if(row.mode==='direct')queueMicrotask(()=>socket.destroy(Object.assign(Error('reset'),{code:'ECONNRESET'})));
  else queueMicrotask(()=>socket.emit('connect'));
  return socket;
 }});
 t.after(()=>n.close());
 const environment=await n.environment({upload:true});
 assert.equal(await requestTunnel(environment,'bridge.liblib.art'),200);
 assert.deepEqual(attempted,['direct','system-proxy']);
 environment.dispose();
});

test('cancelling a route wait and closing the service interrupt pending TLS probes',async()=>{
 const n=create({probe:(_row,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
 const controller=new AbortController();
 const pending=n.environment({upload:true,signal:controller.signal});
 const stopped=assert.rejects(pending,{name:'AbortError'});
 await new Promise(resolve=>setImmediate(resolve));controller.abort();await stopped;await n.close();
});

test('the actual spawned CLI uses a loopback CONNECT route and is killed on external cancellation',async t=>{
 const {PassThrough}=require('node:stream'),{spawnCLI}=require('./libtv-service.cjs'),os=require('node:os'),children=new Set();
 let forwarded=0;
 const n=create({resolveProxy:async()=> 'PROXY 127.0.0.1:7897',probe:async()=>{},connect:row=>{
  const duplex=new PassThrough();
  if(row.mode==='system-proxy')queueMicrotask(()=>duplex.destroy(Object.assign(Error('fixture proxy unavailable'),{code:'PROXY_HTTP_502'})));
  else{forwarded++;queueMicrotask(()=>duplex.emit('connect'));}
  return duplex;
 }});
 t.after(()=>n.close());
 const route=await n.environment({upload:true});
 const executable=process.execPath;
 const childProgram=[
  "const http=require('node:http'),proxy=new URL(process.env.HTTPS_PROXY);",
  "const auth='Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64');",
  "const child=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:'bridge.liblib.art:443',headers:{'Proxy-Authorization':auth}});",
  "child.on('connect',(response,socket)=>{if(response.statusCode!==200)process.exit(2);process.stderr.write('ready');socket.on('data',()=>{});});child.end();",
 ].join('');
 const abort=new AbortController();
 const operation=spawnCLI(executable,['-e',childProgram],{configDir:os.tmpdir(),cwd:os.tmpdir(),children,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(2500)]),
  networkEnv:route.env,onStderr:chunk=>{if(chunk.includes('ready'))abort.abort();}});
 try{
  await assert.rejects(operation,/等待已停止/);
  assert.equal(abort.signal.aborted,true);assert.equal(forwarded,1);assert.equal(children.size,0);
 }finally{route.dispose();}
});

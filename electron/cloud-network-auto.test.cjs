const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),https=require('node:https'),{PassThrough}=require('node:stream'),{EventEmitter}=require('node:events');
const route=require('./cloud-network.cjs');
function fixture(t){const originalInterfaces=os.networkInterfaces,originalRequest=https.request;os.networkInterfaces=()=>({Meta:[{family:'IPv4',internal:false,address:'198.18.0.1'}],WLAN:[{family:'IPv4',internal:false,address:'192.168.0.248'}]});route.configure({});const native=[];https.request=(url,options,callback)=>{native.push({url:String(url),options});const request=new EventEmitter();request.setTimeout=()=>{};request.write=()=>{};request.destroy=error=>request.emit('error',error);request.end=()=>queueMicrotask(()=>{const response=new PassThrough();response.statusCode=200;response.headers={'content-type':'application/json'};callback(response);response.end('{"ok":true}');});return request;};t.after(()=>{route.configure({});os.networkInterfaces=originalInterfaces;https.request=originalRequest;});return native;}
const reset=()=>Object.assign(Error('fetch failed'),{cause:{code:'ECONNRESET'}});
test('disabled preference automatically repairs official reads and remembers physical transport for one-shot writes',async t=>{const native=fixture(t);let defaults=0;const fallback=async()=>{defaults++;throw reset();};const response=await route.routeFetch('https://xingzhoufilm.cn/api/gateway',{method:'POST',body:'{"action":"project-get"}'},fallback,{safeToRetry:true});assert.deepEqual(await response.json(),{ok:true});assert.equal(route.settings().enabled,false);assert.equal(native[0].options.localAddress,'192.168.0.248');await route.routeFetch('https://xingzhoufilm.cn/api/gateway',{method:'POST',body:'{"action":"project-create"}'},fallback);assert.equal(defaults,1);assert.equal(native.length,2);});
test('COS safe read automatically repairs an interrupted system route without forwarding to lookalike hosts',async t=>{const native=fixture(t);const response=await route.routeFetch('https://bucket.cos.ap-guangzhou.myqcloud.com/a',{},async()=>{throw reset();});assert.equal(response.status,200);assert.equal(native.length,1);await assert.rejects(route.routeFetch('https://bucket.cos.ap-guangzhou.myqcloud.com.evil.invalid/a',{},async()=>{throw reset();}),/fetch failed/);assert.equal(native.length,1);});
test('automatic routing never repeats ambiguous POST or stream PUT and cancellation suppresses fallback',async t=>{const native=fixture(t);for(const init of [{method:'POST',body:'{}'},{method:'PUT',body:new PassThrough()}])await assert.rejects(route.routeFetch('https://xingzhoufilm.cn/api/gateway',init,async()=>{throw reset();}),/fetch failed/);const controller=new AbortController();controller.abort();await assert.rejects(route.routeFetch('https://xingzhoufilm.cn/healthz',{signal:controller.signal},async()=>{throw reset();}),/fetch failed/);assert.equal(native.length,0);});
test('OFF settings probe uses bundled IP CA, retains pin validation and reports its actual route',async t=>{const native=fixture(t),original=global.fetch;global.fetch=async()=>{throw Object.assign(Error('fetch failed'),{cause:{code:'DEPTH_ZERO_SELF_SIGNED_CERT'}});};t.after(()=>global.fetch=original);const result=await route.probe();assert.equal(result.ok,true);assert.equal(result.enabled,false);assert.equal(result.transport,'system-native');assert(native[0].options.ca);assert.equal(native[0].options.rejectUnauthorized,true);assert.equal(native[0].options.servername,'');assert.equal(native[0].options.localAddress,undefined);});
test('gateway does not replay an ambiguous connection reset after a non-idempotent write',async t=>{fixture(t);const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw reset();};t.after(()=>global.fetch=original);await assert.rejects(require('./cloud-access-service.cjs').gateway('project-create',{},'fixture-token'),/未确认/);assert.equal(calls,1);});
test('fallback deadline stops after response headers so a healthy large COS transfer is not aborted',async t=>{fixture(t);let signal;await route.routeFetch('https://bucket.cos.ap-guangzhou.myqcloud.com/large',{},async(_url,init)=>{signal=init.signal;return new Response('body');});await new Promise(resolve=>setTimeout(resolve,4200));assert.equal(signal.aborted,false);});
test('physical response interruption retains a retryable connection error code',async t=>{fixture(t);const originalRequest=https.request;let stream;https.request=(url,options,callback)=>{const request=new EventEmitter();request.setTimeout=()=>{};request.end=()=>{stream=new PassThrough();stream.statusCode=200;stream.headers={};callback(stream);stream.write('partial');};return request;};const response=await route.directFetch('https://xingzhoufilm.cn/a');const body=response.arrayBuffer();stream.emit('aborted');await assert.rejects(body,error=>error.code==='ECONNRESET');https.request=originalRequest;});
test('license preflight can safely use automatic physical fallback with the preference OFF',async t=>{const native=fixture(t),original=global.fetch;global.fetch=async()=>{throw reset();};t.after(()=>global.fetch=original);assert.deepEqual(await require('./cloud-access-service.cjs').gateway('license-check',{},'fixture-token'),{ok:true});assert.equal(native[0].options.localAddress,'192.168.0.248');});
test('failed settings diagnostic names both tested routes and safe error codes',async t=>{fixture(t);https.request=()=>{const request=new EventEmitter();request.setTimeout=()=>{};request.end=()=>queueMicrotask(()=>request.emit('error',Object.assign(Error('socket hang up'),{code:'ECONNRESET'})));return request;};await assert.rejects(route.probe(),error=>/系统网络.*ECONNRESET/.test(error.message)&&/物理网络.*ECONNRESET/.test(error.message)&&error.attempts.length===2);});

test('storyboard save on the normal route can wait longer than four seconds for a response',async t=>{
 const native=fixture(t),original=global.fetch;
 t.mock.timers.enable({apis:['setTimeout']});
 let finish;
 global.fetch=(_url,{signal})=>new Promise((resolve,reject)=>{
  finish=()=>resolve(Response.json({savedBy:'normal-route'}));
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 });
 t.after(()=>{global.fetch=original;});
 const save=require('./cloud-access-service.cjs').gateway('storyboard-patch',{operation:'update',shotId:'slow-shot'},'fixture-token');
 t.mock.timers.tick(4500);
 finish();
 assert.deepEqual(await save,{savedBy:'normal-route'});
 assert.equal(native.length,0);
});

test('an automatic physical read does not change the normal route for the following storyboard save',async t=>{
 const native=fixture(t),original=global.fetch,calls=[];
 global.fetch=async(_url,init)=>{
  const {action}=JSON.parse(init.body);calls.push(action);
  if(action==='project-get')throw reset();
  return Response.json({savedBy:'normal-route'});
 };
 t.after(()=>{global.fetch=original;});
 const {gateway}=require('./cloud-access-service.cjs');
 await gateway('project-get',{projectId:'fixture-project'},'fixture-token');
 assert.deepEqual(await gateway('storyboard-patch',{operation:'update',shotId:'fixture-shot'},'fixture-token'),{savedBy:'normal-route'});
 assert.deepEqual(calls,['project-get','storyboard-patch']);
 assert.equal(native.length,1);
});

test('a reset after a storyboard save may have committed and must not resend its signed request',async t=>{
 const native=fixture(t),original=global.fetch,writes=[],{gateway,setLicenseDecorator}=require('./cloud-access-service.cjs');
 let challenges=0;
 setLicenseDecorator(async(_action,payload)=>({...payload,_licenseProof:{nonce:`challenge-${++challenges}`}}));
 global.fetch=async(_url,init)=>{writes.push(JSON.parse(init.body));throw reset();};
 t.after(()=>{global.fetch=original;setLicenseDecorator(null);});
 await assert.rejects(gateway('storyboard-patch',{operation:'update',shotId:'fixture-shot'},'fixture-token'),/未确认本次保存/);
 assert.equal(writes.length,1);
 assert.equal(challenges,1);
 assert.equal(native.length,0);
});

test('a proven DNS failure permits a fresh proof on the backup endpoint before any save was delivered',async t=>{
 const native=fixture(t),original=global.fetch,writes=[],{gateway,setLicenseDecorator}=require('./cloud-access-service.cjs');
 let challenges=0;
 setLicenseDecorator(async(_action,payload)=>({...payload,_licenseProof:{nonce:`challenge-${++challenges}`}}));
 global.fetch=async(url,init)=>{
  writes.push({url,...JSON.parse(init.body)});
  if(writes.length===1)throw Object.assign(Error('DNS unavailable'),{code:'ENOTFOUND'});
  return Response.json({saved:true});
 };
 t.after(()=>{global.fetch=original;setLicenseDecorator(null);});
 assert.deepEqual(await gateway('storyboard-patch',{operation:'update',shotId:'fixture-shot'},'fixture-token'),{saved:true});
 assert.equal(writes.length,2);
 assert.notEqual(writes[0].url,writes[1].url);
 assert.deepEqual(writes.map(write=>write.shotId),['fixture-shot','fixture-shot']);
 assert.deepEqual(writes.map(write=>write._licenseProof.nonce),['challenge-1','challenge-2']);
 assert.equal(native.length,0);
});

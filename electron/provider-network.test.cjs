const test=require('node:test'),assert=require('node:assert/strict');
const {configureAPIFetch}=require('./win-ai-api-fetch.cjs');
test('FT, legacy FT and configurable video adapters share the configured API transport',async t=>{
 const seen=[];
 t.after(()=>configureAPIFetch(undefined));
 t.mock.method(global,'fetch',()=>{throw Error('provider bypassed desktop transport');});
 configureAPIFetch(async(url,init)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'future',type:'video'}]});seen.push({url,init});return Response.json({id:'task',jobId:'task',status:'queued'});});
 const common={kind:'video',apiKey:'fixture',model:'future',prompt:'fixture',duration:5,ratio:'16:9',resolution:'720p',references:[]};
 await require('./fnko-client.cjs').submit({...common,endpoint:'https://fanke2026.xyz/v1',idempotencyKey:'fixture'});
 await require('./feituo-client.cjs').submit({...common,modelCapabilities:{maxImages:0,maxAudios:0,maxVideos:0}});
 for(const protocol of ['ark','videos-json','custom']){
  await require('./video-provider.cjs').submit({...common,endpoint:'https://provider.invalid/v1',videoProtocol:protocol,...(protocol==='custom'?{videoAdapter:{submitPath:'render',queryPath:'task/{{taskId}}',requestTemplate:{model:'{{model}}',prompt:'{{prompt}}'},response:{taskId:'jobId'}}}:{})});
 }
 assert.equal(seen.length,5);assert(seen.every(({init})=>init.method==='POST'));
 assert(seen.every(({init})=>init.headers.Authorization==='Bearer fixture'));
});
test('desktop transport omits web cookies and preserves multipart, abort and redirect policy',async()=>{
 const form=new FormData();form.append('file',new Blob(['reference']),'ref.png');
 const controller=new AbortController();let captured;
 const fetch=require('./desktop-api-transport.cjs').createDesktopAPIFetch({fetch:async(url,init)=>{captured=init;return new Response('ok');}});
 await fetch('https://provider.invalid',{method:'POST',body:form,signal:controller.signal,redirect:'error',credentials:'include',headers:{Authorization:'fixture'}});
 assert.equal(captured.credentials,'omit');assert.equal(captured.body,form);assert.equal(captured.signal,controller.signal);assert.equal(captured.redirect,'error');
});
test('protected content redirect uses native read adapter rather than unsupported net.fetch manual',async()=>{
 const {EventEmitter}=require('node:events');let request,options;
 const fetch=require('./desktop-api-transport.cjs').createDesktopAPIFetch({fetch:()=>{throw Error('manual unsupported');},request:init=>{options=init;request=new EventEmitter();request.setHeader=()=>{};request.abort=()=>{};request.end=()=>queueMicrotask(()=>request.emit('redirect',302,'GET','https://cdn.invalid/result',{}));return request;}});
 const response=await fetch('https://provider.invalid/content',{redirect:'manual',headers:{Authorization:'fixture'}});
 assert.equal(response.status,302);assert.equal(options.useSessionCookies,false);assert.equal(response.headers.get('location'),'https://cdn.invalid/result');
});

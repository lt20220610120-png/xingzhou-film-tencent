const test=require('node:test'),assert=require('node:assert/strict');
const config={endpoint:'http://127.0.0.1:7891/v1',model:'Qwen3-TTS-12Hz-1.7B-VoiceDesign'};
test('cold local voice requests share one startup and recheck readiness on next invocation',async()=>{
 const {createAudioServiceReady}=require('./audio-service-ready.cjs');let ready=false,starts=0;
 const ensure=createAudioServiceReady({fetchFn:async()=>{if(!ready)throw Error('net:ERR_CONNECTION_REFUSED');return Response.json({ready:true,model:config.model});},startLocal:async()=>{starts++;await new Promise(r=>setTimeout(r,10));ready=true;},delay:async()=>{}});
 await Promise.all(Array.from({length:6},()=>ensure(config)));assert.equal(starts,1);
 ready=false;await ensure(config);assert.equal(starts,2);
});
test('cloud service starts through explicit endpoint then polls; never submits speech in readiness checks',async()=>{
 const {createAudioServiceReady}=require('./audio-service-ready.cjs');const calls=[];let ready=false;
 const ensure=createAudioServiceReady({fetchFn:async(url,o={})=>{calls.push([url,o.method||'GET']);if(url.endsWith('/start')){ready=true;return Response.json({});}return Response.json({ready},{status:ready?200:503});},delay:async()=>{}});
 await ensure({endpoint:'https://voice.invalid/v1',model:'cloud',serviceHealthUrl:'https://voice.invalid/health',serviceStartUrl:'https://voice.invalid/start'});
 assert.equal(calls.filter(c=>c[1]==='POST').length,1);assert(!calls.some(c=>c[0].includes('/audio/speech')));
});
test('account cancellation prevents generation readiness and no cloud startup is guessed',async()=>{
 const {createAudioServiceReady}=require('./audio-service-ready.cjs');let calls=0;
 const ensure=createAudioServiceReady({fetchFn:async()=>{calls++;return new Response('',{status:503});},delay:async()=>{}});
 const controller=new AbortController();controller.abort(Error('账号切换'));
 await assert.rejects(ensure({...config,signal:controller.signal}),/账号切换/);assert.equal(calls,0);
 await assert.rejects(ensure({endpoint:'https://voice.invalid/v1',model:'cloud'}),/服务|启动/);assert.equal(calls,1);
});
test('unrelated loopback model never launches Qwen and custom URLs cannot receive another origin key',async()=>{
 const {createAudioServiceReady}=require('./audio-service-ready.cjs');let starts=0,calls=0;
 const ensure=createAudioServiceReady({fetchFn:async()=>{calls++;throw Error('refused');},startLocal:async()=>{starts++;}});
 await assert.rejects(ensure({...config,model:'different-model'}));assert.equal(starts,0);
 await assert.rejects(ensure({endpoint:'https://voice.invalid/v1',model:'x',serviceStartUrl:'https://other.invalid/start'}),/同源/);assert.equal(calls,1);
});
test('compatible cloud speech without a models route is reachable and explicit warming health still waits',async()=>{
 const {createAudioServiceReady}=require('./audio-service-ready.cjs');let starts=0,polls=0;
 await createAudioServiceReady({fetchFn:async()=>new Response('',{status:404})})({endpoint:'https://voice.invalid/v1',model:'cloud'});
 const ensure=createAudioServiceReady({fetchFn:async url=>{if(url.endsWith('/start')){starts++;return Response.json({});}polls++;return Response.json(polls<3?{status:'loading'}:{ready:true});},delay:async()=>{}});
 await ensure({endpoint:'https://voice.invalid/v1',model:'cloud',serviceHealthUrl:'https://voice.invalid/health',serviceStartUrl:'https://voice.invalid/start'});assert.equal(starts,1);assert.equal(polls,3);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {createGeminiQuitHandler}=require('./gemini-shutdown.cjs');
test('app waits for browser cleanup before exiting, and repeated quit events do not run cleanup twice',async()=>{
 let resolve,closed=0,quits=0,prevented=0;
 const service={close:()=>{closed++;return new Promise(r=>resolve=r);}};
 const handler=createGeminiQuitHandler({getService:()=>service,isUpdating:()=>false,quit:()=>quits++});
 const event={preventDefault:()=>prevented++};handler(event);handler(event);
 assert.equal(closed,1);assert.equal(quits,0);assert.equal(prevented,2);
 resolve();await new Promise(r=>setImmediate(r));assert.equal(quits,1);
 handler(event);assert.equal(prevented,2);
});
test('updating blocks quit without shutting down account browser',()=>{
 let closed=false,prevented=false;
 const handler=createGeminiQuitHandler({getService:()=>({close:()=>{closed=true;}}),isUpdating:()=>true,quit:()=>{throw Error('should not quit');}});
 handler({preventDefault:()=>prevented=true});assert.equal(prevented,true);assert.equal(closed,false);
});

test('slow disk save is never interrupted by the browser cleanup timeout',async()=>{
 let saved=false,quits=0,release,closed=0;
 const handler=createGeminiQuitHandler({getService:()=>({close:()=>{closed++;return new Promise(()=>{});}}),isUpdating:()=>false,quit:()=>{assert.equal(saved,true);quits++;},timeoutMs:5,beforeCleanup:()=>new Promise(r=>release=()=>{saved=true;r();})});
 handler({preventDefault(){}});await new Promise(r=>setTimeout(r,20));assert.equal(quits,0);assert.equal(closed,0);
 release();await new Promise(r=>setTimeout(r,20));assert.equal(quits,1);assert.equal(closed,1);
});

test('failed disk save keeps the app open and permits a successful retry',async()=>{
 let failed=true,errors=0,quits=0;
 const handler=createGeminiQuitHandler({getService:()=>null,isUpdating:()=>false,quit:()=>quits++,beforeCleanup:async()=>{if(failed)throw Error('disk full');},onSaveError:()=>errors++});
 handler({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(errors,1);assert.equal(quits,0);
 failed=false;handler({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(quits,1);
});

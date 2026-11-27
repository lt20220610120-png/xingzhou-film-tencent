const test=require('node:test'),assert=require('node:assert/strict');const{createProductionToolBridge}=require('./production-tool-bridge.cjs');
test('backend tool bridge only accepts a result from the requesting window and matching task',async()=>{const b=createProductionToolBridge();let request;const sender={id:1,send:(name,args)=>request=args};const work=b.request(sender,'run','xingzhou_task',{action:'inspect'});assert.throws(()=>b.respond({id:2},{id:request.id,runId:'run',result:{}}),/身份/);assert.throws(()=>b.respond(sender,{id:request.id,runId:'wrong',result:{}}),/身份/);b.respond(sender,{id:request.id,runId:'run',result:{real:true}});assert.deepEqual(await work,{real:true});});
test('identity change rejects every pending tool call and ignores late replies',async()=>{
 const bridge=createProductionToolBridge(),messages=[],sender={id:1,send:(_,message)=>messages.push(message)};
 const waits=['run-1','run-2'].map(runId=>assert.rejects(bridge.request(sender,runId,'tool',{}),/已停止/));
 bridge.cancel();await Promise.all(waits);
 assert.throws(()=>bridge.respond(sender,{...messages[0],result:{}}),/身份/);
});

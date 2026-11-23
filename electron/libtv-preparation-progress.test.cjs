const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createLibTVProgressOperations}=require('./libtv-preparation-progress.cjs');

test('progress is owned by its initiating renderer and carries only stage and counters',()=>{
 const operations=createLibTVProgressOperations(),messages=[];
 const sender={isDestroyed:()=>false,send:(name,data)=>messages.push({name,data})},operationId=randomUUID();
 const operation=operations.start(operationId,sender);
 operation.report({stage:'uploading',completed:2,total:8,token:'fixture-only'});
 assert.deepEqual(messages,[{name:'libtv-preparation-progress',data:{operationId,stage:'uploading',completed:2,total:8,cancellable:true}}]);
 assert.equal(operations.cancel(operationId,{}),false);
 assert.equal(operations.cancel(operationId,sender),true);
 assert.equal(operation.signal.aborted,true);
 assert.match(operation.signal.reason.message,/已取消/);
 operation.finish();
 assert.equal(operations.cancel(operationId,sender),false);
});

test('the paid boundary closes the preparation cancel control, preserving identity abort',()=>{
 const operations=createLibTVProgressOperations(),messages=[];
 const sender={isDestroyed:()=>false,send:(_,data)=>messages.push(data)},operationId=randomUUID();
 const identity=new AbortController();
 const operation=operations.start(operationId,sender,identity.signal);
 operation.report({stage:'submitting'});
 operation.commit();
 assert.deepEqual(messages.map(x=>x.cancellable),[true,false]);
 assert.equal(operations.cancel(operationId,sender),false);
 assert.equal(operation.signal.aborted,false);
 identity.abort();
 assert.equal(operation.signal.aborted,true);
 operation.finish();
});

test('the preload only relays LibTV progress data and strips nested IPC error prefixes',async()=>{
 const events=new Map();
 let api;
 const ipcRenderer={
  invoke:async(channel)=>{throw Error("Error invoking remote method '"+channel+"': Error: 连接超时");},
  on:(name,listener)=>events.set(name,listener),
  removeListener:(name,listener)=>{if(events.get(name)===listener)events.delete(name);},
 };
 const source=readFileSync(path.join(__dirname,'preload.cjs'),'utf8');
 vm.runInNewContext(source,{require(name){assert.equal(name,'electron');return {ipcRenderer,contextBridge:{exposeInMainWorld(_,bridge){api=bridge;}}};}});
 let observed;
 const remove=api.onLibTVProgress(value=>{observed=value;});
 const message={operationId:randomUUID(),stage:'uploading',completed:3,total:8};
 events.get('libtv-preparation-progress')({sender:'hidden'},message);
 assert.equal(observed,message);
 remove();
 assert.equal(events.size,0);
 await assert.rejects(api.libtvProjects(),{message:'连接超时'});
 await assert.rejects(api.generationSubmit({provider:'libtv'}),{message:'连接超时'});
 await assert.rejects(api.generationSubmit({provider:'other'}),/Error invoking remote method/);
});

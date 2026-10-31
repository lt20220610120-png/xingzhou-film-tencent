const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createAgentClient}=require('./production-agent.cjs');
function harness({ephemeral=true,rejectThread=false}={}){
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();const calls=[];let spawnOptions;
 const emit=value=>child.stdout.emit('data',Buffer.from(JSON.stringify(value)+'\n'));
 child.stdin={write:line=>{const m=JSON.parse(line);calls.push(m);if(m.id===undefined)return;
  const result=m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='model/list'?{data:[{id:'model'}]}:m.method==='thread/start'?{thread:{id:'test-owned',ephemeral}}:{};
  queueMicrotask(()=>{if(rejectThread&&m.method==='thread/start')return emit({id:m.id,error:{message:'unsupported ephemeral'}});emit({id:m.id,result});if(m.method==='turn/start'){emit({method:'item/agentMessage/delta',params:{threadId:'test-owned',delta:'完成'}});emit({method:'turn/completed',params:{threadId:'test-owned',turn:{status:'completed'}}});}});
 }};child.kill=()=>child.emit('exit');
 const client=createAgentClient({executable:process.execPath,cwd:process.cwd(),spawnProcess:(exe,args,options)=>{spawnOptions={exe,args,...options};return child;}});
 return {client,calls,options:()=>spawnOptions};
}
test('production Codex calls are hidden ephemeral sessions and still return Agent results',async()=>{
 const h=harness();try{await h.client.connect();assert.equal(await h.client.run({model:'model',prompt:'制作任务'}),'完成');assert.equal(await h.client.run({model:'model',prompt:'剪辑任务',edit:true}),'完成');
 const starts=h.calls.filter(m=>m.method==='thread/start');assert.equal(starts.length,2);assert(starts.every(m=>m.params.ephemeral===true));assert.equal(starts[0].params.sandbox,'read-only');assert.equal(starts[1].params.sandbox,'workspace-write');assert(starts.every(m=>m.params.approvalPolicy==='on-request'));assert.equal(h.options().windowsHide,true);assert.equal(h.options().shell,false);assert.deepEqual(h.options().args,['app-server','--listen','stdio://']);assert.equal(h.calls.filter(m=>m.method==='turn/start').length,2);
 }finally{h.client.close();}
});
test('an Agent that ignores ephemeral must not receive project prompts in a persistent chat',async()=>{
 const h=harness({ephemeral:false});try{await h.client.connect();await assert.rejects(h.client.run({model:'model',prompt:'不得发送到持久化聊天'}),/临时会话/);assert.equal(h.calls.filter(m=>m.method==='turn/start').length,0);}finally{h.client.close();}
});
test('unsupported ephemeral session never falls back to persistent thread creation',async()=>{
 const h=harness({rejectThread:true});try{await h.client.connect();await assert.rejects(h.client.run({model:'model',prompt:'不应重发'}),/ephemeral/);assert.equal(h.calls.filter(m=>m.method==='thread/start').length,1);assert.equal(h.calls.filter(m=>m.method==='turn/start').length,0);}finally{h.client.close();}
});

const test=require('node:test'),assert=require('node:assert/strict');
const {gateway}=require('./cloud-access-service.cjs');
test('read request times out and falls back; storyboard retry preserves request ID',async()=>{
 const original=global.fetch;let calls=[];
 global.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));if(calls.length===1)return new Promise(()=>{});return {ok:true,status:200,text:async()=>'{"ok":true}'};};
 try{assert.deepEqual(await gateway('storyboard-patch',{operation:'create',shotId:'stable'},'test',{timeoutMs:20}),{ok:true});assert.equal(calls.length,2);assert.equal(calls[0].shotId,calls[1].shotId);}finally{global.fetch=original;}
});
test('ambiguous non-idempotent write is not replayed and total outage is bounded',async()=>{
 const original=global.fetch;let count=0;global.fetch=async()=>{count++;return new Promise(()=>{});};
 try{await assert.rejects(gateway('project-create',{},'',{timeoutMs:15}),/未确认/);assert.equal(count,1);const start=Date.now();await assert.rejects(gateway('project-list',{},'',{timeoutMs:15}),/当前内容已保留/);assert.ok(Date.now()-start<1000);}finally{global.fetch=original;}
});

const test=require('node:test'),assert=require('node:assert/strict');
const {gateway}=require('./cloud-access-service.cjs');
test('storyboard save does not resend after its full gateway deadline',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return new Promise(()=>{});};
 try{await assert.rejects(gateway('storyboard-patch',{operation:'create',shotId:'stable'},'test',{timeoutMs:20}),/未确认本次保存/);assert.equal(calls,1);}finally{global.fetch=original;}
});
test('ambiguous non-idempotent write is not replayed and total outage is bounded',async()=>{
 const original=global.fetch;let count=0;global.fetch=async()=>{count++;return new Promise(()=>{});};
 try{await assert.rejects(gateway('project-create',{},'',{timeoutMs:15}),/未确认/);assert.equal(count,1);const start=Date.now();await assert.rejects(gateway('project-list',{},'',{timeoutMs:15}),/当前内容已保留/);assert.ok(Date.now()-start<1000);}finally{global.fetch=original;}
});

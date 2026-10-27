const test=require('node:test'),assert=require('node:assert/strict');
const {createCollabService}=require('./collab-service.cjs');
test('background publication pins its account before and after the remote request',async()=>{
 let current={account:{id:'A'},token:'A'},release,calls=0;const gate=new Promise(r=>release=r);
 const service=createCollabService(()=>current,{callGateway:async()=>{calls++;await gate;return {version:2};}});
 const pending=service.publishArtReview({projectId:'p',accountId:'A'});current={account:{id:'B'},token:'B'};release();
 await assert.rejects(pending,/账号已变化/);await assert.rejects(service.saveArtReview({projectId:'p',accountId:'A'}),/账号已变化/);assert.equal(calls,1);
});

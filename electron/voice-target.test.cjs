const test=require('node:test'),assert=require('node:assert/strict');const {voiceDataScope,assertVoiceTarget}=require('./voice-target.cjs');
test('queued voice requests validate original account, directory and project permissions before inference',async()=>{
 const now={accountId:'a',dataScope:voiceDataScope('A')},target={...now,projectId:'p'};let reads=0;
 const options={context:()=>now,getProject:async()=>{reads++;return {myRole:'artist'};}};
 await assertVoiceTarget(target,options);assert.equal(reads,1);
 await assert.rejects(assertVoiceTarget({...target,accountId:'b'},options),/账号/);assert.equal(reads,1);
 await assert.rejects(assertVoiceTarget({...target,dataScope:voiceDataScope('B')},options),/资料目录/);assert.equal(reads,1);
 for(const row of [{myRole:'collaborator'},{myRole:'producer',locked:true},null])await assert.rejects(assertVoiceTarget(target,{...options,getProject:async()=>row}),/权限|锁定/);
 await assert.rejects(assertVoiceTarget(target,{...options,getProject:async()=>{now.accountId='b';return {myRole:'producer'};}}),/账号/);
});

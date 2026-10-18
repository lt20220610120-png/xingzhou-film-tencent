const test=require('node:test'),assert=require('node:assert/strict');const {requestProtectedSkill}=require('./protected-skill-client.cjs');
test('cancelling or changing identity during a status read cannot return stale completed output',async()=>{
 for(const change of ['abort','identity']){
  const c=new AbortController();let token='account-1',release,reading;
  const started=new Promise(r=>reading=r);const pending=requestProtectedSkill({taskId:'fixture-task-1',builtinSkillId:'builtin:x'},{token:()=>token,signal:c.signal,wait:async()=>{},gateway:async action=>{if(action==='protected-skill-start')return {};if(action==='protected-skill-cancel')return {};reading();return new Promise(r=>release=r);}});
  await started;if(change==='abort')c.abort();else token='account-2';release({state:'completed',output:'stale'});await assert.rejects(pending);
 }
});

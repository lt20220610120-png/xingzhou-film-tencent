import test from 'node:test';import assert from 'node:assert/strict';
import {nextVideoAttempt,videoPolicyIssues} from './productionVideoPolicy.js';
const c={videoModel:'primary',videoAttempts:2,videoFallbackEnabled:true,fallbackVideoModel:'backup',fallbackVideoAttempts:2};
const failure=(id,model,error='generation failed')=>({id,status:'failed',profileId:model,model:'v',error});
test('primary twice then explicit fallback twice, limits persist across restart and unknown never retries',()=>{
 const models=[{id:'primary',profileId:'primary',model:'v'},{id:'backup',profileId:'backup',model:'v'}];
 assert.equal(nextVideoAttempt(c,[],models).id,'primary');assert.equal(nextVideoAttempt(c,[failure('1','primary')],models).id,'primary');const two=[failure('1','primary'),failure('2','primary')];assert.equal(nextVideoAttempt(c,two,models).id,'backup');assert.equal(nextVideoAttempt(c,[...two,failure('3','backup')],models).id,'backup');assert.equal(nextVideoAttempt(c,[...two,failure('3','backup'),failure('4','backup')],models),null);
 assert.equal(nextVideoAttempt({...c,videoFallbackEnabled:false},two,models),null);assert.equal(nextVideoAttempt(c,[failure('x','primary','insufficient_quota')],models).id,'primary');assert.throws(()=>nextVideoAttempt(c,[{...failure('x','primary'),status:'uncertain'}],models),/原任务/);
});
test('backup configuration is optional but incompatible models and invalid attempt counts are explicit',()=>{
 assert.deepEqual(videoPolicyIssues({...c,videoAttempts:2},()=>[]),[]);assert.match(videoPolicyIssues({...c,fallbackVideoModel:''},()=>[]).join(),/备用/);assert.match(videoPolicyIssues({...c,videoAttempts:0},()=>[]).join(),/次数/);assert.match(videoPolicyIssues(c,()=>['时长不支持']).join(),/备用.*时长/);
});

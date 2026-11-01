import test from 'node:test';import assert from 'node:assert/strict';
import {nextVideoAttempt,videoPolicyIssues} from './productionVideoPolicy.js';
import {productionDefaults,productionVideoIssues} from './productionFurnace.js';
const c={videoModel:'primary',videoAttempts:2,videoFallbackEnabled:true,fallbackVideoModel:'backup',fallbackVideoAttempts:2};
const failure=(id,model,error='generation failed')=>({id,status:'failed',profileId:model,model:'v',error});
test('backup preflight uses its own parameters and resolves missing legacy values to supported choices',()=>{
 const state={mediaProfiles:[{id:'main',kind:'video',model:'a',capabilities:{durations:[30],ratios:['9:16'],resolutions:['720p']}},{id:'backup',kind:'video',model:'b',capabilities:{durations:[5,10],durationByResolution:{'1080p':[5]},ratios:['16:9'],resolutions:['1080p']}}]},modelId=JSON.stringify(['backup','b']),config={...productionDefaults(),videoModel:JSON.stringify(['main','a']),videoResolution:'720p',videoFallbacks:[{modelId,attempts:2,ratio:'16:9',videoDuration:5,videoResolution:'1080p',videoConcurrency:3}]};
 assert.deepEqual(productionVideoIssues(config,state),[]);
 assert.deepEqual(productionVideoIssues({...config,videoFallbacks:[{modelId,attempts:2}]},state),[]);
 assert.match(productionVideoIssues({...config,videoFallbacks:[{...config.videoFallbacks[0],videoResolution:'720p'}]},state).join(),/备用.*分辨率/);
 assert.match(productionVideoIssues({...config,videoFallbacks:[{...config.videoFallbacks[0],videoDuration:10}]},state).join(),/备用.*时长/);
 assert.match(productionVideoIssues({...config,videoFallbacks:[{...config.videoFallbacks[0],videoConcurrency:0}]},state).join(),/备用.*并发/);
});
test('attempt selection carries the exact policy entry parameters even when a model repeats',()=>{
 const models=[{id:'primary',profileId:'primary',model:'v'},{id:'backup',profileId:'backup',model:'v'}],config={...c,videoAttempts:1,videoFallbacks:[{id:'first',modelId:'backup',attempts:1,ratio:'16:9',videoDuration:5,videoResolution:'1080p',videoConcurrency:1},{id:'second',modelId:'backup',attempts:2,ratio:'1:1',videoDuration:10,videoResolution:'720p',videoConcurrency:3}]};
 const first=nextVideoAttempt(config,[failure('1','primary')],models);assert.equal(first.videoConfig.videoResolution,'1080p');assert.equal(first.videoConfig.videoConcurrency,1);
 const second=nextVideoAttempt(config,[failure('1','primary'),failure('2','backup')],models);assert.equal(second.videoConfig.ratio,'1:1');assert.equal(second.videoConfig.videoDuration,10);assert.notEqual(first.videoPolicyKey,second.videoPolicyKey);
});
test('primary twice then explicit fallback twice, limits persist across restart and unknown never retries',()=>{
 const models=[{id:'primary',profileId:'primary',model:'v'},{id:'backup',profileId:'backup',model:'v'}];
 assert.equal(nextVideoAttempt(c,[],models).id,'primary');assert.equal(nextVideoAttempt(c,[failure('1','primary')],models).id,'primary');const two=[failure('1','primary'),failure('2','primary')];assert.equal(nextVideoAttempt(c,two,models).id,'backup');assert.equal(nextVideoAttempt(c,[...two,failure('3','backup')],models).id,'backup');assert.equal(nextVideoAttempt(c,[...two,failure('3','backup'),failure('4','backup')],models),null);
 assert.equal(nextVideoAttempt({...c,videoFallbackEnabled:false},two,models),null);assert.equal(nextVideoAttempt(c,[failure('x','primary','insufficient_quota')],models).id,'primary');assert.throws(()=>nextVideoAttempt(c,[{...failure('x','primary'),status:'uncertain'}],models),/原任务/);
});
test('backup configuration is optional but incompatible models and invalid attempt counts are explicit',()=>{
 assert.deepEqual(videoPolicyIssues({...c,videoAttempts:2},()=>[]),[]);assert.match(videoPolicyIssues({...c,fallbackVideoModel:''},()=>[]).join(),/备用/);assert.match(videoPolicyIssues({...c,videoAttempts:0},()=>[]).join(),/次数/);assert.match(videoPolicyIssues(c,()=>['时长不支持']).join(),/备用.*时长/);
});
test('ordered model chain supports repeats, reordering, legacy migration and explicit removal',()=>{
 const models=['primary','b','c','d'].map(id=>({id,profileId:id,model:'v'})),chain={...c,videoFallbacks:[{modelId:'b',attempts:1},{modelId:'c',attempts:3},{modelId:'b',attempts:2},{modelId:'d',attempts:1}]},history=[],sequence=[];
 for(let n=0;n<10;n++){const m=nextVideoAttempt(chain,history,models);if(!m)break;sequence.push(m.id);history.push(failure(String(n),m.profileId));}
 assert.deepEqual(sequence,['primary','primary','b','c','c','c','b','b','d']);assert.equal(nextVideoAttempt(chain,history,models),null);
 assert.equal(nextVideoAttempt({...chain,videoFallbacks:[chain.videoFallbacks[1],chain.videoFallbacks[0]]},[failure('1','primary'),failure('2','primary')],models).id,'c');
 assert.equal(nextVideoAttempt({...c,videoFallbacks:[]},[failure('1','primary'),failure('2','primary')],models),null);
 const checked=[];assert.deepEqual(videoPolicyIssues(chain,p=>{checked.push(p);return [];}),[]);assert.equal(checked.length,4);assert(checked.every(p=>Array.isArray(p.videoFallbacks)&&p.videoFallbacks.length===0));
 assert.match(videoPolicyIssues({...chain,videoFallbacks:[{modelId:'',attempts:2}]}).join(),/备用/);assert.match(videoPolicyIssues({...chain,videoFallbacks:[{modelId:'b',attempts:0}]}).join(),/次数/);
});

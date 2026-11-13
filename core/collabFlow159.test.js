import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {getArtModelQueue} from './artModelQueue.js';
import {taskPriority} from './taskPriority.js';
import {runArtAnalysisPipeline} from './artAnalysisPipeline.js';
import {getArtReviewStore} from './artReviewPersistence.js';
import {artPipelineProgress} from './artPipelineProgress.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const tick=()=>new Promise(r=>setImmediate(r));

test('focus crosses the preparation backlog without increasing actual requests or losing results',async()=>{
 const f=fixture(),hold=gate(),entered=gate(),started=[];
 f.project.episodes[0].prompts=Array.from({length:30},(_,n)=>({...f.project.episodes[0].prompts[0],id:'p'+(n+1),label:`1-${Math.floor(n/10)+1}-${n%10+1}`}));
 f.ledger.episodes[1].scenes=[1,2,3].map(n=>({...structuredClone(f.ledger.episodes[1].scenes[0]),id:'1-'+n}));
 f.api.aiChat=async p=>{started.push(JSON.parse(p.messages[1].content).label);if(started.length===1){entered.resolve();await hold.promise;}return f.output(p.messages);};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u',concurrency:1});
 const tasks=f.project.episodes[0].prompts.map(p=>service.run(p.id,{profile:{id:'m'}}));await entered.promise;
 service.focusScene('1-3');hold.resolve();await Promise.all(tasks);
 assert.equal(started.length,30);assert.equal(started[0],'1-1-1');assert.match(started[1],/^1-3-/);
 assert.equal(Object.keys(f.saved.decisions).length,30);assert.equal(service.status().working,false);
});

test('focus reorders the model queue, keeps the manual sixth slot, and ageing gives old work a turn',async()=>{
 const queue=getArtModelQueue({}),hold=gate(),started=[];
 const call=id=>async()=>{started.push(id);if(started.length<=6)await hold.promise;};
 const tasks=Array.from({length:5},(_,n)=>queue.run(call('active'+n)));await tick();
 for(let n=0;n<20;n++)tasks.push(queue.run(call('old'+n)));
 let focused=false;tasks.push(queue.run(call('focus'),{priority:()=>focused?6:0}));focused=true;queue.notify();
 tasks.push(queue.run(call('manual'),{manual:true}));await tick();assert.equal(started[5],'manual');assert.equal(queue.status().active,6);
 hold.resolve();await Promise.all(tasks);await tick();assert.equal(started[6],'focus');assert.equal(started.length,27);
 assert(taskPriority(0,0,70000)>taskPriority(6,70000,70000),'old background work eventually outranks fresh focused work');
});

test('frontloaded reuse skips the model only for confirmed identities and leaves uncertain drafts untouched',async()=>{
 const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await service.autoAssociate({confirmedOnly:true});assert.equal(f.saved,null,'unresolved candidates are not persisted as new constraints');
 for(const p of f.project.episodes[0].prompts)p.content='【基础设定】\n人物：张三（参考@）\n场景：无\n道具：无';
 await service.autoAssociate({confirmedOnly:true});assert.equal(Object.values(f.saved.decisions).filter(d=>d.confirmed).length,3);
 await Promise.all(f.project.episodes[0].prompts.map(p=>service.run(p.id,{profile:{id:'m'}})));assert.equal(f.calls,0);
 const snapshot=f.snapshot();assert.equal(artPipelineProgress(f.project,f.ledger,snapshot.snapshot,snapshot.decisions).linked,3);
 f.project.episodes[0].content+='正文修改';const changed=f.snapshot();assert.equal(artPipelineProgress(f.project,f.ledger,changed.snapshot,changed.decisions).linked,0);
});

test('visual mapping advances before dialogue returns, prompt decisions join dialogue before saving',async()=>{
 const f=fixture(),voice=gate(),voiceEntered=gate(),mapped=gate(),events=[];let bindings=0;
 Object.assign(f.api,{promptArtStatus:async()=>({enabled:true}),artReviewLoadLocal:async()=>f.ledger,artReviewSaveLocal:async()=>{},analysisLoad:async()=>null,aiChat:async p=>{
  const system=p.messages[0].content;
  if(system.includes('你是剧本场记')){events.push('voice-start');voiceEntered.resolve();await voice.promise;events.push('voice-end');return JSON.stringify({scenes:[{sceneId:'1-1',appearances:[],speakers:[]}]});}
  if(system.includes('并发场景关联')){events.push('mapping');mapped.resolve();return JSON.stringify({scenes:[{sceneId:'1-1',assets:[{category:'character',name:'【张三】'}]}]});}
  if(system.includes('影视场景清单分发助手')){bindings++;events.push('prompt');return f.output(p.messages);}
  throw Error('Unexpected model request');
 }});
 const store=getArtReviewStore({api:f.api,projectId:f.project.id,accountId:'u'});await store.load(f.project);
 const running=runArtAnalysisPipeline({project:f.project,api:f.api,store,profile:{id:'m'},accountId:'u',job:{},mapOnly:true});
 await Promise.all([voiceEntered.promise,mapped.promise]);assert.equal(bindings,0);assert.equal(f.saved,null);voice.resolve();
 const result=await running;assert.deepEqual(result.errors,[]);assert(events.indexOf('mapping')<events.indexOf('voice-end'));assert.equal(bindings,3);
 assert(Object.values(f.saved.decisions).every(d=>d.confirmed));
});

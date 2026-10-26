import test from 'node:test';import assert from 'node:assert/strict';
import {runArtAnalysisPipeline,getArtDistributionController} from './artAnalysisPipeline.js';
import {getArtReviewStore} from './artReviewPersistence.js';
import {fixture} from './promptDistribution.fixtures.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};

test('a new focused repair queues behind the same episode instead of silently reusing its distribution',async()=>{
 const f=fixture(),entered=gate(),hold=gate();let focusCalls=0;
 Object.assign(f.api,{promptArtStatus:async()=>({enabled:true}),artReviewLoadLocal:async()=>f.ledger,artReviewSaveLocal:async()=>{},aiChat:async p=>{
  if(p.messages[0].content.includes('影视场景清单分发助手')){entered.resolve();await hold.promise;return f.output(p.messages)}
  focusCalls++;return JSON.stringify({item:{category:'character',name:'【张三】',description:'成年男性，灰色短袖、黑色长裤。'},sceneIds:['1-1']});
 }});
 const store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.load(f.project);
 const control=getArtDistributionController({api:f.api,projectId:f.project.id,project:f.project,store,profile:{id:'m'}}),work=control.start();await entered.promise;
 const focusItem={...structuredClone(store.snapshot().episodes[1].roster[0]),note:'用户新修改'};
 await store.update(1,r=>({...r,roster:r.roster.map(i=>i.id===focusItem.id?focusItem:i)}));
 const repair=runArtAnalysisPipeline({project:f.project,api:f.api,store,profile:{id:'m'},job:{},targetEpisodeNumbers:[1],focusItem});
 await new Promise(r=>setImmediate(r));hold.resolve();await Promise.all([repair,work]);assert.equal(focusCalls,1,'新的补齐请求必须实际执行');
});

for(const mode of ['batch','focus'])test(`${mode} detail reducer waiting behind a disk save cannot apply after distribution stops`,async()=>{
 const f=fixture(),record=f.ledger.episodes[1];for(const item of [...record.roster,...record.unassigned,...record.scenes.flatMap(s=>s.items)]){item.description='';item.ready=false;}
 let store,inserted=false,blocker;const entered=gate(),release=gate(),diskWrites=[];
 Object.assign(f.api,{promptArtStatus:async()=>({enabled:false}),artReviewLoadLocal:async()=>f.ledger,artReviewSaveLocal:async({data})=>{
  const r=data.episodes[1];diskWrites.push(r?.roster[0].description);
  if(r?.history.at(-1)?.reason===(mode==='batch'?'批量补齐信息卡回包':'完整模型回包')&&!inserted){inserted=true;blocker=store.update(1,current=>({...current,testQueuedMarker:true}));}
  else if(r?.testQueuedMarker&&!r?.roster[0].description){entered.resolve();await release.promise;}
 },aiChat:async p=>{if(mode==='focus')return JSON.stringify({item:{category:'character',name:'【张三】',description:'成年男性，短黑发，灰色短袖，深色长裤。'},sceneIds:['1-1']});const data=JSON.parse(p.messages[1].content).untrustedData;return {output:JSON.stringify({items:data.requestedItems.map(i=>({...i,description:'成年男性，短黑发，灰色短袖，深色长裤。'}))})}}});
 store=getArtReviewStore({api:f.api,projectId:f.project.id});await store.load(f.project);
 const control=getArtDistributionController({api:f.api,projectId:f.project.id,project:f.project,store,profile:{id:'m'}});await control.activate();const work=mode==='batch'?control.start():control.enqueueEpisode(f.project.episodes[0],{focusItem:record.roster[0]});await entered.promise;
 await new Promise(r=>setImmediate(r));await control.stop();release.resolve();await Promise.all([work,blocker]);
 assert.equal(store.snapshot().episodes[1].roster[0].description,'');assert.equal(diskWrites.at(-1),'');
});

test('standalone distribution scans saved upstream inventory and stopping it rejects late prompt saves without cancelling reading',async()=>{
 const f=fixture(),hold=gate(),entered=gate(),reading={cancelled:false};let calls=0;
 Object.assign(f.api,{promptArtStatus:async()=>({enabled:true}),artReviewLoadLocal:async()=>f.ledger,artReviewSaveLocal:async()=>{}});
 f.api.aiChat=async p=>{calls++;entered.resolve();await hold.promise;return f.output(p.messages)};
 const store=getArtReviewStore({api:f.api,projectId:f.project.id,accountId:'u'});await store.load(f.project);
 const control=getArtDistributionController({api:f.api,projectId:f.project.id,accountId:'u',project:f.project,store,profile:{id:'m'},job:reading});
 assert.equal(calls,0);const work=control.start();await entered.promise;await control.stop();assert.equal(reading.cancelled,false);hold.resolve();await work;
 assert.equal(Object.keys(f.saved.decisions).length,0,'stopped downstream must not apply its replies');
 await control.start();assert.equal(Object.keys(f.saved.decisions).length,3);assert.equal(control.status().working,false);
});

test('stopping inventory leaves completed upstream scenes distributing, and distribution has its own start/stop',async()=>{
 const project={id:crypto.randomUUID(),episodes:[1,2].map(n=>({id:'ep'+n,episodeNumber:n,content:`${n}-1 客厅 日 内\n旺财趴着。`,prompts:[{id:'p'+n,label:`${n}-1-1`,content:'【基础设定】\n人物：旺财（参考@），犬。\n场景：无\n道具：无'}]}))};
 let disk={episodes:{}},saved=null;const waiting=gate(),hold=gate(),inventoryWaiting=gate(),inventoryHold=gate();let promptCalls=0;
 const api={artReviewLoadLocal:async()=>disk,artReviewSaveLocal:async({data})=>{disk=structuredClone(data)},analysisLoad:async()=>null,promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>structuredClone(saved),promptArtSave:async p=>{saved={...structuredClone(p.data),revision:(saved?.revision||0)+1};return structuredClone(saved)},aiChat:async p=>{
  if(p.messages[0].content.includes('影视场景清单分发助手')){promptCalls++;waiting.resolve();await hold.promise;const data=JSON.parse(p.messages[1].content);return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:'旺财',reason:'本条基础设定明确'})),missing:[]})}
  const n=Number(p.messages.map(m=>m.content).join('').match(/当前输出只包含第(\d+)集/)?.[1]);if(n===2){inventoryWaiting.resolve();await inventoryHold.promise;}
  return {ok:true,output:`### 第${n}集\n人物：\n- 【旺财-狗】主体类型：生物；物种：犬。黄毛四足，尖耳，完整尾巴。\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n`+JSON.stringify({scenes:[{sceneId:`${n}-1`,assets:[{category:'character',name:'【旺财-狗】'}]}]})};
 }};
 const store=getArtReviewStore({api,projectId:project.id,accountId:'u'});await store.load(project);const job={};
 const run=runArtAnalysisPipeline({project,api,store,profile:{id:'m'},accountId:'u',job});
 await Promise.all([waiting.promise,inventoryWaiting.promise]);job.cancelled=true;inventoryHold.resolve();hold.resolve();await run;
 const control=getArtDistributionController({api,projectId:project.id,accountId:'u'});await control.idle();
 assert.equal(saved.decisions.p1.confirmed,true,'stopping reading must not stop prompt result');assert.equal(promptCalls,1);
 await control.stop();assert.equal(control.status().paused,true);
 await control.start();assert.equal(control.status().paused,false);assert.equal(promptCalls,1,'starting saved work reuses completed distribution');
});
test('episode inventory, independent scenes and ready-scene prompts overlap; reopening views is not a trigger',async()=>{
 const project={id:crypto.randomUUID(),episodes:[1,2].map(n=>({id:'ep'+n,episodeNumber:n,title:'第'+n+'集',content:`${n}-1 客厅 日 内\n旺财趴在地上。\n${n}-2 院子 日 外\n旺财奔跑。`,prompts:[1,2].map(s=>({id:`p${n}${s}`,label:`${n}-${s}-1`,content:'【基础设定】\n人物：旺财（参考@），黄毛四足犬。\n场景：无\n道具：无'}))}))};
 let ledger={episodes:{}},binding=null;const events=[],inventory2=gate(),scene2=gate(),promptStarted=gate();
 const api={artReviewLoadLocal:async()=>ledger,artReviewSaveLocal:async({data})=>{ledger=structuredClone(data)},analysisLoad:async()=>null,promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>structuredClone(binding),promptArtSave:async p=>{assert.equal(p.baseRevision,binding?.revision||0);binding={...structuredClone(p.data),revision:(binding?.revision||0)+1};return structuredClone(binding)},aiChat:async p=>{
  const text=p.messages.map(m=>m.content).join('');
  if(p.messages[0].content.includes('影视场景清单分发助手')){const data=JSON.parse(p.messages[1].content);events.push('prompt:'+data.label);if(data.label==='1-1-1')promptStarted.resolve();return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:'旺财',reason:'基础设定明确旺财'})),missing:[]})}
  if(p.messages[0].content.includes('并发场景关联')){const data=JSON.parse(p.messages[1].content);events.push('scene:'+data.sceneId);if(data.sceneId==='1-2')await scene2.promise;return JSON.stringify({scenes:[{sceneId:data.sceneId,assets:[{category:'character',name:'【旺财-狗】'}]}]})}
  const n=Number(text.match(/当前输出只包含第(\d+)集/)?.[1]);events.push('inventory:'+n);if(n===2)await inventory2.promise;
  return {ok:true,output:`### 第${n}集\n人物：\n- 【旺财-狗】主体类型：生物；物种：犬。黄毛四足，尖耳，完整尾巴。\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n{"scenes":[]}`};
 }};
 const store=getArtReviewStore({api,projectId:project.id,accountId:'u'});await store.load(project);
 const running=runArtAnalysisPipeline({project,api,store,genre:'现代',profile:{id:'m',model:'mock'},accountId:'u',job:{}});
 await promptStarted.promise;assert(events.includes('inventory:2'));assert(events.includes('scene:1-2'));assert(events.includes('prompt:1-1-1'));
 inventory2.resolve();scene2.resolve();const result=await running;assert.deepEqual(result.errors,[]);assert.equal(Object.keys(binding.decisions).length,4);
 const before=events.length;await runArtAnalysisPipeline({project,api,store,genre:'现代',profile:{id:'m',model:'mock'},accountId:'u',job:{}});assert.equal(events.length,before,'explicit continue reuses completed model results');
});
test('a completed detail batch immediately dispatches its ready scene while another batch is still waiting',async()=>{
 const project={id:crypto.randomUUID(),episodes:[{id:'ep',episodeNumber:1,title:'第1集',content:'1-1 客厅 日 内\n狗1在地上。\n1-2 客厅 日 内\n狗7在地上。',prompts:[1,2].map(s=>({id:'p'+s,label:`1-${s}-1`,content:`【基础设定】\n人物：狗${s===1?1:7}（参考@）\n场景：无\n道具：无`}))}]};
 let disk={episodes:{}},binding=null;const hold=gate(),started=gate();let secondWaiting=false;
 const api={artReviewLoadLocal:async()=>disk,artReviewSaveLocal:async({data})=>{disk=structuredClone(data)},analysisLoad:async()=>null,promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>structuredClone(binding),promptArtSave:async p=>{binding={...structuredClone(p.data),revision:(binding?.revision||0)+1};return structuredClone(binding)},aiChat:async p=>{
  const system=p.messages[0].content;
  if(system.includes('影视场景清单分发助手')){const data=JSON.parse(p.messages[1].content);if(data.label==='1-1-1')started.resolve();return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:data.label==='1-1-1'?'狗1':'狗7',reason:'本条基础设定明确出现'})),missing:[]})}
  if(p.messages[1].content.includes('requestedItems')){const data=JSON.parse(p.messages[1].content).untrustedData;if(data.requestedItems.some(i=>i.name.includes('狗7'))){secondWaiting=true;await hold.promise;}return {output:JSON.stringify({items:data.requestedItems.map(i=>({...i,description:'主体类型：生物；物种：犬。黄毛四足，尖耳，完整尾巴。'}))})}}
  return {ok:true,output:'### 第1集\n人物：\n'+Array.from({length:7},(_,i)=>`- 【狗${i+1}-狗】（首次）`).join('\n')+'\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n'+JSON.stringify({scenes:[{sceneId:'1-1',assets:[{category:'character',name:'【狗1-狗】'}]},{sceneId:'1-2',assets:[{category:'character',name:'【狗7-狗】'}]}]})};
 }};
 const store=getArtReviewStore({api,projectId:project.id,accountId:'u'});await store.load(project);
 const running=runArtAnalysisPipeline({project,api,store,genre:'现代',profile:{id:'m'},accountId:'u',job:{}});
 await Promise.race([started.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('已完成的详情批次没有触发下游')),300))]);assert(secondWaiting);hold.resolve();await running;
});

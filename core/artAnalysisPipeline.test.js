import test from 'node:test';import assert from 'node:assert/strict';
import {runArtAnalysisPipeline} from './artAnalysisPipeline.js';
import {getArtReviewStore} from './artReviewPersistence.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
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

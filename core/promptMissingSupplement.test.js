import test from 'node:test';
import assert from 'node:assert/strict';
import * as supplement from './promptMissingSupplement.js';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {promptReviewState,promptHumanReviewSignature} from './promptReviewBatch.js';
import {reviewRoster,editArtReview} from './artReview.js';

async function setup({legacy=false,padded=false}={}){
 const f=fixture(),requests=[];let beforeReply=()=>{},failSave=false;
 if(legacy)delete f.project.episodes[0].episodeNumber;
 if(padded)for(const p of f.project.episodes[0].prompts)p.label=p.label.replace('1-1-','01-01-');
 const store={snapshot:()=>f.ledger,update:async(n,reduce)=>{const next=reduce(structuredClone(f.ledger.episodes[n]));if(failSave)throw Error('磁盘写入失败');f.ledger.episodes[n]=next;return next}};
 f.api.aiChat=async p=>{const data=JSON.parse(p.messages[1].content);requests.push(data);
  if(data.task==='prompt-missing-supplement'){
   await beforeReply(data);
   return JSON.stringify({items:data.needs.map(n=>({needId:n.id,category:n.category,name:'【水杯-张三】',description:'透明玻璃水杯，圆柱杯身，完整圆形杯口。',promptId:n.prompts[0].id,evidence:'水杯'}))});
  }
  const found=data.cards.some(c=>c.category==='prop');return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:c.category==='prop'?'水杯':'张三',reason:'基础设定'})),missing:found?[]:[{category:'prop',text:'水杯',reason:'本场缺失'}]});
 };
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 const state=await service.read(),targets=promptReviewState(state,{}).pendingMissing.map(({entry,need})=>({entryId:entry.id,needId:need.id,signature:promptHumanReviewSignature(state.snapshot,entry,state.decisions[entry.id])}));
 const run=(selected=targets)=>supplement.supplementPromptMissingReferences({service,store,api:f.api,targets:selected,versionId:state.snapshot.versionId,profile:{id:'selected-model'},actor:'u'});
 return {f,service,store,state,targets,requests,run,set beforeReply(fn){beforeReply=fn},set failSave(v){failSave=v}};
}
test('selected duplicate prompt gaps become one model-completed scene/episode card then all scene prompts are redistributed by the model',async()=>{
 const f=await setup(),old=structuredClone(reviewRoster(f.f.ledger.episodes[1])[0]);
 const result=await f.run(f.targets.slice(0,2));
 assert.equal(result.added,1);assert.deepEqual(result.failures,[]);
 const requests=f.requests.filter(r=>r.task==='prompt-missing-supplement');assert.equal(requests.length,1);assert.equal(requests[0].needs.length,1);assert.equal(requests[0].needs[0].prompts.length,2);
 const record=f.f.ledger.episodes[1];assert.equal(reviewRoster(record).length,2);assert.equal(record.scenes[0].items.length,2);assert.deepEqual(record.scenes[0].items[0],old);assert.equal(record.scenes[0].approval,null);assert.deepEqual(record.published,{});
 assert.match(record.scenes[0].items[1].description,/玻璃/);assert.equal(promptReviewState(await f.service.read(),{}).pendingMissing.length,0);
 assert.equal(f.requests.filter(r=>r.label).length,6);
});
test('missing model, empty selection and stale targets are rejected without requests',async()=>{
 const f=await setup(),calls=f.requests.length;
 await assert.rejects(f.run([]),/选择/);
 await assert.rejects(f.run([{...f.targets[0],signature:'old'}]),/变化/);
 await assert.rejects(supplement.supplementPromptMissingReferences({service:f.service,store:f.store,api:f.f.api,targets:f.targets}),/模型/);
 assert.equal(f.requests.length,calls);
});
test('unlocatable model evidence and local write failure do not create cards or clear gaps',async()=>{
 const f=await setup(),original=f.f.api.aiChat;
 f.f.api.aiChat=async p=>{const data=JSON.parse(p.messages[1].content);if(data.task==='prompt-missing-supplement')return JSON.stringify({items:[{needId:data.needs[0].id,category:'prop',name:'【水杯】',description:'杯子',promptId:'p1',evidence:'不存在的证据'}]});return original(p)};
 assert.equal((await f.run()).failures.length,1);assert.equal(reviewRoster(f.f.ledger.episodes[1]).length,1);
 f.f.api.aiChat=original;f.failSave=true;assert.match((await f.run()).failures.join(),/磁盘/);assert.equal(reviewRoster(f.f.ledger.episodes[1]).length,1);assert.equal(promptReviewState(await f.service.read(),{}).pendingMissing.length,3);
});
test('late responses after prompt or scene edits never overwrite newer human work',async()=>{
 for(const kind of ['prompt','scene']){
  const f=await setup();f.beforeReply=()=>{if(kind==='prompt')f.f.project.episodes[0].prompts[0].content+='\n新版';else f.f.ledger.episodes[1]=editArtReview(f.f.ledger.episodes[1],{type:'upsert',sceneId:'1-1',item:{category:'prop',name:'【人工台灯】',description:'人工描述',ready:true}})};
  const result=await f.run();assert.equal(result.added,0);assert.match(result.failures.join(),/变化/);assert(!reviewRoster(f.f.ledger.episodes[1]).some(i=>i.name==='【水杯-张三】'));
 }
});
test('scene maintenance rejects overlapping AI work and duplicate supplementation',async()=>{
 const f=await setup();let release;const gate=new Promise(r=>release=r);f.beforeReply=()=>gate;
 const running=f.run();while(!f.requests.some(r=>r.task==='prompt-missing-supplement'))await new Promise(r=>setTimeout(r,1));
 await assert.rejects(f.service.run('p3',{manual:true,profile:{id:'m'}}),/补充/);
 await assert.rejects(f.run(),/补充/);release();await running;
 assert.equal(reviewRoster(f.f.ledger.episodes[1]).length,2);
});
test('explicit supplementation restores a roster-removed identity to both episode roster and scene',async()=>{
 const f=await setup();f.f.ledger.episodes[1]=editArtReview(f.f.ledger.episodes[1],{type:'upsert',sceneId:'1-1',item:{category:'prop',name:'【水杯-张三】',description:'旧杯子',ready:true}});
 const cup=reviewRoster(f.f.ledger.episodes[1]).find(i=>i.category==='prop');f.f.ledger.episodes[1]=editArtReview(f.f.ledger.episodes[1],{type:'roster-remove',itemId:cup.id});
 // Re-read to obtain the exact missing signature after this human deletion.
 await Promise.all(['p1','p2','p3'].map(id=>f.service.run(id,{manual:true,profile:{id:'m'}})));
 const state=await f.service.read(),targets=promptReviewState(state,{}).pendingMissing.map(({entry,need})=>({entryId:entry.id,needId:need.id,signature:promptHumanReviewSignature(state.snapshot,entry,state.decisions[entry.id])}));
 const result=await f.run(targets);assert.deepEqual(result.failures,[]);assert.equal(reviewRoster(f.f.ledger.episodes[1]).filter(i=>i.category==='prop').length,1);assert.equal(f.f.ledger.episodes[1].roster.filter(i=>i.category==='prop').length,1);
});
test('legacy episode identity inferred from source is accepted like ordinary model distribution',async()=>{
 const f=await setup({legacy:true}),result=await f.run();assert.deepEqual(result.failures,[]);assert.equal(result.added,1);
});
test('zero-padded prompt labels still obey scene maintenance mutual exclusion',async()=>{
 const f=await setup({padded:true});let release;const gate=new Promise(r=>release=r);f.beforeReply=()=>gate;
 const running=f.run();while(!f.requests.some(r=>r.task==='prompt-missing-supplement'))await new Promise(r=>setTimeout(r,1));
 try{await assert.rejects(f.service.run('p3',{manual:true,profile:{id:'m'}}),/补充/);}finally{release();await running;}
});
test('model reuse links an existing episode card without overwriting its manual description',async()=>{
 const f=await setup();f.f.ledger.episodes[1]=editArtReview(f.f.ledger.episodes[1],{type:'roster-upsert',sceneIds:[],item:{category:'prop',name:'【水杯-张三】',description:'人工确认的磨砂蓝色陶瓷水杯',ready:true}});
 const cup=reviewRoster(f.f.ledger.episodes[1]).find(i=>i.category==='prop'),original=f.f.api.aiChat;
 f.f.api.aiChat=async p=>{const data=JSON.parse(p.messages[1].content);if(data.task!=='prompt-missing-supplement')return original(p);return JSON.stringify({items:data.needs.map(n=>({needId:n.id,category:n.category,name:cup.name,reuseItemId:cup.id,description:'模型给了另一种描述',promptId:n.prompts[0].id,evidence:'水杯'}))})};
 const result=await f.run();assert.equal(result.added,0);assert.equal(result.reused,1);assert.deepEqual(result.failures,[]);assert.equal(f.f.ledger.episodes[1].scenes[0].items.find(i=>i.id===cup.id).description,cup.description);assert.equal(reviewRoster(f.f.ledger.episodes[1]).length,2);
});
test('redistribution failure keeps the successfully saved card available for an explicit retry',async()=>{
 const f=await setup(),original=f.f.api.aiChat;
 f.f.api.aiChat=async p=>{const data=JSON.parse(p.messages[1].content);if(data.label&&data.cards.some(c=>c.category==='prop'))throw Error('模型暂时不可用');return original(p)};
 const result=await f.run();assert.equal(result.added,1);assert(result.failures.every(e=>e.includes('卡片已保存')));assert.equal(result.failures.length,3);assert.equal(reviewRoster(f.f.ledger.episodes[1]).filter(i=>i.category==='prop').length,1);
 f.f.api.aiChat=original;await f.service.run('p1',{manual:true,profile:{id:'m'}});assert.equal(promptReviewState(await f.service.read(),{sceneId:'1-1'}).pendingMissing.filter(r=>r.entry.id==='p1').length,0);
});

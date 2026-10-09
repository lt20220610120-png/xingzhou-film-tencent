import test from 'node:test';import assert from 'node:assert/strict';
import {runArtReviewAnalysis} from './artReviewRunner.js';
import {getArtReviewStore} from './artReviewPersistence.js';
import {editArtReview,reviewRoster,decodeArtReviewOutput} from './artReview.js';
const ep=n=>({episodeNumber:n,title:`第${n}集`,content:`${n}-1 家 日 内\n林舟：你好。`});
const output=n=>`### 第${n}集\n人物：\n- 【林舟-常服】${n===1?'（首次）脸型：方脸；五官：黑色双眼、鼻梁清晰；发型：黑色短发；完整服装：蓝衬衫，黑裤，黑鞋。':'（复用自第1集）'}\n场景：\n- 【家-日-内】${n===1?'（首次）白墙，木桌，窗户。':'（复用自第1集）'}\n道具：\n- 无\n【逐场资产对应表】\n${JSON.stringify({scenes:[{sceneId:`${n}-1`,assets:[{category:'character',name:'【林舟-常服】'},{category:'scene',name:'【家-日-内】'}]}]})}`;
function fixture(order=[1,2,3]){let disk=null;const calls=[],project={id:crypto.randomUUID(),genre:'现代都市',episodes:order.map(ep)};const api={artReviewLoadLocal:async()=>disk,artReviewSaveLocal:async p=>{disk=structuredClone(p.data);},analysisLoad:async()=>null,aiChat:async p=>{const n=JSON.parse(p.messages.at(-1).content.split('\n').at(-1)).sceneIds[0].split('-')[0];calls.push({n:Number(n),p});return {ok:true,output:output(Number(n))};}};const args={project,api,genre:project.genre,profile:{id:'model',model:'mock'}};return {api,project,calls,args,get disk(){return disk;},store:getArtReviewStore({api,projectId:project.id})};}
test('automatic analysis stops at a failed first episode, saves partial work, and resumes in numeric order',async()=>{
 const f=fixture([3,2,1]),original=f.api.aiChat;f.api.aiChat=async p=>{const r=await original(p);if(f.calls[0].n===1&&f.calls.length===1)throw Error('模型暂不可用');return r;};
 const failed=await runArtReviewAnalysis(f.args);assert.deepEqual(f.calls.map(c=>c.n),[1]);assert.ok(failed.errors.length);assert.equal(f.disk.episodes[2].status,'empty');
 f.api.aiChat=original;const resumed=await runArtReviewAnalysis(f.args);assert.deepEqual(resumed.errors,[]);assert.deepEqual(f.calls.map(c=>c.n),[1,1,2,3]);
});
test('truncated inventory or failed mapping never starts the next episode',async()=>{
 const f=fixture();f.api.aiChat=async()=>{f.calls.push(1);return {ok:false,output:'### 第1集\n人物：\n- 【林舟-常服】初稿',error:'回包中断'};};
 await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,1);assert.equal(f.disk.episodes[2].status,'empty');assert.ok(f.disk.episodes[1].rawOutput.includes('初稿'));
});
test('guided analysis persists mode, waits for whole-episode confirmation and uses corrected prior assets',async()=>{
 const f=fixture();const first=await runArtReviewAnalysis({...f.args,workflow:'guided'});assert.deepEqual(first.errors,[]);assert.equal(f.calls.length,1);assert.equal(first.workflow.phase,'review');assert.equal(f.disk.workflow,'guided');
 await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,1,'waiting never calls model');
 await f.store.update(1,r=>{const i=reviewRoster(r).find(i=>i.category==='character');return editArtReview(r,{type:'roster-upsert',itemId:i.id,sceneIds:['1-1'],item:{...i,description:'人工确认红衬衫，黑裤，黑鞋。'}});});
 await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));
 const second=await runArtReviewAnalysis(f.args);assert.deepEqual(f.calls.map(c=>c.n),[1,2]);assert.equal(second.workflow.episodeNumber,2);
 const data=JSON.parse(f.calls[1].p.messages[1].content).untrustedData;assert.ok(data.approvedPriorArtLedger.some(i=>i.description?.includes('红衬衫')));
 assert.ok(reviewRoster(f.disk.episodes[2]).some(i=>i.category==='character'&&i.description.includes('红衬衫')));
});
test('new later-episode analysis cannot bypass an incomplete earlier episode',async()=>{
 const f=fixture();const r=await runArtReviewAnalysis({...f.args,targetEpisodeNumbers:[2]});assert.equal(f.calls.length,0);assert.match(r.errors.join(''),/第 1 集/);
});
test('output for multiple episodes cannot be accepted as the first completed inventory',async()=>{
 const f=fixture();f.api.aiChat=async p=>{f.calls.push(p);return {ok:true,output:output(1)+'\n'+output(2)};};
 const result=await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,1);assert.ok(result.errors.length);assert.equal(f.disk.episodes[2].status,'empty');assert.ok(f.disk.episodes[1].rawOutput.includes('第2集'));
});
test('foreign JSON scene IDs stop inventory, mapping-only retries and automatic mapping batches',async()=>{
 const foreign=JSON.stringify({scenes:[{sceneId:'1-1',assets:[]},{sceneId:'2-1',assets:[]}]});
 const mixed=output(1).split('【逐场资产对应表】')[0]+'【逐场资产对应表】\n'+foreign;
 assert.equal(decodeArtReviewOutput(mixed,1).complete,false);assert.equal(decodeArtReviewOutput(mixed,1).crossEpisode,true);
 for(const path of ['inventory','retry','batch']){
  const f=fixture();let count=0;
  f.api.aiChat=async p=>{f.calls.push(p);count++;return {ok:true,output:path==='batch'&&count===1?output(1).split('【逐场资产对应表】')[0]:path==='inventory'?mixed:foreign};};
  if(path==='retry'){
   const record=decodeArtReviewOutput(output(1).split('【逐场资产对应表】')[0],1);
   const {applyArtReviewCandidate}=await import('./artReview.js');await f.store.load(f.project);await f.store.update(1,r=>applyArtReviewCandidate(r,ep(1),record));
  }
  const result=await runArtReviewAnalysis({...f.args,...(path==='retry'?{mapOnly:true,targetEpisodeNumbers:[1]}:{})});
  assert.ok(result.errors.some(e=>e.includes('其他集')),path);assert.equal(f.disk.episodes[2].status,'empty',path);assert.ok(f.disk.episodes[1].history.some(h=>h.rawOutput?.includes('2-1')),path);
 }
});
test('single-card detail completion rejects foreign scenes even when the card already has local scene assignments',async()=>{
 const f=fixture([1]);await f.store.load(f.project);
 await f.store.update(1,r=>editArtReview(r,{type:'roster-upsert',sceneIds:['1-1'],item:{category:'character',name:'【林舟】',description:'',ready:false,note:'可见人物，请补齐'}}));
 const item=reviewRoster(f.store.snapshot().episodes[1])[0];
 f.api.aiChat=async()=>({ok:true,output:JSON.stringify({item:{category:'character',name:item.name,description:'异集返回的蓝衣人物'},sceneIds:['2-1']})});
 const result=await runArtReviewAnalysis({...f.args,targetEpisodeNumbers:[1],force:true,focusItem:item});
 assert.ok(result.errors.some(e=>e.includes('其他集')));assert.equal(reviewRoster(f.disk.episodes[1])[0].description,'');assert.ok(f.disk.episodes[1].rawOutput.includes('2-1'));
});

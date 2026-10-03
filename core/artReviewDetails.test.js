import test from 'node:test';
import assert from 'node:assert/strict';
import {newArtReview,editArtReview,reviewRoster,isSceneVerified,applyArtReviewCard,needsArtReviewDetails} from './artReview.js';
import {getArtReviewStore} from './artReviewPersistence.js';
import {runArtReviewAnalysis} from './artReviewRunner.js';

async function fixture(count=1){
 const episode={episodeNumber:2,title:'第2集',content:'2-1 酒吧 日 内\n壮汉甲与壮汉乙堵住主角。\n\n2-2 走廊 日 内\n主角离开。'},prior={episodeNumber:1,title:'第1集',content:'1-1 酒吧 日 内\n主角出现。'};
 let previous=editArtReview(newArtReview(prior),{type:'roster-upsert',sceneIds:['1-1'],item:{category:'character',name:'【主角-校服】',description:'前集明确的黑色短发和蓝白校服。',ready:true}});
 previous=editArtReview(previous,{type:'approve-episode'});
 let record=newArtReview(episode);record.status='generated';record.scenes.forEach(s=>s.mappingReady=true);
 for(let i=0;i<count;i++)record=editArtReview(record,{type:'roster-upsert',sceneIds:['2-1','2-2'],item:{category:'character',name:`【壮汉${i+1}-黑衣】`,description:i%2?'缺少服装的初稿':'',ready:i===0,note:'实际可见，黑衣。'}});
 let disk={episodes:{1:previous,2:record}},calls=[],active=0,maxActive=0;
 const project={id:crypto.randomUUID(),genre:'现代都市',episodes:[prior,episode],analysis_progress:{}};
 const api={artReviewLoadLocal:async()=>structuredClone(disk),artReviewSaveLocal:async p=>{disk=structuredClone(p.data);},analysisLoad:async()=>null,
  aiChat:async p=>{calls.push(p);active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;const data=JSON.parse(p.messages[1].content).untrustedData;return {ok:true,output:JSON.stringify({items:data.requestedItems.map(item=>({...item,description:'黑色短发、方脸、黑色夹克，深色长裤及布鞋。',visible:true,sceneIds:['2-1','2-2']}))})};}};
 const store=getArtReviewStore({api,projectId:project.id});await store.load(project);
 return {store,api,calls,project,episode,get disk(){return disk;},get maxActive(){return maxActive;},args:{project,api,genre:project.genre,profile:{id:'selected',model:'chosen'},targetEpisodeNumbers:[2],detailsOnly:true}};
}
test('human can confirm a scene, whole episode and unassigned roster despite missing descriptions or parser flags',async()=>{
 const f=await fixture(3);await f.store.update(2,r=>editArtReview(r,{type:'roster-upsert',item:{category:'prop',name:'【未定位茶杯】',description:'',ready:false}}));
 await f.store.update(2,r=>editArtReview(r,{type:'approve-episode'}));assert.ok(f.disk.episodes[2].scenes.every(isSceneVerified));
 const r=f.disk.episodes[2],card=r.roster[0],filled=applyArtReviewCard(r,card,{item:{...card,description:'补齐后完整服装和外貌'}});
 assert.ok(filled.scenes.every(isSceneVerified));assert.ok(filled.scenes.every(s=>s.items.find(i=>i.id===card.id).ready));
 assert.equal(filled.scenes[0].approval.at,r.scenes[0].approval.at);
});
test('one click fills all pending cards in two concurrent batches, reuses prior ledger and never uploads drafts',async()=>{
 const f=await fixture(14);await f.store.update(2,r=>editArtReview(r,{type:'approve-episode'}));
 const result=await runArtReviewAnalysis(f.args);assert.deepEqual(result.errors,[]);assert.equal(f.calls.length,3);assert.equal(f.maxActive,2);
 assert.ok(reviewRoster(f.disk.episodes[2]).every(i=>!needsArtReviewDetails(i)));assert.ok(f.disk.episodes[2].scenes.every(isSceneVerified));
 for(const call of f.calls){assert.equal(call.profileId,'selected');const data=JSON.parse(call.messages[1].content).untrustedData;assert.ok(data.priorArtLedger.some(i=>i.name==='【主角-校服】'));assert.ok(!call.messages.some(m=>m.content.includes('1-1 酒吧')));}
 await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,3,'complete cards do not generate again');
});
test('one missing response does not discard the successful cards, and retry requests only remaining details',async()=>{
 const f=await fixture(3),original=f.api.aiChat;
 f.api.aiChat=async p=>{const result=await original(p),data=JSON.parse(result.output);data.items.shift();return {...result,output:JSON.stringify(data)};};
 const result=await runArtReviewAnalysis(f.args);assert.equal(result.errors.length,1);assert.equal(reviewRoster(f.disk.episodes[2]).filter(needsArtReviewDetails).length,1);
 f.api.aiChat=original;await runArtReviewAnalysis(f.args);assert.equal(JSON.parse(f.calls.at(-1).messages[1].content).untrustedData.requestedItems.length,1);
 assert.equal(reviewRoster(f.disk.episodes[2]).filter(needsArtReviewDetails).length,0);
});
test('manual correction or removal during backfill cannot be overwritten by an old response',async()=>{
 const f=await fixture(3),original=f.api.aiChat;
 f.api.aiChat=async p=>{const requested=JSON.parse(p.messages[1].content).untrustedData.requestedItems;
  await f.store.update(2,r=>editArtReview(r,{type:'roster-upsert',itemId:requested[0].id,sceneIds:['2-1'],item:{...requested[0],note:'改穿白衣',ready:false}}));
  await f.store.update(2,r=>editArtReview(r,{type:'roster-remove',itemId:requested[1].id}));return original(p);};
 await runArtReviewAnalysis(f.args);const roster=reviewRoster(f.disk.episodes[2]);assert.ok(roster.some(i=>i.note==='改穿白衣'&&!i.ready));assert.equal(roster.length,2);assert.equal(roster.filter(i=>i.ready).length,1);
});
test('information reading automatically fills pending details after storing the original inventory and mapping',async()=>{
 const f=await fixture(0),original=f.api.aiChat;
 f.api.aiChat=async p=>{
  if(p.messages[0].content.includes('本次仅补齐指定信息卡'))return original(p);
  return {ok:true,output:'### 第2集\n人物：\n- 【壮汉乙-黑衣】（首次）黑衣。\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n'+JSON.stringify({scenes:[{sceneId:'2-1',assets:[{category:'character',name:'【壮汉乙-黑衣】'}]},{sceneId:'2-2',assets:[]}]})};
 };
 await runArtReviewAnalysis({...f.args,detailsOnly:false,force:true});assert.equal(f.calls.length,1);assert.equal(f.disk.episodes[2].roster[0].ready,true);assert.ok(f.disk.episodes[2].history.some(h=>h.reason==='完整模型回包'));
});
test('voice only entities receive an explicit explanation instead of invented clothing and endless pending flags',async()=>{
 const f=await fixture(1);f.api.aiChat=async p=>{const item=JSON.parse(p.messages[1].content).untrustedData.requestedItems[0];return {ok:true,output:JSON.stringify({items:[{...item,visible:false,reason:'本集仅为声音，未出现可见实体。'}]})};};
 await runArtReviewAnalysis(f.args);assert.equal(f.disk.episodes[2].roster[0].description,'');assert.equal(f.disk.episodes[2].roster[0].detailStatus,'nonvisual');assert.equal(needsArtReviewDetails(f.disk.episodes[2].roster[0]),false);
});

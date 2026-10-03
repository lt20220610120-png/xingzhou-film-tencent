import test from 'node:test';
import assert from 'node:assert/strict';
import {applyArtReviewCandidate,artReviewContext,buildArtReviewInstruction,decodeArtReviewOutput,editArtReview,importLegacyArtReview,isSceneVerified,newArtReview,projectPublishedReviewAssets,removeUnassignedArtReview,reviewSceneSignature} from './artReview.js';
import {getArtReviewStore} from './artReviewPersistence.js';
import {runArtReviewAnalysis} from './artReviewRunner.js';
import {ART_RUNTIME_SKILL} from './collabArtSkill.js';
import {createRequire} from 'node:module';
import {parseDirectorScenesReadonly} from './scriptImport.js';
import {projectReferenceCandidates} from './automaticReferences.js';
const ep=n=>({episodeNumber:n,title:`第${n}集`,content:`${n}-1 卧室 夜 内\n林清雪穿睡衣。\n\n${n}-2 学校 日 外\n林清雪穿校服。`});
const item=(name,category='character')=>({id:category+name,category,name,description:'脸型：椭圆。五官：黑色双眼、鼻梁清晰。完整服装：浅色上衣、长裤、布鞋。',ready:true,firstEpisode:1});
const output=n=>`### 第${n}集\n人物：\n- 【林清雪-睡衣】（首次）脸型：椭圆；五官：黑色双眼、鼻梁清晰；完整服装：浅色睡衣、长裤、布鞋。\n- 【林清雪-校服】（首次）参考【林清雪-睡衣】；状态差异：白色校服衬衫、蓝色长裙。\n场景：\n- 【卧室】（首次）床铺、木门和窗户。\n道具：\n- 无\n【逐场资产对应表】\n${JSON.stringify({scenes:[{sceneId:`${n}-1`,assets:[{category:'character',name:'【林清雪-睡衣】'},{category:'scene',name:'【卧室】'}]},{sceneId:`${n}-2`,assets:[{category:'character',name:'【林清雪-校服】'}]}]})}`;
const candidate=(n=1)=>applyArtReviewCandidate(newArtReview(ep(n)),ep(n),decodeArtReviewOutput(output(n),n),{rawOutput:output(n)});
test('client and backend preserve the same source scene boundaries; unanalyzed scenes cannot be accidentally confirmed',()=>{
 const {sourceScenes}=createRequire(import.meta.url)('../cloud-backend/src/art-review-repository.cjs');for(const text of ['前言\r\n3-5 景：卧室 夜 内\r\n正文\r\n场景 3－8 学校\r\n结尾','没有场次的正文',''])assert.deepEqual(sourceScenes(text,3),parseDirectorScenesReadonly(text,3).map(s=>({id:s.label,source:s.content})));
 assert.throws(()=>editArtReview(newArtReview(ep(1)),{type:'approve-episode'}),/尚未分析/);
});
test('automatic references use published scene bindings and exclude detached states; manual legacy cards remain usable',()=>{
 const assets=[{id:'sleep',name:'【林清雪-睡衣】',category:'character',episodes:[1],sceneIds:['1-1'],image_url:'sleep.png'},{id:'uniform',name:'【林清雪-校服】',category:'character',episodes:[1],sceneIds:['1-2'],image_url:'uniform.png'},{id:'removed',name:'【林清雪-旧衣】',category:'character',episodes:[],sceneIds:[],image_url:'old.png'},{id:'manual',name:'【台灯】',category:'prop',episodes:[1],image_url:'lamp.png'}];
 assert.deepEqual(projectReferenceCandidates(assets,[],'p',1,'1-1').map(a=>a.assetId),['sleep','manual']);assert.deepEqual(projectReferenceCandidates(assets,[],'p',1,'1-2').map(a=>a.assetId),['uniform','manual']);
});
function fixture(count=2){
 let disk=null,remote={},calls=[],publishCalls=[],offline=false,loseAck=false;
 const project={id:crypto.randomUUID(),genre:'现代青春',episodes:Array.from({length:count},(_,i)=>ep(i+1)),analysis_progress:{}};
 const api={artReviewLoadLocal:async()=>structuredClone(disk),artReviewSaveLocal:async({data})=>{disk=structuredClone(data);},analysisLoad:async()=>null,
  collabArtReviewSave:async p=>{if(offline)throw Error('离线');const old=remote[p.episodeNumber];if(old?.lastWriteId===p.writeId)return structuredClone(old);if((old?.version||0)!==p.baseVersion)throw Error('云端核实冲突');const saved={...structuredClone(p.data),version:p.baseVersion+1,lastWriteId:p.writeId};delete saved.pending;delete saved.writeId;remote[p.episodeNumber]=saved;project.analysis_progress[p.episodeNumber]={review:structuredClone(saved)};if(loseAck){loseAck=false;throw Error('回执丢失');}return saved;},
  collabArtReviewPublish:async p=>{publishCalls.push(p);const r=remote[p.episodeNumber];if(p.sceneIds.some(id=>!isSceneVerified(r.scenes.find(s=>s.id===id))))throw Error('尚未核实');return {...structuredClone(r),version:r.version+1};},
  aiChat:async p=>{calls.push(p);const n=JSON.parse(p.messages.at(-1).content.split('\n').at(-1)).sceneIds[0].split('-')[0];return {ok:true,output:output(Number(n))};}};
 const store=getArtReviewStore({api,projectId:project.id,accountId:'review-test'});
 return {project,api,store,calls,publishCalls,args:{project,api,genre:project.genre,profile:{id:'selected',model:'selected-model'},accountId:'review-test'},get disk(){return disk;},get remote(){return remote;},set offline(v){offline=v;},set loseAck(v){loseAck=v;}};
}
test('candidate keeps distinct wardrobe per scene; legacy episode membership never guesses scene mapping',()=>{
 const r=candidate();assert.equal(r.status,'generated');assert.deepEqual(r.scenes[0].items.map(i=>i.name),['【林清雪-睡衣】','【卧室】']);assert.deepEqual(r.scenes[1].items.map(i=>i.name),['【林清雪-校服】']);assert.equal(r.unassigned.length,0);
 const legacy=importLegacyArtReview(ep(1),{output:output(1).split('【逐场资产对应表】')[0]});assert.equal(legacy.unassigned.length,3);assert.ok(legacy.scenes.every(s=>s.items.length===0&&!isSceneVerified(s)));
});
test('deletion, undo and renamed manual states survive a later generation',()=>{
 let r=candidate();const id=r.scenes[0].items[0].id;
 r=editArtReview(r,{type:'remove',sceneId:'1-1',itemId:id});let next=applyArtReviewCandidate(r,ep(1),decodeArtReviewOutput(output(1),1));assert.ok(!next.scenes[0].items.some(i=>i.id===id));
 r=editArtReview(r,{type:'undo',sceneId:'1-1'});assert.equal(r.scenes[0].items[0].id,id);
 r=editArtReview(r,{type:'upsert',sceneId:'1-1',itemId:id,item:{...item('【林清雪-受伤睡衣】'),ready:false,manual:true,note:'睡衣袖子破损'}});
 next=applyArtReviewCandidate(r,ep(1),decodeArtReviewOutput(output(1),1));assert.ok(next.scenes[0].items.some(i=>i.name==='【林清雪-受伤睡衣】'&&!i.ready));assert.ok(!next.scenes[0].items.some(i=>i.name==='【林清雪-睡衣】'));assert.match(buildArtReviewInstruction(ep(1),r),/睡衣袖子破损/);
});
test('approved scenes remain frozen during new background candidate; actual edit invalidates approval',()=>{
 let r=editArtReview(candidate(),{type:'approve',sceneId:'1-1'},'human');assert.ok(isSceneVerified(r.scenes[0]));const before=structuredClone(r.scenes[0]);
 r=applyArtReviewCandidate(r,ep(1),decodeArtReviewOutput(output(1).replace('浅色睡衣','错误的新衣服'),1));assert.deepEqual(r.scenes[0].items,before.items);assert.ok(isSceneVerified(r.scenes[0]));
 r=editArtReview(r,{type:'remove',sceneId:'1-1',itemId:r.scenes[0].items[0].id});assert.equal(isSceneVerified(r.scenes[0]),false);
});
test('truncated mapping keeps complete inventory and unassigned entries; unassigned deletions stay deleted',()=>{
 let r=applyArtReviewCandidate(newArtReview(ep(1)),ep(1),decodeArtReviewOutput(output(1).split('【逐场资产对应表】')[0]+'【逐场资产对应表】\n{"scenes":',1));assert.equal(r.status,'mapping-pending');assert.equal(r.unassigned.length,3);
 r=removeUnassignedArtReview(r,r.unassigned[0].id);r=applyArtReviewCandidate(r,ep(1),decodeArtReviewOutput(r.inventory,1));assert.equal(r.unassigned.length,2);assert.match(buildArtReviewInstruction(ep(1),r),/excludedUnassigned/);
 assert.throws(()=>editArtReview(r,{type:'approve-episode'}),/未定位/);
});
test('only approved prior inventory and relevant detail are sent for one-episode correction',()=>{
 let first=editArtReview(candidate(),{type:'approve-episode'});first.scenes[0].items.push(item('【不相关人物-常服】'));first=editArtReview(first,{type:'approve',sceneId:'1-1'});
 const ctx=artReviewContext({1:first,2:candidate(2),4:candidate(4)},ep(3));assert.deepEqual(Object.keys(ctx.dependencies),['1']);assert.ok(ctx.approved.some(i=>i.name==='【林清雪-睡衣】'&&i.description));assert.equal(ctx.approved.find(i=>i.name==='【不相关人物-常服】').description,undefined);assert.ok(!ctx.approved.some(i=>i.episode>=3));assert.equal(ctx.unverified.length,0);
});
test('source changes preserve old work in history and invalidate old verification',()=>{
 const r=editArtReview(candidate(),{type:'approve-episode'}),changed={...ep(1),content:'1-5 新场景\n新剧情'};
 const next=applyArtReviewCandidate(r,changed,{inventory:'',complete:false,items:[],mapping:[],warnings:[]});assert.equal(next.scenes[0].id,'1-5');assert.equal(isSceneVerified(next.scenes[0]),false);assert.ok(next.history.some(h=>h.reason==='正文变更'&&h.scenes[0].approval));
});
test('published scene associations decorate original assets while retaining images and prompts',()=>{
 const r=candidate(),s=r.scenes[0];r.published[s.id]={...s,signature:reviewSceneSignature(s)};const asset={id:'existing',name:'【林清雪-睡衣】',category:'character',description:'人工描述',images:[{url:'old.png'}]};
 const result=projectPublishedReviewAssets({analysis_progress:{1:{review:r}}},[asset])[0];assert.deepEqual(result.sceneIds,['1-1']);assert.equal(result.description,'人工描述');assert.deepEqual(result.images,asset.images);
});
test('full extraction uses full Skill, saves all episodes without publishing assets or waiting for approval',async()=>{
 const f=fixture(3);await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,3);assert.equal(f.publishCalls.length,0);assert.equal(Object.keys(f.disk.episodes).length,3);assert.ok(f.calls.every(c=>c.messages[0].content.includes(ART_RUNTIME_SKILL)&&c.profileId==='selected'));
 await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,3);
 await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));await f.store.publish(1,['1-1','1-2']);assert.equal(f.publishCalls.length,1);
});
test('offline edits persist; sync retry and acknowledgement loss never call model again',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);f.offline=true;await f.store.update(1,r=>editArtReview(r,{type:'remove',sceneId:'1-1',itemId:r.scenes[0].items[0].id}));assert.equal(f.disk.episodes[1].pending,true);await assert.rejects(f.store.publish(1,['1-1']),/离线/);
 f.offline=false;f.loseAck=true;await f.store.sync();assert.equal(f.disk.episodes[1].pending,true);await f.store.sync();assert.equal(f.disk.episodes[1].pending,false);assert.equal(f.calls.length,1);
});
test('CAS conflict preserves local draft; explicit cloud choice archives it',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);f.remote[1].version+=1;f.project.analysis_progress[1].review=structuredClone(f.remote[1]);await f.store.update(1,r=>editArtReview(r,{type:'remove',sceneId:'1-1',itemId:r.scenes[0].items[0].id}));assert.match(f.disk.episodes[1].syncError,/冲突/);assert.equal(f.disk.episodes[1].scenes[0].items.length,1);
 await f.store.useCloud(1,f.project);assert.ok(f.disk.episodes[1].history.some(h=>h.reason.includes('冲突本地版本')&&h.previous.scenes[0].items.length===1));
});
test('partial model result is saved and next episodes continue; mapping-only retry reuses inventory',async()=>{
 const f=fixture(2),original=f.api.aiChat;f.api.aiChat=async p=>{if(!f.calls.length){f.calls.push(p);return {ok:false,error:'截断',output:output(1).split('【逐场资产对应表】')[0]};}return original(p);};
 const result=await runArtReviewAnalysis(f.args);assert.equal(result.errors.length,1);assert.ok(f.disk.episodes[1].rawOutput);assert.equal(f.disk.episodes[2].status,'generated');assert.equal(f.publishCalls.length,0);
 f.api.aiChat=original;await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,3);assert.match(f.calls[2].messages.at(-1).content,/只补齐对应表/);assert.equal(f.disk.episodes[1].status,'generated');
});
test('target correction omits earlier scripts and future scenes; concurrent deletion wins over returning model',async()=>{
 const f=fixture(3);await runArtReviewAnalysis(f.args);await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));
 f.project.episodes[0].content+='\n旧集秘密正文';let intercepted=false;const original=f.api.aiChat;f.api.aiChat=async p=>{intercepted=true;await f.store.update(3,r=>editArtReview(r,{type:'remove',sceneId:'3-1',itemId:r.scenes[0].items[0].id}));return original(p);};
 await runArtReviewAnalysis({...f.args,targetEpisodeNumbers:[3],force:true});assert.ok(intercepted);const messages=f.calls.at(-1).messages.map(m=>m.content).join('\n');assert.ok(!messages.includes('旧集秘密正文'));assert.ok(!messages.includes('2-2 学校'));assert.ok(messages.includes('3-2 学校'));assert.ok(!f.disk.episodes[3].scenes[0].items.some(i=>i.name==='【林清雪-睡衣】'));
});

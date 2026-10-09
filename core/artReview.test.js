import test from 'node:test';
import assert from 'node:assert/strict';
import {applyArtReviewCandidate,artReviewContext,buildArtReviewInstruction,decodeArtReviewOutput,editArtReview,importLegacyArtReview,isSceneVerified,newArtReview,projectPublishedReviewAssets,removeUnassignedArtReview,reviewSceneSignature,reviewRoster} from './artReview.js';
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
test('published empty or populated scenes exclude unbound downstream manual cards from automatic references',()=>{
 let r=editArtReview(candidate(),{type:'approve-episode'});r.published=Object.fromEntries(r.scenes.map(s=>[s.id,{...s,signature:reviewSceneSignature(s)}]));
 const raw=[{id:'sleep',name:'【林清雪-睡衣】',category:'character',episodes:[1],image_url:'sleep.png'},{id:'manual',name:'【下游手动添加】',category:'prop',episodes:[1],image_url:'manual.png'}];
 const assets=projectPublishedReviewAssets({analysis_progress:{1:{review:r}}},raw);assert.deepEqual(projectReferenceCandidates(assets,[],'p',1,'1-1').map(a=>a.assetId),['sleep']);
 const s=getArtReviewStore({api:{artReviewLoadLocal:async()=>null,artReviewSaveLocal:async()=>{},analysisLoad:async()=>null},projectId:crypto.randomUUID()});
 return s.load({episodes:[ep(1)],analysis_progress:{1:{review:{...r,version:1}}}},raw).then(()=>assert.ok(!s.snapshot().episodes[1].roster.some(i=>i.name==='【下游手动添加】')));
});
function fixture(count=2){
 let disk=null,remote={},calls=[],saveCalls=[],publishCalls=[],offline=false,loseAck=false;
 const project={id:crypto.randomUUID(),genre:'现代青春',episodes:Array.from({length:count},(_,i)=>ep(i+1)),analysis_progress:{}};
 const api={artReviewLoadLocal:async()=>structuredClone(disk),artReviewSaveLocal:async({data})=>{disk=structuredClone(data);},analysisLoad:async()=>null,
  collabArtReviewSave:async p=>{saveCalls.push(p);if(offline)throw Error('离线');const old=remote[p.episodeNumber];if(old?.lastWriteId===p.writeId)return structuredClone(old);if((old?.version||0)!==p.baseVersion)throw Error('云端核实冲突');const saved={...structuredClone(p.data),version:p.baseVersion+1,lastWriteId:p.writeId};delete saved.pending;delete saved.writeId;remote[p.episodeNumber]=saved;project.analysis_progress[p.episodeNumber]={review:structuredClone(saved)};if(loseAck){loseAck=false;throw Error('回执丢失');}return saved;},
  collabArtReviewPublish:async p=>{publishCalls.push(p);const r=remote[p.episodeNumber];if(r.lastWriteId===p.writeId)return structuredClone(r);if(r.version!==p.baseVersion)throw Error('云端核实冲突');if(p.sceneIds.some(id=>!isSceneVerified(r.scenes.find(s=>s.id===id))))throw Error('尚未核实');const saved={...structuredClone(r),version:r.version+1,lastWriteId:p.writeId};for(const id of p.sceneIds){const s=saved.scenes.find(s=>s.id===id);saved.published[id]={...structuredClone(s),signature:reviewSceneSignature(s)};}remote[p.episodeNumber]=saved;project.analysis_progress[p.episodeNumber]={review:structuredClone(saved)};return saved;},
  aiChat:async p=>{calls.push(p);const n=JSON.parse(p.messages.at(-1).content.split('\n').at(-1)).sceneIds[0].split('-')[0];return {ok:true,output:output(Number(n))};}};
 const store=getArtReviewStore({api,projectId:project.id,accountId:'review-test'});
 return {project,api,store,calls,saveCalls,publishCalls,args:{project,api,genre:project.genre,profile:{id:'selected',model:'selected-model'},accountId:'review-test'},get disk(){return disk;},get remote(){return remote;},set offline(v){offline=v;},set loseAck(v){loseAck=v;}};
}
test('candidate keeps distinct wardrobe per scene; legacy episode membership never guesses scene mapping',()=>{
 const r=candidate();assert.equal(r.status,'generated');assert.deepEqual(r.scenes[0].items.map(i=>i.name),['【林清雪-睡衣】','【卧室】']);assert.deepEqual(r.scenes[1].items.map(i=>i.name),['【林清雪-校服】']);assert.equal(r.unassigned.length,0);
 const legacy=importLegacyArtReview(ep(1),{output:output(1).split('【逐场资产对应表】')[0]});assert.equal(legacy.unassigned.length,3);assert.ok(legacy.scenes.every(s=>s.items.length===0&&!isSceneVerified(s)));
});

test('episode roster survives assigning the same card to several scenes and scene removal is independent',()=>{
 let r=importLegacyArtReview(ep(1),{output:output(1).split('【逐场资产对应表】')[0]});
 const first=r.unassigned[0];r=editArtReview(r,{type:'assign',itemId:first.id,sceneIds:['1-1','1-2']});
 assert.equal(r.roster.filter(i=>i.name===first.name).length,1);assert.ok(r.scenes.every(s=>s.items.some(i=>i.name===first.name)));
 r=editArtReview(r,{type:'remove',sceneId:'1-1',itemId:first.id});assert.ok(r.roster.some(i=>i.name===first.name));assert.ok(r.scenes[1].items.some(i=>i.name===first.name));
 r=editArtReview(r,{type:'assign',itemId:first.id,sceneIds:['1-1','1-2']});assert.ok(r.scenes[0].items.some(i=>i.name===first.name));
 r=editArtReview(r,{type:'roster-remove',itemId:first.id});assert.ok(!r.scenes.some(s=>s.items.some(i=>i.name===first.name)));r=editArtReview(r,{type:'roster-undo'});assert.ok(r.scenes.every(s=>s.items.some(i=>i.name===first.name)));
});

test('rereading adds missing cards while preserving first descriptions and keeping alternate prompts',()=>{
 const original=candidate(),changed=output(1).replace('浅色睡衣','新模型不同睡衣').replace('道具：','道具：\n- 【书包】 蓝色双肩包');
 const next=applyArtReviewCandidate(original,ep(1),decodeArtReviewOutput(changed,1));
 assert.equal(next.scenes[0].items[0].description,original.scenes[0].items[0].description);assert.equal(next.roster.filter(i=>i.name==='【林清雪-睡衣】').length,1);
 assert.ok(next.roster.find(i=>i.name==='【林清雪-睡衣】').alternatives.some(a=>a.description.includes('新模型')));assert.ok(next.roster.some(i=>i.name==='【书包】'));
 const omitted=applyArtReviewCandidate(next,ep(1),decodeArtReviewOutput(output(1).replace(/- 【林清雪-校服】[^\n]*\n/,''),1));assert.ok(omitted.roster.some(i=>i.name==='【林清雪-校服】'));
});

test('manual roster addition links scenes and model fills only its pending information card',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);
 await f.store.update(1,r=>editArtReview(r,{type:'roster-upsert',sceneIds:['1-1','1-2'],item:{category:'prop',name:'【漏掉的书包】',description:'',ready:false,note:'蓝色双肩包'}}));
 const added=f.store.snapshot().episodes[1].roster.find(i=>i.name==='【漏掉的书包】');const before=f.store.snapshot().episodes[1].scenes[0].items[0].description;
 f.api.aiChat=async p=>{f.calls.push(p);return {ok:true,output:JSON.stringify({item:{category:'prop',name:'【漏掉的书包】',description:'蓝色双肩包，帆布材质，两条肩带'}})};};
 await runArtReviewAnalysis({...f.args,targetEpisodeNumbers:[1],force:true,focusItem:added});
 const record=f.store.snapshot().episodes[1];assert.ok(record.scenes.every(s=>s.items.find(i=>i.name===added.name)?.ready));assert.equal(record.scenes[0].items[0].description,before);assert.equal(f.calls.length,2);
});

test('missing scene map triggers automatic compact mapping after inventory is saved',async()=>{
 const f=fixture(1);f.api.aiChat=async p=>{f.calls.push(p);assert.ok(f.disk.episodes[1]);return {ok:true,output:f.calls.length===1?output(1).split('【逐场资产对应表】')[0]:output(1).split('【逐场资产对应表】')[1]};};
 await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,2);assert.equal(f.disk.episodes[1].status,'generated');assert.equal(f.disk.episodes[1].unassigned.length,0);assert.ok(!f.calls[1].messages[0].content.includes(ART_RUNTIME_SKILL));assert.equal(f.publishCalls.length,0);
});
test('malformed or unknown scene assets remain pending and trigger automatic mapping repair',async()=>{
 const f=fixture(1);f.api.aiChat=async p=>{f.calls.push(p);return {ok:true,output:f.calls.length===1?output(1).split('【逐场资产对应表】')[0]+'【逐场资产对应表】\n'+JSON.stringify({scenes:[{sceneId:'1-1',assets:[{category:'character',name:'【不存在的角色】'}]},{sceneId:'1-2'}]}):output(1).split('【逐场资产对应表】')[1]};};
 await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,2);assert.equal(f.disk.episodes[1].status,'generated');assert.equal(f.disk.episodes[1].unassigned.length,0);
});
test('null mapping rows and asset references preserve inventory and trigger automatic repair',async()=>{
 const f=fixture(1);f.api.aiChat=async p=>{f.calls.push(p);return {ok:true,output:f.calls.length===1?output(1).split('【逐场资产对应表】')[0]+'【逐场资产对应表】\n'+JSON.stringify({scenes:[null,{sceneId:'1-1',assets:[null]},{sceneId:'1-2',assets:42}]}):output(1).split('【逐场资产对应表】')[1]};};
 const result=await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,2);assert.equal(f.disk.episodes[1].status,'generated');assert.equal(result.errors.length,0);assert.ok(reviewRoster(f.disk.episodes[1]).length);
});
test('full inventory request cannot fulfill a newer manual note using stale returned details',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);const old=reviewRoster(f.disk.episodes[1])[0],original=f.api.aiChat;
 f.api.aiChat=async p=>{await f.store.update(1,r=>editArtReview(r,{type:'roster-upsert',itemId:old.id,sceneIds:['1-1'],item:{...old,note:'必须改为红色睡衣',ready:false}}));return original(p);};
 await runArtReviewAnalysis({...f.args,force:true});const saved=reviewRoster(f.disk.episodes[1]).find(i=>i.id===old.id);assert.equal(saved.note,'必须改为红色睡衣');assert.equal(saved.ready,false);
});
test('adding a roster-only card fills details and locates it without manual scene assignment',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);
 await f.store.update(1,r=>editArtReview(r,{type:'roster-upsert',item:{category:'prop',name:'【台灯】',description:'',ready:false,note:'床头白色台灯'}}));
 const added=reviewRoster(f.store.snapshot().episodes[1]).find(i=>i.name==='【台灯】');
 f.api.aiChat=async p=>{f.calls.push(p);return {ok:true,output:JSON.stringify({item:{category:'prop',name:added.name,description:'白色台灯，圆形灯罩，床头摆放'},sceneIds:['1-1']})};};
 await runArtReviewAnalysis({...f.args,force:true,focusItem:added});
 assert.ok(f.disk.episodes[1].scenes[0].items.some(i=>i.name===added.name&&i.ready));assert.ok(!f.disk.episodes[1].scenes[1].items.some(i=>i.name===added.name));
});
test('explicit remapping of a generated episode uses compact roster context and preserves manual scene selection',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);
 const item=reviewRoster(f.disk.episodes[1])[0];await f.store.update(1,r=>editArtReview(r,{type:'assign',itemId:item.id,sceneIds:['1-1']}));
 f.api.aiChat=async p=>{f.calls.push(p);return {ok:true,output:JSON.stringify({scenes:[{sceneId:'1-1',assets:[item]},{sceneId:'1-2',assets:[item]}]})};};
 await runArtReviewAnalysis({...f.args,mapOnly:true});
 assert.equal(f.calls.length,2);assert.ok(!f.calls[1].messages[0].content.includes(ART_RUNTIME_SKILL));assert.ok(!f.disk.episodes[1].scenes[1].items.some(i=>i.id===item.id));
});
test('editor scene selections are pinned while an unassigned new card remains eligible for automatic location',()=>{
 let r=editArtReview(candidate(),{type:'roster-upsert',sceneIds:['1-1'],item:{category:'prop',name:'【台灯】',description:'台灯',ready:true}});
 r=applyArtReviewCandidate(r,ep(1),{inventory:r.inventory,items:reviewRoster(r),mapping:r.scenes.map(s=>({sceneId:s.id,assets:reviewRoster(r)})),warnings:[],complete:true});
 assert.ok(r.scenes[0].items.some(i=>i.name==='【台灯】'));assert.ok(!r.scenes[1].items.some(i=>i.name==='【台灯】'));
 let blank=editArtReview(candidate(),{type:'roster-upsert',sceneIds:[],item:{category:'prop',name:'【台灯】',description:'',ready:false}});assert.equal(reviewRoster(blank).find(i=>i.name==='【台灯】').manualSceneIds,undefined);
 r=editArtReview(r,{type:'roster-upsert',itemId:reviewRoster(r).find(i=>i.name==='【台灯】').id,sceneIds:[],item:{category:'prop',name:'【台灯】',description:'台灯',ready:true}});
 r=applyArtReviewCandidate(r,ep(1),{inventory:r.inventory,items:reviewRoster(r),mapping:r.scenes.map(s=>({sceneId:s.id,assets:reviewRoster(r)})),warnings:[],complete:true});assert.ok(!r.scenes.some(s=>s.items.some(i=>i.name==='【台灯】')));
});
test('explicit readdition or renaming back restores a globally removed name without reviving it from model output',()=>{
 let r=candidate(),old=reviewRoster(r)[0];r=editArtReview(r,{type:'roster-remove',itemId:old.id});
 r=applyArtReviewCandidate(r,ep(1),decodeArtReviewOutput(output(1),1));assert.ok(!reviewRoster(r).some(i=>i.name===old.name));
 r=editArtReview(r,{type:'roster-upsert',item:{...old,id:undefined},sceneIds:['1-1']});assert.ok(reviewRoster(r).some(i=>i.name===old.name));assert.ok(r.scenes[0].items.every(i=>reviewRoster(r).some(v=>v.name===i.name)));
 let restored=reviewRoster(r).find(i=>i.name===old.name);r=editArtReview(r,{type:'roster-upsert',itemId:restored.id,item:{...restored,name:'【新名字】'},sceneIds:['1-1']});
 restored=reviewRoster(r).find(i=>i.name==='【新名字】');r=editArtReview(r,{type:'roster-upsert',itemId:restored.id,item:{...restored,name:old.name},sceneIds:['1-1']});assert.ok(reviewRoster(r).some(i=>i.name===old.name));
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
 assert.throws(()=>editArtReview(r,{type:'approve-episode'}),/尚未分析/);
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
 const f=fixture(3);await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,3);assert.equal(f.saveCalls.length,0);assert.equal(f.publishCalls.length,0);assert.equal(Object.keys(f.disk.episodes).length,3);assert.ok(f.calls.every(c=>c.messages[0].content.includes(ART_RUNTIME_SKILL)&&c.profileId==='selected'));
 await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,3);
 await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));await f.store.publish(1,['1-1','1-2']);assert.equal(f.publishCalls.length,1);
});
test('offline edits persist; local checkpoint retries never upload and publication acknowledgement retries never call model again',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);f.offline=true;await f.store.update(1,r=>editArtReview(r,{type:'remove',sceneId:'1-1',itemId:r.scenes[0].items[0].id}));await f.store.update(1,r=>editArtReview(r,{type:'approve',sceneId:'1-1'}));assert.equal(f.disk.episodes[1].pending,true);await f.store.sync();assert.equal(f.saveCalls.length,0);await assert.rejects(f.store.publish(1,['1-1']),/离线/);
 f.offline=false;f.loseAck=true;await assert.rejects(f.store.publish(1,['1-1']),/回执丢失/);assert.equal(f.disk.episodes[1].pending,true);await f.store.load(f.project);assert.equal(f.disk.episodes[1].pending,true);await f.store.publish(1,['1-1']);assert.equal(f.disk.episodes[1].pending,false);assert.equal(f.calls.length,1);
});
test('CAS conflict preserves local draft; explicit cloud choice archives it',async()=>{
 const f=fixture(1);await runArtReviewAnalysis(f.args);f.remote[1]={...structuredClone(f.disk.episodes[1]),version:1};f.project.analysis_progress[1]={review:structuredClone(f.remote[1])};await f.store.update(1,r=>editArtReview(r,{type:'remove',sceneId:'1-1',itemId:r.scenes[0].items[0].id}));await f.store.update(1,r=>editArtReview(r,{type:'approve',sceneId:'1-1'}));assert.equal(f.disk.episodes[1].syncError,undefined);await assert.rejects(f.store.publish(1,['1-1']),/冲突/);assert.match(f.disk.episodes[1].syncError,/冲突/);assert.equal(f.disk.episodes[1].scenes[0].items.length,1);
 await f.store.useCloud(1,f.project);assert.ok(f.disk.episodes[1].history.some(h=>h.reason.includes('冲突本地版本')&&h.previous.scenes[0].items.length===1));
});
test('partial model result pauses later episodes; mapping-only retry reuses inventory before continuing',async()=>{
 const f=fixture(2),original=f.api.aiChat;f.api.aiChat=async p=>{if(!f.calls.length){f.calls.push(p);return {ok:false,error:'截断',output:output(1).split('【逐场资产对应表】')[0]};}return original(p);};
 const result=await runArtReviewAnalysis(f.args);assert.equal(result.errors.length,1);assert.ok(f.disk.episodes[1].rawOutput);assert.equal(f.disk.episodes[2].status,'empty');assert.equal(f.publishCalls.length,0);
 f.api.aiChat=original;await runArtReviewAnalysis(f.args);assert.equal(f.calls.length,3);assert.match(f.calls[1].messages.at(-1).content,/只补齐对应表/);assert.equal(f.disk.episodes[1].status,'generated');assert.equal(f.disk.episodes[2].status,'generated');
});
test('target correction omits earlier scripts and future scenes; concurrent deletion wins over returning model',async()=>{
 const f=fixture(3);await runArtReviewAnalysis(f.args);await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));
 f.project.episodes[0].content+='\n旧集秘密正文';let intercepted=false;const original=f.api.aiChat;f.api.aiChat=async p=>{intercepted=true;await f.store.update(3,r=>editArtReview(r,{type:'remove',sceneId:'3-1',itemId:r.scenes[0].items[0].id}));return original(p);};
 await runArtReviewAnalysis({...f.args,targetEpisodeNumbers:[3],force:true});assert.ok(intercepted);const messages=f.calls.at(-1).messages.map(m=>m.content).join('\n');assert.ok(!messages.includes('旧集秘密正文'));assert.ok(!messages.includes('2-2 学校'));assert.ok(messages.includes('3-2 学校'));assert.ok(!f.disk.episodes[3].scenes[0].items.some(i=>i.name==='【林清雪-睡衣】'));
});

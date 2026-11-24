import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {storyboardShots,storyboardPublicationPayload,validateStoryboardSubmission} from './storyboardPublication.js';
import {storyboardSaveUpdates,storyboardPromptValue,assetPromptUsage} from './promptAssetUsage.js';
import {validateCompiledBinding} from './promptArtBinding.js';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {reviewPromptScope} from './promptReviewBatch.js';
const {patchShot,mergeDirectorEpisodes}=createRequire(import.meta.url)('../cloud-backend/src/storyboard-merge.cjs');
const initial=()=>[{id:'ep',episodeNumber:1,content:'1-1 客厅 日 内',prompts:[{id:'source',label:'1-1-1',content:'旧导演稿'}]}];
const publication=(id='pub1',prompt='已核实正文',refs=[{id:'a',assetId:'asset',kind:'image'}])=>({operation:'publish',episodeNumber:1,sceneIds:['1-1'],publicationId:id,versionId:'v1',prompts:[{id:'source',label:'1-1-1',content:prompt,generationConfig:{bindingCompiledPrompt:prompt,references:refs,referenceBindingMode:'storyboard'}}]});
test('explicit publication controls storyboard defaults, source sync cannot replace manual edits',()=>{
 let rows=patchShot(initial(),publication());const before=structuredClone(rows[0].prompts);
 rows=patchShot(rows,{episodeId:'ep',shotId:'source',editPolicy:'direct',storyboardPublicationId:'pub1',base:{content:'stale'},updates:storyboardSaveUpdates({prompt:'手改直接生成',referenceBindingMode:'storyboard',references:[{id:'manual',kind:'image'}]})});
 assert.equal(storyboardShots(rows[0])[0].content,'手改直接生成');assert.deepEqual(rows[0].prompts,before);
 const incoming=initial();incoming[0].promptEditionId='new-director-edition';incoming[0].prompts[0].content='尚未发布新导演稿';
 rows=mergeDirectorEpisodes(rows,incoming);assert.equal(storyboardShots(rows[0])[0].content,'手改直接生成');
 rows=patchShot(rows,publication('pub2','选择新版后已核实的新词',[{id:'b',assetId:'new-asset',kind:'image'}]));
 assert.equal(storyboardShots(rows[0])[0].content,'选择新版后已核实的新词');assert.equal(storyboardShots(rows[0])[0].generationConfig.references[0].id,'b');assert.equal(rows[0].content,incoming[0].content);
 assert.throws(()=>patchShot(rows,{episodeId:'ep',shotId:'source',editPolicy:'direct',storyboardPublicationId:'pub1',updates:{content:'迟到旧稿'}}),/发布新版本/);
});
test('stale same-shot bases do not prevent direct edits; legacy and deletion protection remain',()=>{
 let rows=initial();rows=patchShot(rows,{episodeId:'ep',shotId:'source',editPolicy:'direct',base:{content:'wrong'},updates:{content:'用户修改'}});
 assert.equal(storyboardShots(rows[0])[0].content,'用户修改');assert.throws(()=>patchShot(rows,{episodeId:'ep',shotId:'source',base:{content:'wrong'},updates:{content:'旧客户端'}}),/协作者/);
 assert.throws(()=>patchShot(rows,{episodeId:'ep',shotId:'source',operation:'delete',base:{content:'wrong'}}),/删除/);
});
test('new publication replaces only its scene, supports changed prompt counts, and duplicate delivery preserves subsequent edits',()=>{
 let rows=initial();rows[0].prompts.push({id:'other',label:'1-2-1',content:'其他场景'});rows=patchShot(rows,publication());
 const payload=publication('pub2');payload.prompts.push({id:'new',label:'1-1-2',content:'新增一条',generationConfig:{}});rows=patchShot(rows,payload);
 assert.deepEqual(storyboardShots(rows[0]).map(s=>s.label),['1-1-1','1-1-2','1-2-1']);
 rows=patchShot(rows,{episodeId:'ep',shotId:'source',editPolicy:'direct',storyboardPublicationId:'pub2',updates:{content:'再次手改'}});rows=patchShot(rows,payload);assert.equal(storyboardShots(rows[0])[0].content,'再次手改');
 rows=patchShot(rows,publication('pub3'));assert.deepEqual(storyboardShots(rows[0]).map(s=>s.label),['1-1-1','1-2-1']);
 assert.throws(()=>patchShot(rows,{...publication(),sceneIds:['2-1']}),/无效/);
});
test('main submission checks saved project/permissions/publication instead of comparing director text',async()=>{
 const rows=patchShot(initial(),publication());const shot=storyboardShots(rows[0])[0];shot.content='任意手工文字';const project={id:'p',myRole:'producer',episodes:rows},value={projectId:'p',shotId:'source',originalPrompt:shot.content,references:shot.generationConfig.references,storyboardPublicationId:'pub1'};
 const validate=()=>validateStoryboardSubmission({getProject:async()=>project,value,accountId:'u'});
 assert.deepEqual((await validate()).references,value.references);project.myRole='collaborator';assert.deepEqual((await validate()).references,value.references);project.myRole='producer';
 project.locked=true;await assert.rejects(validate(),/锁定/);project.locked=false;project.myRole='viewer';await assert.rejects(validate(),/权限/);project.myRole='producer';
 value.originalPrompt='点击后协作者又保存了其他内容';value.references=[{id:'manual-picked',kind:'image'}];assert.deepEqual((await validate()).references,value.references);
 value.storyboardPublicationId='older';await assert.rejects(validate(),/发布新版本/);
});
test('main submission checks the latest tagged estimate before preparing or sending video',async()=>{
 const rows=patchShot(initial(),publication());const shot=storyboardShots(rows[0])[0];
 const normal={version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:17,recommendedSeconds:17,needsResegment:false,capacityStatus:'正常',breakdown:{speechSeconds:12,nonparallelActionSeconds:4,pauseBufferSeconds:1},reason:'原话与独立动作顺序合计。'};
 const project={id:'p',myRole:'producer',episodes:rows},value={projectId:'p',shotId:'source',storyboardPublicationId:'pub1',originalPrompt:shot.content,duration:20,modelCapabilities:{durations:[5,10,15,20,30]}};
 const validate=()=>validateStoryboardSubmission({getProject:async()=>project,value,accountId:'u'});
 shot.durationEstimate=normal;shot.generationConfig={durationMode:'recommended',durationAlignment:'ceil'};
 await validate();
 value.duration=15;await assert.rejects(validate(),/当前模型档位不符/);
 value.duration=31;await assert.rejects(validate(),/超出 30 秒/);
 value.duration=20;value.originalPrompt='不同的正文';await assert.rejects(validate(),/正文已变化/);
 value.originalPrompt=shot.content;shot.durationEstimate={...normal,status:'needs-review'};await assert.rejects(validate(),/待复核/);
 shot.durationEstimate={version:'2.0.0',status:'pending',maxDurationSeconds:30,error:{code:'TIMEOUT',message:'估时超时'}};
 await assert.rejects(validate(),/待估时/);
});
test('published manual text and references are preserved without any comparison warning',()=>{
 const shot=storyboardShots(patchShot(initial(),publication())[0]),value={prompt:'手改正文',references:[{id:'manual',kind:'audio'}],referenceBindingMode:'confirmed',bindingCompiledPrompt:'原文'};
 const result=storyboardPromptValue({error:'新导演稿读取失败'},shot[0],value,'u');assert.equal(result.prompt,value.prompt);assert.deepEqual(result.references,value.references);assert.equal(result.bindingIssue,'');validateCompiledBinding(result,['image','audio']);
 assert.equal(storyboardSaveUpdates(result).content,value.prompt);
 assert.deepEqual(assetPromptUsage({publishedStoryboards:shot},{id:'asset'}).promptIds,['1-1-1']);
 const ungenerated={...shot[0],generationConfig:{references:[],bindingAssets:[{assetId:null,name:'【新角色】',category:'character'}]}};
 assert.deepEqual(assetPromptUsage({publishedStoryboards:[ungenerated]},{id:'new-asset',name:'【新角色】',category:'character'}).promptIds,['1-1-1']);
 assert.deepEqual(assetPromptUsage({publishedStoryboards:[ungenerated]},{id:'other',name:'【新角色】',category:'prop'}).promptIds,[]);

});
test('real review service publishes the selected prompt snapshot only on explicit publish',async()=>{
 const f=fixture(),writes=[];f.api.collabPatchStoryboard=async p=>writes.push(p);const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));assert.equal(writes.length,0);
 const store={updateMany:async()=>{},publish:async()=>{}};
 await reviewPromptScope({service,store,scope:{sceneId:'1-1'},actor:'u',action:'approve'});assert.equal(writes.length,0);
 await reviewPromptScope({service,store,scope:{sceneId:'1-1'},actor:'u',action:'publish'});assert.equal(writes.length,1);assert.equal(writes[0].operation,'publish');assert.equal(writes[0].prompts.length,3);
 const state=await service.read(),payload=storyboardPublicationPayload(state.snapshot,state.decisions,state.snapshot.entries);assert.equal(payload.versionId,state.snapshot.versionId);assert(payload.prompts.every(p=>p.generationConfig.referenceBindingMode==='storyboard'));assert(payload.prompts.every(p=>p.generationConfig.bindingAssets.length>0));
});


test('compact publication acknowledgement does not replace the current project with a receipt',async()=>{
 const f=fixture(),callbacks=[];let request;
 f.api.collabPatchStoryboard=async p=>{request=p;return {id:f.project.id,publicationReceipt:{publicationId:p.publicationId,episodeNumber:p.episodeNumber,sceneIds:p.sceneIds}}};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u',onPublished:p=>callbacks.push(p)});
 await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 await reviewPromptScope({service,store:{updateMany:async()=>{},publish:async()=>{}},actor:'u',action:'approve-publish'});
 assert.equal(request.ackOnly,true);assert.equal(callbacks.length,0);assert.equal(f.project.episodes[0].prompts.length,3);
});

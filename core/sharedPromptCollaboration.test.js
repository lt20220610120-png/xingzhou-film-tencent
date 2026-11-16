import test from 'node:test';import assert from 'node:assert/strict';import {createRequire}from'node:module';
import {example134}from'./automatic134.fixtures.js';import{createPromptDistributionService}from'./promptDistributionService.js';import{loadFreshBinding}from'./promptArtBinding.js';import{storyboardPromptValue}from'./promptAssetUsage.js';import{reviewSceneSignature}from'./artReview.js';import{mergeSharedReviewLedger}from'./sharedReviewLedger.js';import{getArtReviewStore}from'./artReviewPersistence.js';
const require=createRequire(import.meta.url),{nextPromptBinding,KEY}=require('../cloud-backend/src/prompt-binding.cjs'),{createProjectPromptBinding}=require('../electron/project-prompt-binding.cjs');
async function fixture(){
 const f=example134(),r=f.ledger.episodes[1],s=r.scenes[0];r.version=2;s.approval={signature:reviewSceneSignature(s)};r.published={[s.id]:{...s,signature:reviewSceneSignature(s)}};
 f.assets.push(...s.items.map(i=>({id:'asset-'+i.id,category:i.category,name:i.name,images:[{id:'image-'+i.id,url:'https://example.test/'+i.id+'.png'}]})));
 f.project.analysis_progress={1:{review:structuredClone(r)}};
 const source=createPromptDistributionService({...f,projectId:f.project.id,accountId:'owner'});await source.autoAssociate();
 const make=(id,role,local=null)=>createProjectPromptBinding({authorize:async()=>({id}),getProject:async()=>({...structuredClone(f.project),myRole:role}),saveShared:async p=>{const next=nextPromptBinding(f.project,p,id);f.project.analysis_progress[KEY]=next;return structuredClone(next)},localStore:()=>({load:()=>local}),getLedger:()=>id==='owner'?f.ledger:null,scope:()=>id});
 return {...f,make,owner:make('owner','producer',f.saved)};
}
test('two accounts share decisions and storyboard images before either clicks generate',async()=>{
 const f=await fixture(),pid=f.project.id;await f.owner.load({projectId:pid,accountId:'owner'});
 const guest=f.make('guest','collaborator');assert.equal((await guest.status({projectId:pid,accountId:'guest'})).enabled,true);
 const api={promptArtLoad:p=>guest.load({...p,accountId:'guest'}),collabGetProject:async()=>f.project,collabListAssets:async()=>f.assets,artReviewLoadLocal:async()=>null};
 let fresh=await loadFreshBinding({api,projectId:pid,accountId:'guest'}),shot=f.project.episodes[0].prompts[0];
 assert.equal(fresh.saved.accountId,'guest');assert.equal(fresh.decisions[shot.id].confirmed,true);
 let value=storyboardPromptValue(fresh,shot,{prompt:shot.content,references:[]},'guest');assert.equal(value.references.length,3);
 f.assets[0].images.push({id:'adopted-new',url:'https://example.test/new.png'});f.assets[0].adoptedImageId='adopted-new';
 fresh=await loadFreshBinding({api,projectId:pid,accountId:'guest'});value=storyboardPromptValue(fresh,shot,value,'guest');assert.ok(value.references.some(r=>r.imageId==='adopted-new'));assert.equal(f.calls,0);
 await assert.rejects(guest.save({projectId:pid,accountId:'guest',baseRevision:1,data:fresh.saved}),/没有关联编辑权限/);
});
test('unpublished shared inventory is readable on a second machine and refreshes without replacing local edits',async()=>{
 const f=await fixture();delete f.project.analysis_progress[1];const r=f.ledger.episodes[1];r.version=0;r.published={};await f.owner.load({projectId:f.project.id,accountId:'owner'});
 const guest=f.make('guest','artist_collaborator'),api={promptArtLoad:p=>guest.load({...p,accountId:'guest'}),collabGetProject:async()=>f.project,collabListAssets:async()=>f.assets,artReviewLoadLocal:async()=>null};
 const fresh=await loadFreshBinding({api,projectId:f.project.id,accountId:'guest'});assert.equal(fresh.snapshot.cards.length,3);assert.equal(fresh.decisions.example.confirmed,true);
 const store=getArtReviewStore({api:{...api,artReviewSaveLocal:async()=>{}},projectId:f.project.id,accountId:'guest'});await store.load(f.project,f.assets);assert.equal(store.snapshot().episodes[1].scenes[0].items.length,3);
 const edited=structuredClone(store.snapshot());edited.episodes[1].pending=true;edited.episodes[1].scenes[0].items[0].description='本机未提交修改';assert.equal(mergeSharedReviewLedger(edited,f.project).episodes[1].scenes[0].items[0].description,'本机未提交修改');
});
test('migration and simultaneous collaborator writes are CAS protected; same request can be retried',async()=>{
 const f=await fixture(),p={projectId:f.project.id,accountId:'owner'},first=await f.owner.load(p);assert.equal(first.revision,1);assert.equal((await f.owner.load(p)).revision,1);
 const other=f.make('artist','artist_collaborator'),data={...first,enabled:false};await other.save({...p,accountId:'artist',baseRevision:1,writeId:'write-2',data});
 await assert.rejects(f.owner.save({...p,baseRevision:1,data:first}),/协作者更新/);
 assert.equal((await other.save({...p,accountId:'artist',baseRevision:1,writeId:'write-2',data})).revision,2);
 assert.equal((await f.owner.load(p)).enabled,false);
});
test('shared binding excludes local file paths and credentials, preserves image IDs and source text',async()=>{
 const f=await fixture(),first=await f.owner.load({projectId:f.project.id,accountId:'owner'});first.snapshot.cards[0].images[0].filePath='C:/private.png';first.snapshot.cards[0].images[0].apiKey='private-key';
 const saved=nextPromptBinding(f.project,{baseRevision:1,writeId:'clean',data:first},'owner');assert.equal(saved.snapshot.cards[0].images[0].filePath,undefined);assert.equal(saved.snapshot.cards[0].images[0].apiKey,undefined);assert.equal(saved.snapshot.cards[0].images[0].id,first.snapshot.cards[0].images[0].id);
 assert.throws(()=>nextPromptBinding(f.project,{baseRevision:1,writeId:'wrong',data:{...first,snapshot:{...first.snapshot,projectId:'another'}}},'owner'),/格式无效/);
});

test('obsolete local review drafts do not block sharing current associations',async()=>{
 const f=await fixture();f.ledger.episodes[2]={status:'reviewed',sourceContent:'deleted episode',scenes:[]};
 f.ledger.episodes[1].sourceContent='old source';
 const saved=await f.owner.load({projectId:f.project.id,accountId:'owner'});
 assert.equal(saved.revision,1);assert.deepEqual(saved.reviewLedger.episodes,{});
 assert.equal(saved.decisions.example.confirmed,true);
});

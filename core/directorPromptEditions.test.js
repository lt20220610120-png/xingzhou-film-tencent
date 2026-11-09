import test from 'node:test';
import assert from 'node:assert/strict';
import {newDirectorPromptEdition,switchDirectorPromptEdition,directorPromptEditions,activeDirectorEditionId} from './directorPromptEditions.js';
import {bindingSnapshot} from './promptArtBinding.js';
import {bindingVersionOptions,selectBindingVersion,saveBindingVersion} from './promptBindingVersions.js';
import {createSceneSnapshot,snapshotMatchesContext} from './directorQuickStore.js';
import {mergeCloudEpisodes} from './directorCloudProjects.js';
import {example134} from './automatic134.fixtures.js';
import {Y,seedDocument,editDocument,readDocument,projectDocument} from '../cloud-backend/shared/directorSharedDocument.mjs';
import {appendDirectorEpisodePrompts} from './projectStore.js';

function project(){return {id:'director',style:'真人电影级',aspectRatio:'16:9',episodes:[{id:'ep',title:'第一集',content:'1-1 走廊 夜 内\n甲：你好。',prompts:[{id:'paid',label:'1-1-1',content:'付费旧提示词'}],quickScenePlans:[{id:'plan'}],activeQuickScenePlanIds:{'1-1':'plan'},quickSceneEdits:{'1-1':'旧分段'},sceneVisions:{'1-1':'旧导演构想'}}]};}
test('named new edition starts empty in both modes and switching back exactly restores paid work/settings',()=>{
 const original=project(),next=newDirectorPromptEdition(original,'动漫版');assert.equal(next.episodes[0].prompts.length,0);assert.deepEqual(next.episodes[0].quickSceneEdits,{});assert.deepEqual(next.episodes[0].sceneVisions,{});assert.equal(next.episodes[0].content,original.episodes[0].content);
 assert.deepEqual(directorPromptEditions(next).map(e=>e.name),['原始版本','动漫版']);const id=activeDirectorEditionId(next);assert(id);
 const changed={...next,style:'2D动漫',aspectRatio:'9:16'};changed.episodes[0].prompts=[{id:'new',label:'1-1-1',content:'新提示词'}];
 const back=switchDirectorPromptEdition(changed,directorPromptEditions(next)[0].id);assert.deepEqual(back.episodes[0].prompts,original.episodes[0].prompts);assert.deepEqual(back.episodes[0].quickScenePlans,original.episodes[0].quickScenePlans);assert.equal(back.aspectRatio,'16:9');
 const again=switchDirectorPromptEdition(back,id);assert.equal(again.episodes[0].prompts[0].id,'new');assert.equal(again.style,'2D动漫');assert.equal(again.aspectRatio,'9:16');assert.throws(()=>newDirectorPromptEdition(again,'  '),/名称/);
});
test('collaboration sees named empty edition and supplements remain one explicit edition even with a different model',()=>{
 const f=example134(),old=bindingSnapshot(f.project,f.ledger,[]),initial=saveBindingVersion(null,selectBindingVersion(old,null).snapshot,{});
 let director=newDirectorPromptEdition(f.project,'电影新版');let current=bindingSnapshot(director,f.ledger,[],old),options=bindingVersionOptions(current,initial);assert.equal(options.length,2);assert.equal(options[0].label,'电影新版');assert.equal(options[0].count,0);
 const id=options[0].id;let saved=saveBindingVersion(initial,selectBindingVersion(current,initial).snapshot,{});
 director.episodes[0].prompts=[{id:'new1',label:'1-1-1',content:'补全正文',profileId:'other-model'}];current=bindingSnapshot(director,f.ledger,[],current);assert.equal(bindingVersionOptions(current,saved).length,2);assert.equal(bindingVersionOptions(current,saved)[0].id,id);
 saved=saveBindingVersion(saved,selectBindingVersion(current,saved).snapshot,{});director.episodes[0].prompts.push({id:'new2',label:'1-1-2',content:'又补一条'});current=bindingSnapshot(director,f.ledger,[],current);assert.equal(bindingVersionOptions(current,saved)[0].count,2);assert.equal(bindingVersionOptions(current,saved)[0].id,id);
 const original=options[1];assert.equal(selectBindingVersion(current,saved,original.id).snapshot.entries[0].id,'example');
});
test('legacy cloud merge never resurrects another edition into the active prompt list',()=>{
 const old=project(),next=newDirectorPromptEdition(old,'新版'),merged=mergeCloudEpisodes(old.episodes,next.episodes);assert.deepEqual(merged[0].prompts,[]);assert.equal(directorPromptEditions({...next,episodes:merged}).length,2);
});
test('concurrent live paid reply and vision edit stay in their original edition when another collaborator opens a new one',()=>{
 const original=newDirectorPromptEdition(project(),'A'),base=projectDocument(original),seed=seedDocument(base),left=new Y.Doc(),right=new Y.Doc();
 for(const doc of [left,right])Y.applyUpdate(doc,Y.encodeStateAsUpdate(seed));
 const newer=newDirectorPromptEdition(original,'B'),late=structuredClone(original),id=activeDirectorEditionId(original);late.episodes[0].prompts.push({id:'late-paid',content:'付费回包',promptEditionId:id});late.episodes[0].sceneVisions['1-1']='并发新构想';late.style='2D动漫';late.aspectRatio='9:16';
 editDocument(left,base,projectDocument(newer));editDocument(right,base,projectDocument(late));Y.applyUpdate(left,Y.encodeStateAsUpdate(right));Y.applyUpdate(right,Y.encodeStateAsUpdate(left));
 for(const doc of [left,right]){const value=readDocument(doc);assert.equal(value.style,'真人电影级');assert.equal(value.aspectRatio,'16:9');assert.deepEqual(value.episodes[0].prompts,[]);assert.deepEqual(value.episodes[0].sceneVisions,{});const back=switchDirectorPromptEdition({...value,id:'director',masterScript:value.script},id);assert.equal(back.episodes[0].prompts[0].id,'late-paid');assert.equal(back.episodes[0].sceneVisions['1-1'],'并发新构想');}
});
test('late creative append after edition switch archives the paid reply in its source edition',()=>{
 const original=newDirectorPromptEdition(project(),'A'),id=activeDirectorEditionId(original),next=newDirectorPromptEdition(original,'B');
 const result=appendDirectorEpisodePrompts({directorProjects:[next]},next.id,'ep',[{id:'creative-paid',content:'付费创造回包',promptEditionId:id}]).directorProjects[0];assert.deepEqual(result.episodes[0].prompts,[]);assert.equal(switchDirectorPromptEdition(result,id).episodes[0].prompts[0].id,'creative-paid');
});
test('legacy linked director project keeps one version when a supplement uses another model',()=>{
 const f=example134();f.project.director_project_id='linked-director';f.project.episodes[0].prompts[0].profileId='original-model';let current=bindingSnapshot(f.project,f.ledger,[]),saved=saveBindingVersion(null,selectBindingVersion(current,null).snapshot,{});const id=bindingVersionOptions(current,saved)[0].id;
 f.project.episodes[0].prompts.push({id:'later',label:'1-1-2',content:'补漏',profileId:'another-model'});current=bindingSnapshot(f.project,f.ledger,[],current);assert.equal(bindingVersionOptions(current,saved).length,1);assert.equal(bindingVersionOptions(current,saved)[0].id,id);
});

test('first edition migration keeps a concurrent legacy paid reply in the original edition',()=>{
 const original=project(),base=projectDocument(original),seed=seedDocument(base),left=new Y.Doc(),right=new Y.Doc();
 for(const doc of [left,right])Y.applyUpdate(doc,Y.encodeStateAsUpdate(seed));
 const newer=newDirectorPromptEdition(original,'首次新版'),late=structuredClone(original);late.episodes[0].prompts.push({id:'late-first',content:'旧客户端回包',promptEditionId:'original:director'});late.episodes[0].sceneVisions['1-1']='迁移并发构想';
 editDocument(left,base,projectDocument(newer));editDocument(right,base,projectDocument(late));Y.applyUpdate(left,Y.encodeStateAsUpdate(right));
 const value=readDocument(left);assert.deepEqual(value.episodes[0].prompts,[]);const back=switchDirectorPromptEdition({...value,id:'director'},'original:director');assert.deepEqual(back.episodes[0].prompts.map(p=>p.id),['paid','late-first']);assert.equal(back.episodes[0].sceneVisions['1-1'],'迁移并发构想');
 const removed=structuredClone(value);removed.episodes[0].promptEditions.find(row=>row.id==='original:director').work.prompts=[];editDocument(left,value,removed);const backAgain=switchDirectorPromptEdition({...readDocument(left),id:'director'},'original:director');assert.deepEqual(backAgain.episodes[0].prompts,[]);assert.equal(backAgain.episodes[0].sceneVisions['1-1'],'迁移并发构想');
});
test('cloud/local director IDs share the original edition when first opening a named version',()=>{
 const f=example134();f.project.id='collab';f.project.director_project_id='cloud-director';let current=bindingSnapshot(f.project,f.ledger,[]),saved=saveBindingVersion(null,selectBindingVersion(current,null).snapshot,{});const oldId=bindingVersionOptions(current,saved)[0].id;
 const director=newDirectorPromptEdition({...f.project,id:'local-director',cloudProjectId:'cloud-director'},'新版本');current=bindingSnapshot({...f.project,episodes:director.episodes},f.ledger,[],current);const options=bindingVersionOptions(current,saved);assert.equal(options.length,2);assert.equal(options[1].id,oldId);
});

test('creative replies on legacy cloud projects use the shared original edition including old local tags',()=>{
 const p={id:'local',cloudProjectId:'cloud',episodes:[{id:'ep',prompts:[]}]},state={directorProjects:[p]};
 const next=appendDirectorEpisodePrompts(state,'local','ep',[{id:'paid-cloud',promptEditionId:'original:cloud'},{id:'paid-local',promptEditionId:'original:local'}]).directorProjects[0];assert.deepEqual(next.episodes[0].prompts.map(p=>p.id),['paid-cloud','paid-local']);
});

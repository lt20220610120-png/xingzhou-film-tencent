import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeQuickScenePlans,mergeCloudEpisodes,reconcileDirectorCloudProjects} from './directorCloudProjects.js';
import {normalizeState,deleteDirectorPromptsEverywhere,deleteDirectorEpisode} from './projectStore.js';

const plan=(id)=>({id,version:1,sceneLabel:'1-1',sourceSnapshot:'1-1：室内\n原文',sourceText:'原文',sceneHeader:'1-1：室内',segments:[{id:id+'seg',index:1,sourceStart:0,sourceEnd:2,estimatedSeconds:9.2,recommendedDurationSeconds:10}]});
const ep=(id='one')=>({id:'e',title:'第1集',content:'1-1：室内\n原文',prompts:[{id:'prompt',label:'1-1-1',recommendedDurationSeconds:10,maxDurationSeconds:30}],quickScenePlans:[plan(id)],activeQuickScenePlanIds:{'1-1':id}});
test('normalization and JSON save/load preserve plans and per-prompt timings',()=>{
 const state=normalizeState(JSON.parse(JSON.stringify({directorProjects:[{id:'p',episodes:[ep()]}]})));
 assert.equal(state.directorProjects[0].episodes[0].quickScenePlans[0].segments[0].recommendedDurationSeconds,10);
 assert.equal(state.directorProjects[0].episodes[0].prompts[0].maxDurationSeconds,30);
});
test('old cloud fields cannot erase local plan; plans merge stable IDs without choosing newest timestamp',()=>{
 const old={id:'e',title:'第1集',content:ep().content,prompts:[]},local=ep();
 const merged=mergeCloudEpisodes([local],[old])[0];assert.deepEqual(merged.quickScenePlans,local.quickScenePlans);assert.deepEqual(merged.activeQuickScenePlanIds,local.activeQuickScenePlanIds);
 const same=mergeQuickScenePlans(local,{...local,quickScenePlans:[structuredClone(plan('one'))]});assert.equal(same.plans.length,1);assert.deepEqual(same.conflicts,[]);
 const both=mergeQuickScenePlans(local,ep('two'));assert.equal(both.plans.length,2);assert.ok(both.conflicts.some(c=>c.type==='active-plan'));assert.equal(both.activePlanIds['1-1'],'one');
});
test('three-way pointer changes merge independent updates and expose simultaneous selection conflict',()=>{
 const base=ep('base'),local={...ep('local'),quickScenePlans:[plan('base'),plan('local')]},cloud={...ep('cloud'),quickScenePlans:[plan('base'),plan('cloud')]};
 assert.equal(mergeQuickScenePlans(base,cloud,base).activePlanIds['1-1'],'cloud');
 const result=mergeQuickScenePlans(local,cloud,base);assert.equal(result.plans.length,3);assert.equal(result.conflicts[0].type,'active-plan');
 const [project]=reconcileDirectorCloudProjects([{id:'p',name:'项目',cloudProjectId:'c',masterScript:'',episodes:[local],cloudBase:{name:'项目',script:'',episodes:[base]}}],[{id:'c',name:'项目',script:'',episodes:[cloud]}]);
 assert.ok(project.cloudConflict);assert.equal(project.episodes[0].quickScenePlans.length,3);assert.ok(project.quickScenePlanConflicts.length);
});
test('plan ID contents are immutable; deletion tombstones defeat remote reappearance',()=>{
 const local=ep(),corrupt={...ep(),quickScenePlans:[{...plan('one'),sourceText:'different'}]};
 assert.equal(mergeQuickScenePlans(local,corrupt).conflicts[0].type,'plan-content');
 const state=deleteDirectorPromptsEverywhere({directorProjects:[{id:'p',episodes:[local],promptHistory:local.prompts}]},'p',['prompt']);
 const p=state.directorProjects[0],merged=mergeCloudEpisodes(p.episodes,[local])[0];assert.equal(merged.prompts.length,0);assert.ok(merged.deletedPromptIds.includes('prompt'));
 const removed=deleteDirectorEpisode(state,'p','e').directorProjects[0];
 const [pulled]=reconcileDirectorCloudProjects([{...removed,cloudProjectId:'c'}],[{id:'c',name:'项目',episodes:[local]}]);
 assert.equal(pulled.episodes[0].prompts.length,0);assert.ok(pulled.episodes[0].deletedPromptIds.includes('prompt'));
});
test('cloud source change invalidates active source plan without disguising stale local run or discarding plan history',()=>{
 const local=ep(),remote={...ep(),content:'1-1：室内\n新原文'};
 const merged=mergeCloudEpisodes([local],[remote])[0];assert.equal(merged.content,remote.content);assert.deepEqual(merged.activeQuickScenePlanIds,{});assert.equal(merged.quickScenePlans.length,1);
 const [project]=reconcileDirectorCloudProjects([{id:'p',name:'项目',cloudProjectId:'c',masterScript:'',episodes:[local],cloudBase:{name:'项目',script:'',episodes:[local]}}],[{id:'c',name:'项目',script:'',episodes:[remote]}]);
 assert.equal(project.episodes[0].content,remote.content);assert.deepEqual(project.episodes[0].activeQuickScenePlanIds,{});
});

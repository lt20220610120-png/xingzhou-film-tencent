import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDirectorEpisodes} from './directorEpisodeReconcile.js';
import {updateDirectorProject,deleteDirectorEpisode} from './projectStore.js';

const old=(id,title,content,label='1-1')=>({id,title,content,kind:'episode',prompts:[{id:'prompt-'+id,label:label+'-1',content:'历史正文'}],quickScenePlans:[{id:'plan-'+id,sceneLabel:label,sourceSnapshot:content}],activeQuickScenePlanIds:{[label]:'plan-'+id},unknownField:'keep'});
const a=()=>old('a','第1集','1-1：室内\n原文甲。');
const b=()=>old('b','第2集','2-1：室外\n原文乙。','2-1');
test('append retains unique episode identity, immutable plans and active pointers',()=>{
 const before=[a(),b()],result=reconcileDirectorEpisodes(before,[...before.map(({title,content,kind})=>({title,content,kind})),{title:'第3集',content:'3-1：新集'}]);
 assert.deepEqual(result.episodes.slice(0,2).map(e=>e.id),['a','b']);assert.equal(result.episodes[0].unknownField,'keep');
 assert.equal(result.episodes[0].activeQuickScenePlanIds['1-1'],'plan-a');assert.deepEqual(result.invalidatedPlanIds,[]);
});
test('insert/reorder never attaches a previous positional plan to a different episode; changed labels invalidate pointers',()=>{
 const before=[a(),b()],result=reconcileDirectorEpisodes(before,[{title:'新增集',content:'0-1：新增'},...before.map(({title,content,kind})=>({title,content,kind}))]);
 assert.notEqual(result.episodes[0].id,'a');assert.equal(result.episodes[0].quickScenePlans,undefined);assert.equal(result.episodes[1].id,'a');
 assert.deepEqual(result.episodes[1].activeQuickScenePlanIds,{});assert.ok(result.invalidatedPlanIds.includes('plan-a'));assert.equal(result.episodes[1].quickScenePlans[0].id,'plan-a');
 const swapped=reconcileDirectorEpisodes(before,[b(),a()]);assert.deepEqual(swapped.episodes.map(e=>e.id),['b','a']);assert.deepEqual(swapped.episodes[0].activeQuickScenePlanIds,{});
});
test('same title with unique different content is matched by content; duplicate identities require explicit conflict',()=>{
 const before=[old('a','同名','1-1：甲'),old('b','同名','2-1：乙','2-1')];
 const swapped=reconcileDirectorEpisodes(before,[{title:'同名',content:'2-1：乙'},{title:'同名',content:'1-1：甲'}]);assert.deepEqual(swapped.episodes.map(e=>e.id),['b','a']);
 const duplicate=reconcileDirectorEpisodes([a(),{...a(),id:'other'}],[{title:'第1集',content:a().content},{title:'第1集',content:a().content}]);
 assert.ok(duplicate.conflicts.length);assert.ok(duplicate.episodes.every(e=>!['a','other'].includes(e.id)));assert.ok(duplicate.episodes.every(e=>!e.quickScenePlans));
});
test('source or shared setting changes invalidate active plans while history remains; removed episode history stays at project',()=>{
 const before=[a(),b()],result=reconcileDirectorEpisodes(before,[{title:'第1集',content:'1-1：室内\n改动正文。'}]);
 assert.equal(result.episodes[0].id,'a');assert.deepEqual(result.episodes[0].activeQuickScenePlanIds,{});assert.equal(result.episodes[0].prompts[0].id,'prompt-a');
 const state={directorProjects:[{id:'p',episodes:before}]};
 const p=updateDirectorProject(state,'p',{episodes:result.episodes}).directorProjects[0];assert.equal(p.promptHistory.length,2);assert.equal(p.quickScenePlanHistory.length,2);
 assert.equal(deleteDirectorEpisode(state,'p','b').directorProjects[0].promptHistory.length,2);
 const setting=reconcileDirectorEpisodes([{id:'setting',kind:'setting',content:'旧设定'},a()],[{kind:'setting',content:'新设定'},a()]);assert.deepEqual(setting.episodes[1].activeQuickScenePlanIds,{});
});

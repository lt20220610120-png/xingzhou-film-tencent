import test from 'node:test';import assert from 'node:assert/strict';
import {resolveProductionProject,productionProjectCandidates} from './productionProject.js';
test('reuse active linked project while ignoring deleted copies and unrelated names',async()=>{
 const source={id:'d',name:'剧',episodes:[]},active={id:'real',name:'剧',director_project_id:'d'},rows=[{...active,id:'trash',deleted_at:'now'},active,{...active,id:'other',director_project_id:'other'}];let created=0;
 const p=await resolveProductionProject({source,api:{collabListProjects:async()=>rows,collabGetProject:async()=>active,collabCreateProject:async()=>{created++;}}});assert.equal(p.id,'real');assert.equal(created,0);
 assert.deepEqual(productionProjectCandidates([{...active,purge_after:'tomorrow'}],source.id),[]);
});
test('no active project creates one once and checkpoints before subsequent read',async()=>{
 const source={id:'d',name:'新剧',masterScript:'剧本',episodes:[]};let calls=0,saved='';const active={id:'new',director_project_id:'d'};
 await resolveProductionProject({source,checkpoint:async id=>{saved=id;},api:{collabListProjects:async()=>[],collabCreateProject:async p=>{calls++;assert.equal(p.script,'剧本');return active;},collabGetProject:async()=>{assert.equal(saved,'new');return active;}}});assert.equal(calls,1);
});
test('multiple live projects choose newest deterministically and explicit linked choice wins',async()=>{
 const source={id:'d',episodes:[]},rows=[{id:'old',director_project_id:'d',updated_at:'2026-01-01'},{id:'new',director_project_id:'d',updated_at:'2026-10-01'}],api={collabListProjects:async()=>rows,collabGetProject:async({projectId})=>rows.find(p=>p.id===projectId)};
 assert.equal((await resolveProductionProject({source,api})).id,'new');assert.equal((await resolveProductionProject({source,api,preferredId:'old'})).id,'old');
});

test('paid tasks never auto-create replacement project for a deleted original',async()=>{
 let created=0;await assert.rejects(resolveProductionProject({source:{id:'d',episodes:[]},preferredId:'gone',hasVideoJobs:true,api:{collabGetProject:async()=>({id:'gone',director_project_id:'d',deleted_at:'now'}),collabCreateProject:async()=>{created++;}}}),/已有视频任务/);assert.equal(created,0);
});

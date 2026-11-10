import test from 'node:test';import assert from 'node:assert/strict';
import {projectVideoRows,filterProjectVideos,groupProjectVideos,selectedProjectVideos,videoResultKey,videoExportId} from './projectVideoPool.js';
test('video pool isolates project, omits reference uploads, joins receipts and sorts numeric labels',()=>{
 const project={id:'p',episodes:[{id:'e',title:'第2集',prompts:[{id:'s',label:'2-1-2'},{id:'t',label:'2-1-10'}]}]};
 const rows=projectVideoRows(project,[{id:'a',projectId:'p',kind:'video',shotId:'t',mediaId:'m',status:'success'},{id:'x',projectId:'other',kind:'video',shotId:'s'}],[{id:'m',kind:'video',note:'[shot:t]'},{id:'ref',kind:'video',note:'参考素材'}]);
 assert.deepEqual(rows.map(r=>r.label),['2-1-2','2-1-10']);assert.equal(rows[0].status,'not-started');assert.equal(filterProjectVideos(rows,{episode:2,scene:'2-1'}).length,2);assert.equal(filterProjectVideos(rows,{episode:1}).length,0);
});
test('pool groups receipts into stable prompt cards, defaults to the newest successful generation and supports all versions',()=>{
 const project={id:'p',episodes:[{id:'e',prompts:[{id:'draft',label:'1-1-9'}],storyboardPrompts:[{id:'s',sourcePromptId:'source',label:'1-1-1'},{id:'t',label:'1-1-2'}]}]};
 const jobs=[['old','2026-11-10T01:00:00Z','success'],['new','2026-11-10T02:00:00Z','success'],['waiting','2026-11-10T03:00:00Z','submitted'],['bad','2026-11-10T04:00:00Z','failed']].map(([id,createdAt,status])=>({id,projectId:'p',kind:'video',shotId:'s',shotLabel:'1-1-1',episode:1,scene:'1-1',status,createdAt,...(id==='new'?{mediaId:'cloud-new'}:{})}));
 const rows=projectVideoRows(project,jobs,[{id:'cloud-new',kind:'video',note:'[shot:s]'}, {id:'foreign',projectId:'other',kind:'video',note:'[shot:s]'}]);
 assert.equal(groupProjectVideos([{...rows[0],episode:'1',scene:undefined},{...rows[0],id:'another',episode:1,scene:'1-1'}]).length,1);
 const groups=groupProjectVideos(rows);assert.equal(groups.length,2);assert.equal(groups[0].results.length,4);assert.equal(groups[1].status,'not-started');assert.equal(groups[0].latest.id,'new');assert.equal(groups[0].results[0].id,'bad');
 assert.deepEqual(selectedProjectVideos(groups).map(r=>r.id),['new']);assert.deepEqual(videoExportId(groups[0].latest),{jobId:'new'});
 const selection=new Map([[groups[0].id,groups[0].successful.map(videoResultKey)]]);assert.deepEqual(selectedProjectVideos(groups,selection).map(r=>r.id),['new','old']);selection.set(groups[0].id,[]);assert.deepEqual(selectedProjectVideos(groups,selection),[]);
 const cloudOnly=groupProjectVideos(projectVideoRows(project,[],[{id:'cloud',kind:'video',note:'[shot:source]',episode:1,scene:'1-1'}]));assert.equal(cloudOnly.length,2);assert.equal(cloudOnly[0].latest.label,'1-1-1');assert.deepEqual(videoExportId(cloudOnly[0].latest),{mediaId:'cloud'});
});

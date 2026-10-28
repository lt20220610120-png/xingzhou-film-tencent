import test from 'node:test';import assert from 'node:assert/strict';
import {projectVideoRows,filterProjectVideos} from './projectVideoPool.js';
test('video pool isolates project, omits reference uploads, joins receipts and sorts numeric labels',()=>{
 const project={id:'p',episodes:[{id:'e',title:'第2集',prompts:[{id:'s',label:'2-1-2'},{id:'t',label:'2-1-10'}]}]};
 const rows=projectVideoRows(project,[{id:'a',projectId:'p',kind:'video',shotId:'t',mediaId:'m',status:'success'},{id:'x',projectId:'other',kind:'video',shotId:'s'}],[{id:'m',kind:'video',note:'[shot:t]'},{id:'ref',kind:'video',note:'参考素材'}]);
 assert.deepEqual(rows.map(r=>r.label),['2-1-2','2-1-10']);assert.equal(rows[0].status,'not-started');assert.equal(filterProjectVideos(rows,{episode:2,scene:'2-1'}).length,2);assert.equal(filterProjectVideos(rows,{episode:1}).length,0);
});

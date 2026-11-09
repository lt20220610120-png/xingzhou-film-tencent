import test from 'node:test';import assert from 'node:assert/strict';
import {directorRunEntries,createDirectorCheckpointReader} from './directorRunView.js';
test('history summary never clones paid replies and selected scene keeps full isolated content',()=>{
 const old={id:'old',phase:'completed',snapshot:{accountId:'a',projectId:'old',episodeId:'e',sceneLabel:'1-1'}};Object.defineProperty(old,'output',{enumerable:true,get(){throw Error('old paid reply was accessed')}});
 const current={id:'current',phase:'paused',snapshot:{accountId:'a',projectId:'p',episodeId:'e',sceneLabel:'1-1'},output:'paid response'};
 const summary=directorRunEntries([old,current],{summary:true});assert.equal(summary.length,2);assert.equal(summary[0].output,undefined);assert(JSON.stringify(summary).length<1000);
 const detail=directorRunEntries([old,current],{projectId:'p',episodeId:'e',sceneLabel:'1-1'});assert.equal(detail[0].output,'paid response');detail[0].snapshot.projectId='edited';assert.equal(current.snapshot.projectId,'p');
});
test('three restorers share one paged scan, surface corrupt records and release the settled cache',async()=>{
 let calls=0,scope='a';const issues=[];
 const list=createDirectorCheckpointReader({getScope:()=>scope,onIssues:rows=>issues.push(...rows),readPage:async({after,limit})=>{calls++;assert.equal(limit,64);return after?{runs:[{id:'second'}],issues:[],nextCursor:null}:{runs:[{id:'first'}],issues:[{runId:'bad',code:'CORRUPT'}],nextCursor:'first'};}});
 const rows=await Promise.all([list(),list(),list()]);assert.equal(calls,2);assert.equal(rows[0],rows[1]);assert.equal(rows[0].length,2);assert.equal(issues.length,1);await list();assert.equal(calls,4);
 let release;const gate=new Promise(r=>release=r),scoped=createDirectorCheckpointReader({getScope:()=>scope,readPage:async()=>{await gate;return {runs:[],nextCursor:null}}});const pending=scoped();scope='b';release();await assert.rejects(pending,/账号或资料位置/);
});

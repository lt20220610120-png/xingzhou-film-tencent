import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveCreatorProject } from './creatorWorkspace.js';
import { createIPProject,importIPNovel,getIPProject,updateIPDraft,confirmIPEpisode,confirmAllIPEpisodes,ipConfirmationSummary,ipSettingsScopeKey } from './ipWorkspace.js';

function fixture(){
 let state=createIPProject({fruitProjects:[],scriptProjects:[],scriptLibrary:[]},{name:'批量确认'});
 const id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{name:'小说.txt',content:'第1章 开篇\n甲相遇。\n第2章 后续\n乙归来。'});
 const p=getIPProject(state,id),sourceId=p.creator.ip.source.id;
 p.creator.ip.plan={sourceId,mainline:'甲乙相遇',ending:'乙归来'};
 p.episodes[0]={...p.episodes[0],sourceId,scriptText:'## 人物小传\n甲：归来。',stale:true};
 p.episodes.push(
  {id:'one',type:'episode',title:'第1集',sourceId,scriptText:'## 第1集 相遇\n### 场景1-1 内景 日\n甲：你好。',stale:true,finalConfirmed:false,ipVersions:[{id:'old',content:'旧稿',sourceId}]},
  {id:'two',type:'episode',title:'第2集',sourceId,scriptText:'## 第2集 归来\n### 场景2-1 外景 夜\n乙：回来了。',stale:true,finalConfirmed:false,ipVersions:[]},
  {id:'empty',type:'episode',title:'第3集',sourceId,scriptText:' \n',stale:true,finalConfirmed:false,ipVersions:[]}
 );
 return {state,id,p};
}

test('batch confirmation confirms settings and every nonempty episode in one update and skips empty bodies',()=>{
 const {state,id,p}=fixture(),before=structuredClone(state),summary=ipConfirmationSummary(p);
 assert.deepEqual(summary,{episodes:2,settings:1,emptyEpisodes:1,emptySettings:0,alreadyConfirmed:0,pending:3});
 const next=confirmAllIPEpisodes(state,id),confirmed=getIPProject(next,id);
 assert.deepEqual(state,before);
 assert.ok(confirmed.episodes.slice(0,3).every(e=>e.finalConfirmed&&!e.stale));
 assert.equal(confirmed.episodes[0].settingsScopeKey,ipSettingsScopeKey(p.creator.ip.source.id,p.creator.ip.plan));
 assert.equal(confirmed.episodes[3].finalConfirmed,false);
 assert.equal(confirmed.episodes[3].stale,true);
 assert.deepEqual(confirmed.episodes[1].ipVersions[0],p.episodes[1].ipVersions[0]);
 assert.ok(confirmed.episodes.slice(0,3).every(e=>e.ipVersions.some(v=>v.content===e.scriptText)));
});

test('confirming the settings together with bodies does not make those newly confirmed bodies stale',()=>{
 let {state,id,p}=fixture();
 state=updateIPDraft(state,id,p.episodes[0].id,'已核对的新设定');
 state=confirmAllIPEpisodes(state,id);
 assert.ok(getIPProject(state,id).episodes.slice(0,3).every(e=>e.finalConfirmed&&!e.stale));
});

test('repeated confirmation does not create duplicate snapshots or modify collected completed versions',()=>{
 let {state,id}=fixture();
 state=archiveCreatorProject(state,id);
 const collected=structuredClone(state.scriptLibrary);
 state=confirmAllIPEpisodes(state,id);
 const first=getIPProject(state,id);
 const next=confirmAllIPEpisodes(state,id),summary=ipConfirmationSummary(getIPProject(next,id));
 assert.deepEqual(getIPProject(next,id).episodes,first.episodes);
 assert.deepEqual(next.scriptLibrary,collected);
 assert.equal(summary.pending,0);
 assert.equal(summary.alreadyConfirmed,3);
});

test('an old-source body rejects the entire batch consistently with single confirmation',()=>{
 const {state,id,p}=fixture();
 p.episodes[2].sourceId='old-source';
 const before=structuredClone(state);
 assert.throws(()=>confirmIPEpisode(state,id,'two'),/旧版小说/);
 assert.throws(()=>confirmAllIPEpisodes(state,id),/第2集.*旧版小说/);
 assert.deepEqual(state,before);
});

test('empty manuscripts and removed projects do not silently report successful confirmation',()=>{
 const {state,id,p}=fixture();
 p.episodes.forEach(e=>{e.scriptText=' \n';});
 assert.throws(()=>confirmAllIPEpisodes(state,id),/没有可确认/);
 assert.throws(()=>confirmAllIPEpisodes(state,'missing'),/项目已移除/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ipWorkStatus } from './ipTaskStatus.js';
import { ipSettingsScopeKey } from './ipWorkspace.js';

const project=(settings='',bodies=['正文'])=>({creator:{ip:{duration:60,source:{id:'source'},plan:{episodes:[]}}},episodes:[{type:'settings',sourceId:'source',scriptText:settings,settingsScopeKey:ipSettingsScopeKey('source',{}),ipVersions:[{content:settings,sourceId:'source',settingsScopeKey:ipSettingsScopeKey('source',{}),generationKey:'settings-cache'}]},...bodies.map(scriptText=>({type:'episode',scriptText}))]});
test('missing settings remain actionable after every episode is written',()=>{
 const status=ipWorkStatus(project());
 assert.equal(status.pending,true);assert.equal(status.missingEpisodes,0);assert.equal(status.missingSettings,true);assert.equal(status.buttonLabel,'补全设定与小传');
});
test('all generated content is explicitly awaiting review rather than silently disabled',()=>{
 const status=ipWorkStatus(project('设定'));
 assert.equal(status.pending,false);assert.equal(status.buttonLabel,'全部已生成');assert.match(status.message,/已生成.*待核对/);
});
test('running and failed tasks show distinct states and retain pending work',()=>{
 const p=project('', ['']);
 assert.equal(ipWorkStatus(p,{running:true,label:'提取设定…'}).buttonLabel,'正在生成…');
 const status=ipWorkStatus(p,{running:false,status:'failed',label:'连接中断'});
 assert.equal(status.tone,'error');assert.match(status.message,/连接中断/);assert.equal(status.pending,true);
});
test('confirmed work and imported finished scripts do not request extra adaptation',()=>{
 const p=project('设定');p.episodes.forEach(e=>e.finalConfirmed=true);
 assert.match(ipWorkStatus(p).message,/已确认/);
 p.creator.ip={completedImport:true};p.episodes[0].scriptText='';
 assert.equal(ipWorkStatus(p).pending,false);
});
test('unconfirmed manual settings and changed source direct users to review before generation',()=>{
 const p=project('人工设定');p.episodes[0].ipVersions=[];
 let status=ipWorkStatus(p);assert.equal(status.needsSettingsReview,true);assert.equal(status.pending,true);assert.equal(status.buttonLabel,'核对设定与小传');assert.match(status.message,/人工设定/);
 p.episodes[0].finalConfirmed=true;p.episodes[0].sourceId='old';status=ipWorkStatus(p);
 assert.equal(status.needsSettingsReview,true);assert.equal(status.tone,'review');assert.match(status.message,/旧版/);
});

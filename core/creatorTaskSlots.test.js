import test from 'node:test';
import assert from 'node:assert/strict';
import {creatorTaskSlot,creatorTasksConflict,creatorTaskActivity} from './creatorTaskSlots.js';
import {createCreatorProject,creatorInputFingerprint} from './creatorWorkspace.js';
import {addRewriteSource,saveRewriteAnalysis,rewriteSources} from './rewriteWorkflow.js';
const analyze=(sourceId,analysisStage)=>({task:'rewriteAnalyze',section:'rewriteAnalysis',sourceId,analysisStage});
test('independent books and analysis stages have independent jobs; bundle overlap is rejected',()=>{
  const a=analyze('a','settings'),b=analyze('a','outline'),c=analyze('b','settings');
  assert.notEqual(creatorTaskSlot('script','p',a,true),creatorTaskSlot('script','p',b,true));
  assert.equal(creatorTasksConflict(a,b),false);assert.equal(creatorTasksConflict(a,c),false);
  assert.equal(creatorTasksConflict(a,a),true);assert.equal(creatorTasksConflict(a,analyze('a')),true);
  assert.equal(creatorTasksConflict(a,{section:'detail',task:'rewritePlan'}),false);
  assert.equal(creatorTasksConflict({episodeId:'a'},{episodeId:'b'}),true);
  assert.equal(creatorTasksConflict({section:'detail'},{episodeId:'a'}),true);
});
test('progress and stop filtering select only the current stage, including every selected book',()=>{
  const targets=[analyze('a','settings'),analyze('b','settings'),analyze('a','outline'),{section:'detail'}];
  const entries=Object.fromEntries(targets.map((target,i)=>[creatorTaskSlot('script','p',target,true),{target,id:i,running:true}]));
  assert.equal(creatorTaskActivity(entries,'script','p',{section:'settings'}).count,2);
  assert.equal(creatorTaskActivity(entries,'script','p',{section:'outline'}).count,1);
  assert.equal(creatorTaskActivity(entries,'script','p',{section:'characters'}).running,false);
  assert.equal(creatorTaskActivity(entries,'script','other').running,false);
  assert.equal(creatorTaskActivity(entries,'script','p').count,4);
});
test('parallel stage completion merges latest book data without changing other stages or drafts',()=>{
  let s=createCreatorProject({scriptProjects:[]},{mode:'rewrite'}),id=s.scriptProjects[0].id;
  s=addRewriteSource(s,id,{content:'第1集\n故事原文',name:'书'});const book=rewriteSources(s.scriptProjects[0])[0];
  const target=analyze(book.id,'outline'),before=creatorInputFingerprint(s.scriptProjects[0],target);
  s=saveRewriteAnalysis(s,id,book.id,{settings:'世界',outline:'不应写入'},'settings');
  assert.equal(creatorInputFingerprint(s.scriptProjects[0],target),before);
  s=saveRewriteAnalysis(s,id,book.id,{outline:'事件链'},'outline');
  const result=rewriteSources(s.scriptProjects[0])[0];assert.equal(result.analysis.settings,'世界');assert.equal(result.analysis.outline,'事件链');assert.equal(result.analysis.characters,undefined);
  assert.equal(s.scriptProjects[0].creator.sections.settings.output,'');
  const edited=structuredClone(s.scriptProjects[0]);edited.creator.source.content='另一个原文';
  assert.notEqual(creatorInputFingerprint(edited,target),before);
  assert.throws(()=>saveRewriteAnalysis(s,id,book.id,{characters:''},'characters'));
});

test('analysis of unselected books does not stale draft or detail candidates',()=>{
 let s=createCreatorProject({scriptProjects:[]},{mode:'rewrite'}),id=s.scriptProjects[0].id;
 s=addRewriteSource(s,id,{content:'源剧本',name:'书1'});s=addRewriteSource(s,id,{content:'另一剧本',name:'书2'});
 const books=rewriteSources(s.scriptProjects[0]),target={section:'detail',task:'rewritePlan'};
 const fp=creatorInputFingerprint(s.scriptProjects[0],target);
 s=saveRewriteAnalysis(s,id,books[0].id,{settings:'新设定'},'settings');s=saveRewriteAnalysis(s,id,books[1].id,{characters:'新人物'},'characters');
 assert.equal(creatorInputFingerprint(s.scriptProjects[0],target),fp);
});

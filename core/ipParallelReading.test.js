import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject,updateIPMeta,ipFingerprint} from './ipWorkspace.js';
import {runIPTask} from './ipAi.js';
const fixture=()=>{let state=createIPProject({fruitProjects:[]},{name:'并发验证',readConcurrency:3});const id=state.fruitProjects[0].id;state=importIPNovel(state,id,{content:Array.from({length:6},(_,i)=>`第${i+1}章 因果\n${'原文事实。'.repeat(5000)}\n`).join('')});return {state,id,project:getIPProject(state,id)};};
test('parallel source reads synthesize ordered facts and balance all request lifecycle IDs',async()=>{
 const {project}=fixture(),source=project.creator.ip.source,active=new Set(),reads=[],requests=[];let peak=0;
 source.chapters.slice(0,1).forEach(c=>project.creator.ip.reading.push({sourceId:source.id,chapterId:c.id,start:c.start,end:c.end,note:'章节事实1'}));
 const result=await runIPTask({project,task:'settings',taskId:'pool',profile:{model:'mock'},onRequestStart:id=>{active.add(id);peak=Math.max(peak,active.size);},onRequestEnd:id=>active.delete(id),onRead:r=>reads.push(r),api:{aiChat:async request=>{
  requests.push(request);if(request.taskId.includes(':read-')){const start=Number(request.taskId.split(':read-')[1].split('-')[0]),index=source.chapters.findIndex(c=>c.start===start);await new Promise(r=>setTimeout(r,index===1?30:2));return `章节事实${index+1}`;}
  const content=request.messages.at(-1).content;let prior=-1;for(let i=1;i<=6;i++){const position=content.indexOf(`章节事实${i}`);assert.ok(position>prior);prior=position;}return '【故事梗概】已有事实\n【人物小传】原著人物';
 }}});
 assert.equal(result.type,'version');assert.equal(peak,3);assert.equal(active.size,0);assert.equal(reads.length,5);assert.equal(requests.filter(r=>r.taskId.includes(':read-')).length,5);assert.ok(reads[0].start>source.chapters[1].start);
});
test('changing concurrency preserves draft fingerprints and website reading stays serial',async()=>{
 const {state,id,project}=fixture(),changed=getIPProject(updateIPMeta(state,id,{readConcurrency:8}),id);
 assert.equal(ipFingerprint(changed,changed.episodes[0].id),ipFingerprint(project,project.episodes[0].id));
 let active=0,peak=0;
 await runIPTask({project:changed,task:'settings',taskId:'web-pool',profile:{model:'auto',provider:'geminiWeb'},api:{aiChat:async request=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return request.taskId.includes(':read-')?'真实原文事实':'【故事梗概】原著\n【人物小传】原著人物';}}});assert.equal(peak,1);
});

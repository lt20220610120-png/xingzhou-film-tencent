import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectorCloudSync} from './directorCloudSync.js';
import {acknowledgeDirectorCloudSave} from './directorCloudProjects.js';

test('background cloud save uses latest project, serializes in-flight edits and never overwrites typing',async()=>{
 let projects=[{id:'local',cloudProjectId:'cloud',name:'项目',masterScript:'B',episodes:[],cloudBase:{name:'项目',script:'A',episodes:[]}}],resolve;
 const calls=[],pending=new Promise(done=>{resolve=done;});
 const sync=createDirectorCloudSync({getContext:()=>({accountId:'a',projects}),updateProject:async args=>{calls.push(args);if(calls.length===1)await pending;return {id:'cloud',...args.updates};},acknowledge:cloud=>{projects=acknowledgeDirectorCloudSave(projects,cloud.cloud,cloud.submitted);},delayMs:0});
 const task=sync.flush('local');for(let i=0;i<100&&!calls.length;i++)await new Promise(r=>setTimeout(r,2));
 projects=[{...projects[0],masterScript:'C'}];sync.enqueue('local');resolve();await task;await sync.flush('local');
 assert.deepEqual(calls.map(c=>c.updates.script),['B','C']);assert.equal(projects[0].masterScript,'C');assert.equal(projects[0].cloudBase.script,'C');sync.dispose();
});

test('locked projects and account changes stop cloud writes and retain local data',async()=>{
 let accountId='a',projects=[{id:'local',cloudProjectId:'cloud',cloudLocked:true,name:'项目',masterScript:'B',episodes:[],cloudBase:{name:'项目',script:'A',episodes:[]}}],calls=0,acks=0,resolve;
 const pending=new Promise(done=>{resolve=done;});
 const sync=createDirectorCloudSync({getContext:()=>({accountId,projects}),updateProject:async()=>{calls++;await pending;return {id:'cloud'};},acknowledge:()=>acks++,delayMs:0});
 await sync.flush('local');assert.equal(calls,0);projects[0].cloudLocked=false;
 const task=sync.flush('local');for(let i=0;i<100&&!calls;i++)await new Promise(r=>setTimeout(r,2));accountId='b';resolve();await task;
 assert.equal(acks,0);assert.equal(projects[0].masterScript,'B');sync.dispose();
});

test('manual upload publishes only its captured snapshot; typing in flight stays local until another upload',async()=>{
 let projects=[{id:'local',cloudProjectId:'cloud',name:'项目',masterScript:'B',episodes:[],cloudBase:{name:'项目',script:'A',episodes:[]}}],resolve;
 const calls=[],pending=new Promise(done=>resolve=done);
 const submission={id:'manual-uuid',document:{name:'项目',script:'B',episodes:[]},base:projects[0].cloudBase};
 const sync=createDirectorCloudSync({manualOnly:true,getContext:()=>({accountId:'a',projects}),updateProject:async args=>{calls.push(args);await pending;return{id:'cloud',...args.updates};},acknowledge:({cloud,submitted})=>{projects=acknowledgeDirectorCloudSave(projects,cloud,submitted);}});
 const uploading=sync.flush('local',submission);projects=[{...projects[0],masterScript:'C'}];resolve();await uploading;
 assert.equal(calls.length,1);assert.equal(calls[0].submissionId,submission.id);assert.equal(calls[0].updates.script,'B');assert.equal(projects[0].masterScript,'C');assert.equal(projects[0].cloudBase.script,'B');sync.dispose();
});

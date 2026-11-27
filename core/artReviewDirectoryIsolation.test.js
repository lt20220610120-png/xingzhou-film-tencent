import test from 'node:test';
import assert from 'node:assert/strict';
import {getArtReviewStore} from './artReviewPersistence.js';
import {resetBindingStorage} from './projectBindingCache.js';

test('a previously loaded review cannot save into the newly selected directory',async()=>{
 const directories={A:{episodes:{},scriptContext:{name:'A'}},B:{episodes:{},scriptContext:{name:'B'}}};
 let directory='A';
 const api={artReviewLoadLocal:async()=>({ledger:structuredClone(directories[directory]),dataScope:directory}),artReviewSaveLocal:async({dataScope,data})=>{
  assert.equal(dataScope,directory);directories[directory]=structuredClone(data);
 }};
 const project={id:'isolated-directory-project',episodes:[]};
 const open=()=>getArtReviewStore({api,projectId:project.id,accountId:'owner'});
 const old=open();await old.load(project);
 directory='B';resetBindingStorage();
 await assert.rejects(old.setVoiceProfile('speaker',()=>({candidate:'from A'})),/资料目录已变化/);
 const current=open();await current.load(project);
 assert.equal(current.snapshot().scriptContext.name,'B');
 await current.setVoiceProfile('speaker',()=>({candidate:'from B'}));
 assert.equal(directories.B.voiceProfiles.speaker.candidate,'from B');
 assert.equal(directories.A.voiceProfiles,undefined);
});

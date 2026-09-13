import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeDirectorCloudSave,reconcileDirectorCloudProjects} from './directorCloudProjects.js';
test('save acknowledgement preserves typing in flight and advances baseline for the next edit',()=>{
 const submitted={name:'项目',script:'B',episodes:[]};
 const local={id:'local',cloudProjectId:'cloud',cloudRole:'producer',name:'项目',masterScript:'C',episodes:[],cloudBase:{...submitted,script:'A'}};
 const [next]=acknowledgeDirectorCloudSave([local],{id:'cloud',...submitted},submitted);
 assert.equal(next.masterScript,'C');assert.equal(next.cloudBase.script,'B');assert.equal(next.cloudConflict,'');assert.equal(next.cloudRole,'producer');
 const [done]=acknowledgeDirectorCloudSave([next],{id:'cloud',...submitted,script:'C'},{...submitted,script:'C'});
 assert.equal(done.cloudBase.script,'C');assert.equal(done.cloudConflict,'');
 const [refresh]=reconcileDirectorCloudProjects([done],[{id:'cloud',...submitted,script:'C'}]);assert.equal(refresh.masterScript,'C');assert.equal(refresh.cloudConflict,'');
});
test('save acknowledgement merges remote independent edits and keeps concurrent local edits',()=>{
 const submitted={name:'旧名',script:'B',episodes:[]};
 const [next]=acknowledgeDirectorCloudSave([{id:'local',cloudProjectId:'cloud',name:'旧名',masterScript:'C',episodes:[]}],{id:'cloud',...submitted,name:'云端新名'},submitted);
 assert.equal(next.name,'云端新名');assert.equal(next.masterScript,'C');assert.equal(next.cloudConflict,'');
});

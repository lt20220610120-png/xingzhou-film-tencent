import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileDirectorCloudProjects} from './directorCloudProjects.js';
const base={name:'项目',script:'原剧本',episodes:[{id:'e',title:'第1集',content:'1-1 原场景',prompts:[]}]};
const local={id:'p',cloudProjectId:'c',name:base.name,masterScript:base.script,episodes:base.episodes,cloudBase:base,cloudSyncError:'文档/script 同时被修改，本地草稿已保留，请核对云端版本'};
test('successful cloud reconciliation clears a resolved historical conflict banner',()=>{
 const [p]=reconcileDirectorCloudProjects([local],[{id:'c',...base}]);assert.equal(p.cloudSyncError,'');assert.equal(p.masterScript,base.script);
});
test('actual simultaneous script changes preserve both documents and conflict notice',()=>{
 const [p]=reconcileDirectorCloudProjects([{...local,masterScript:'我的剧本'}],[{id:'c',...base,script:'协作者的剧本'}]);assert.match(p.cloudConflict,/script/);assert.equal(p.masterScript,'我的剧本');assert.equal(p.cloudRemote.script,'协作者的剧本');assert.ok(p.cloudSyncError);
});

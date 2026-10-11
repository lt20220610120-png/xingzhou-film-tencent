import test from 'node:test';import assert from 'node:assert/strict';
import {addMediaProfile} from './canvasStore.js';import {mediaModelChoices} from './modelChoices.js';import {normalizeCapabilities} from './modelCapabilities.js';
import {profileModels} from './videoCatalog.js';
test('目录能力手动覆盖后，展示和提交用同一份平铺能力',()=>{
 const p={kind:'video',endpoint:'https://service.test',model:'new',capabilities:{durations:[20],maxImages:3},modelCatalog:[{id:'new',kind:'video',capabilities:{durations:[5],maxImages:1}}]};const model=profileModels(p)[0];assert.deepEqual(normalizeCapabilities(model.capabilities||model).durations,[20]);assert.equal(normalizeCapabilities(model.capabilities||model).maxImages,3);
});
test('未内置的新ft型号保存后在生成选项中可见，协议/能力/目录均保留',()=>{
 const id='ft-video-v1-upstream-new';const state=addMediaProfile({}, {kind:'video',name:'自主接入',endpoint:'https://feituokuajing.com/api/open/v1',model:id,apiKey:'fixture',videoProtocol:'feituo',capabilities:{durations:[27],resolutions:['720p'],ratios:['16:9'],maxImages:30},modelCatalog:[{id,kind:'video',name:'上游刚发布',capabilities:{durations:[27],maxImages:30}}]});
 assert.equal(state.mediaProfiles[0].videoProtocol,'feituo');assert.equal(state.mediaProfiles[0].modelCatalog[0].id,id);
 assert.ok(mediaModelChoices(state,'video').some(m=>m.model===id));
});
test('模型能力保留分辨率时长和素材约束，null不伪装成零或无限',()=>{
 const caps=normalizeCapabilities({resolution_durations:{'480p':[5,15],'720p':[5,10]},max_image_refs:30,max_video_refs:3,max_audio_refs:null,min_image_refs:1,audio_requires_image:false,prompt_max_chars:9000});
 assert.deepEqual(caps.durationByResolution,{'480p':[5,15],'720p':[5,10]});assert.equal(caps.maxImages,30);assert.equal(caps.maxAudios,null);assert.equal(caps.audioRequiresImage,false);assert.equal(caps.minImages,1);assert.equal(caps.maxPrompt,9000);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {mediaModelChoices} from './modelChoices.js';
import {videoModelCapabilities} from './productionVideoPolicy.js';

test('备用模型使用自己的分辨率，不被接口当前模型能力覆盖',()=>{
 const state={mediaProfiles:[{id:'fnko',name:'FT',kind:'video',provider:'fnko',endpoint:'https://fanke2026.xyz/api/open/v1',model:'primary-720',capabilities:{durations:[5,10],resolutions:['720p'],ratios:['16:9']},modelCatalog:[
  {id:'primary-720',kind:'video',name:'主模型 720p',capabilities:{durations:[5,10],resolutions:['720p'],ratios:['16:9']}},
  {id:'backup-1080',kind:'video',name:'备用模型 1080p',capabilities:{durations:[5,10],resolutions:['1080p'],durationByResolution:{'1080p':[5,10]},ratios:['16:9']}}
 ]}]};
 const choice=mediaModelChoices(state,'video').find(m=>m.model==='backup-1080');
 assert.ok(choice);
 assert.deepEqual(videoModelCapabilities(choice).resolutions,['1080p']);
 assert.deepEqual(videoModelCapabilities(choice).durationByResolution,{'1080p':[5,10]});
});

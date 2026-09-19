import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCapabilities,discoveredModelKind} from './modelCapabilities.js';
import {addMediaProfile,videoModelCapabilities,imageModelFormats} from './canvasStore.js';
test('each imported model retains independent parameters, including 30 seconds',()=>{
  const s=addMediaProfile({mediaProfiles:[]},{kind:'video',model:'custom',capabilities:{duration:{enum:[5,30]},ratios:['9:16'],resolutions:['1080p']}});
  assert.deepEqual(videoModelCapabilities('custom',s.mediaProfiles[0]).durations,[5,30]);
  assert.deepEqual(videoModelCapabilities('other').durations,[5,6,10]);
  assert.deepEqual(imageModelFormats({capabilities:{imageSizes:['1536x1024']}}).map(x=>x.size),['1536x1024']);
  assert.equal(addMediaProfile(s,{kind:'audio',model:'speech'}).mediaProfiles[1].kind,'audio');
});
test('metadata is preferred, malformed numeric choices are dropped',()=>{
  assert.equal(discoveredModelKind({id:'ambiguous',output_modalities:['video']}),'video');
  assert.deepEqual(normalizeCapabilities({durations:'5,30,NaN,-1'}),{durations:[5,30]});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingDurationEstimate,savedDurationEstimate,validatedDurationEstimate} from './videoDurationMetadata.js';
import {promptTimingMetadata,recommendedPromptDuration} from './promptDisplay.js';
import {storyboardDurationSelection} from './storyboardTiming.js';

test('archives and storyboard submissions retain v2 timing while new v3 estimates use the same validated record shape',()=>{
 const raw={status:'estimated',maxDurationSeconds:30,naturalSeconds:34,recommendedSeconds:30,needsResegment:false,
  capacityStatus:'略偏紧',breakdown:{speechSeconds:23,nonparallelActionSeconds:5.8,pauseBufferSeconds:4.6},reason:'声画并行并留换人气口。'};
 for(const version of ['2.0.0','3.0.0']){
  const estimate={...raw,version};
  const card={content:'旧版原稿',durationEstimate:estimate};
  assert.deepEqual(validatedDurationEstimate(estimate),estimate);
  assert.deepEqual(savedDurationEstimate(card),estimate);
  assert.equal(recommendedPromptDuration(card),30);
  assert.equal(promptTimingMetadata(card).durationEstimate.version,version);
  const result=storyboardDurationSelection({value:{durationMode:'recommended'},timing:card,policy:{supportedDurations:[5,15,30]}});
  assert.equal(result.duration,30);assert.equal(result.issue,'');
  assert.equal(validatedDurationEstimate({...estimate,naturalSeconds:35}),null);
 }
 assert.equal(validatedDurationEstimate({...raw,version:'4.0.0'}),null);
 assert.equal(pendingDurationEstimate(15,'TIMEOUT','估时超时。').version,'3.0.0');
 assert.equal(savedDurationEstimate({durationEstimate:{version:'2.0.0',status:'pending',maxDurationSeconds:15,error:{code:'TIMEOUT',message:'旧版估时超时。'}}}).version,'2.0.0');
});

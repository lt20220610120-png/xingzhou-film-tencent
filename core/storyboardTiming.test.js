import test from 'node:test';
import assert from 'node:assert/strict';
import {alignStoryboardDuration,sameStoryboardTimingText,savedStoryboardTiming,storyboardDurationPolicy,storyboardDurationSelection,storyboardEstimateIssue,storyboardTimingForDraft} from './storyboardTiming.js';
import {rebaseLocalStoryboardDraft} from './storyboardDefaults.js';
import {readFileSync} from 'node:fs';

test('continuous ranges lift a short suggestion and discrete values round up without truncating',()=>{
 const range=storyboardDurationPolicy({durationRange:{min:4,max:25}}, {}, '720p');
 assert.equal(alignStoryboardDuration(3,range,30),4);
 assert.equal(alignStoryboardDuration(11,range,30),11);
 assert.equal(alignStoryboardDuration(26,range,30),null);
 assert.equal(alignStoryboardDuration(17,{supportedDurations:[30,5,15,20]},30),20);
 assert.equal(alignStoryboardDuration(13,{supportedDurations:[5,10,20]},15),null);
});

test('new recommended alignment never uses old 35-second metadata, while historical exact and manual paths remain readable',()=>{
 const timing={recommendedDurationSeconds:35,maxDurationSeconds:0};
 const value={duration:35,durationMode:'recommended'},policy={supportedDurations:[15,30,35]};
 const choose=patch=>storyboardDurationSelection({value:{...value,...patch},timing,policy,fallback:35});
 assert.match(choose({durationAlignment:'ceil'}).issue,/建议时长 35/);
 assert.equal(choose({}).issue,'');
 assert.equal(choose({durationMode:'uniform',durationManuallyAdjusted:true}).issue,'');
 const low=storyboardDurationSelection({value:{...value,durationAlignment:'ceil'},timing:{suggested:14,recommendedDurationSeconds:14,maxDurationSeconds:10},policy:{supportedDurations:[20,30]},fallback:20});
 assert.match(low.issue,/建议时长 14/);
});

test('estimated overload blocks generation even if old duration or top default exists',()=>{
 const estimate={version:'2.0.0',status:'estimated',needsResegment:true,naturalSeconds:36,recommendedSeconds:36,maxDurationSeconds:30,
  capacityStatus:'超载需重分',breakdown:{speechSeconds:30,nonparallelActionSeconds:5,pauseBufferSeconds:1},reason:'需重新划分片段并重新生成提示词。'};
 assert.match(storyboardEstimateIssue({durationEstimate:estimate}),/超载需重分/);
 assert.match(storyboardEstimateIssue({durationEstimate:{...estimate,status:'needs-review'}}),/待复核/);
 assert.match(storyboardEstimateIssue({durationEstimate:{...estimate,status:'pending'}}),/待估时/);
 assert.equal(storyboardEstimateIssue({recommendedDurationSeconds:15,durationStatus:'estimated'}),'');
});

test('manual and fixed choices use exact current model durations independently of estimate warnings',()=>{
 const policy=storyboardDurationPolicy({durations:[10,20,30],durationByResolution:{'1080p':[15,20]}},{},'1080p');
 const timing={durationEstimate:{version:'2.0.0',status:'pending',maxDurationSeconds:15,error:{code:'TIMEOUT',message:'估时超时'}}};
 const select=value=>storyboardDurationSelection({value,timing,policy,fallback:15});
 assert.deepEqual(select({durationMode:'uniform',duration:20}),{duration:20,issue:''});
 assert.deepEqual(select({durationManuallyAdjusted:true,duration:20}),{duration:20,issue:''});
 assert.match(select({durationMode:'recommended',durationManuallyAdjusted:true,duration:20}).issue,/待估时/);
 assert.match(select({duration:20}).issue,/待估时/);
 assert.match(select({durationMode:'uniform',duration:30}).issue,/当前模型/);
 assert.equal(select({durationMode:'uniform',duration:30}).duration,30);
 assert.match(select({durationMode:'uniform',duration:0}).issue,/当前模型/);
 assert.match(select({durationMode:'uniform'}).issue,/当前模型/);
 const range={durationRange:{min:4,max:25}};
 const fixed=duration=>storyboardDurationSelection({value:{durationMode:'uniform',duration},timing,policy:range,fallback:5});
 assert.equal(fixed(20).issue,'');
 for(const seconds of [3,20.5,26])assert.match(fixed(seconds).issue,/当前模型/);
});

test('draft body edits invalidate an estimate but implicit reattachment and unchanged text keep timing',()=>{
 const estimate={version:'2.0.0',status:'estimated',recommendedSeconds:10,maxDurationSeconds:30};
 const shot={content:'他走来。',durationEstimate:estimate};
 assert.equal(storyboardTimingForDraft(shot,{prompt:'他走来。'}).durationEstimate,estimate);
 assert.equal(storyboardTimingForDraft(shot,{prompt:'他走来（参考@image1）。',bindingSourcePrompt:'他走来。',bindingCompiledPrompt:'他走来（参考@image1）。'}).durationEstimate,estimate);
 assert.equal(storyboardTimingForDraft(shot,{prompt:'他走来，随后有一大段对白。'}).durationEstimate.status,'needs-review');
 const compiled='他走来（参考@image1）。',rebound='他走来（参考@image2 @image3）。';
 const current={...shot,content:compiled,generationConfig:{bindingSourcePrompt:shot.content,bindingCompiledPrompt:compiled}};
 const change=prompt=>storyboardTimingForDraft(current,{prompt,bindingSourcePrompt:shot.content,bindingCompiledPrompt:prompt}).durationEstimate;
 assert.equal(change(rebound),estimate);
 assert.equal(change('他走来（参考@image2 @audio1）。').status,'needs-review');
 assert.equal(change('他跑来（参考@image2）。').status,'needs-review');
});

test('portable local-media rebasing retains the previous optimistic estimate base',()=>{
 const draft={base:{content:'正文',generationConfig:{references:[{id:'a',url:'old'}]},durationEstimate:{status:'pending'}},dirty:true};
 const shot={content:'正文',generationConfig:{references:[{id:'a',url:'new'}]},durationEstimate:{status:'estimated'}};
 assert.deepEqual(rebaseLocalStoryboardDraft(draft,shot,{storageMode:'local'}).base,{...draft.base,generationConfig:shot.generationConfig});
});

test('late director re-estimation revives a published shot with removed or renumbered image and adopted audio references',()=>{
 const source='甲 （参考@），推门。甲说：“回来。”';
 const compiled='甲（参考@image1 @image2），推门。甲（参考@audio1）说：“回来。”';
 const content='甲（参考@image1），推门。甲说：“回来。”';
 const estimate={version:'3.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:23,recommendedSeconds:23,
  capacityStatus:'正常',needsResegment:false,breakdown:{speechSeconds:12,nonparallelActionSeconds:10,pauseBufferSeconds:0.8},reason:'对白后接依次动作。'};
 const references=[{id:'b',kind:'image'}],removed=[{id:'a',kind:'image'},{id:'voice',kind:'audio'}];
 const generationConfig={bindingSourcePrompt:source,bindingCompiledPrompt:compiled,references,storyboardRemovedReferences:removed};
 const shot={id:'working',sourcePromptId:'director',sourceContent:source,content,generationConfig,
  durationEstimate:{...estimate,status:'needs-review'},durationStatus:'needs-review'};
 const ep={prompts:[{id:'director',content:source,durationEstimate:estimate,durationEstimatedAt:'2026-11-26T04:00:00.000Z'}]};
 const synced=savedStoryboardTiming(ep,shot);
 assert.equal(synced.durationEstimate.status,'estimated');
 assert.equal(synced.recommendedDurationSeconds,23);
 assert.equal(storyboardEstimateIssue(storyboardTimingForDraft(synced,{...generationConfig,references:[...references,...removed],prompt:compiled})), '');
 assert.match(storyboardEstimateIssue(storyboardTimingForDraft(synced,{...generationConfig,prompt:content.replace('推门','撞门')})),/待复核/);
 assert.match(storyboardEstimateIssue(savedStoryboardTiming(ep,{...shot,content:content.replace('回来','离开')})),/待复核/);
 const older={...estimate,naturalSeconds:22,recommendedSeconds:22,breakdown:{...estimate.breakdown,nonparallelActionSeconds:9}};
 const reestimated={...shot,durationEstimateSource:'storyboard',durationEstimate:older,durationEstimatedAt:'2026-11-26T04:05:00.000Z'};
 assert.equal(savedStoryboardTiming(ep,reestimated).durationEstimate.recommendedSeconds,22);
 const completed={prompts:[{...ep.prompts[0],durationEstimatedAt:'2026-11-26T04:10:00.000Z'}]};
 assert.equal(savedStoryboardTiming(completed,reestimated).durationEstimate.recommendedSeconds,23);
 assert.equal(savedStoryboardTiming(completed,reestimated).durationEstimateSource,'director');
 assert.equal(savedStoryboardTiming(completed,{...reestimated,content:content.replace('回来','离开')}).durationEstimate.recommendedSeconds,22);
 const staleEpisode={prompts:[{...ep.prompts[0],durationEstimatedAt:'2026-11-26T03:50:00.000Z',durationEstimate:{version:'3.0.0',status:'pending',maxDurationSeconds:30,error:{code:'TIMEOUT',message:'等待估时'}}}]};
 const binding={currentSnapshot:{entries:completed.prompts},saved:{snapshot:{entries:[{...ep.prompts[0],durationEstimate:older,durationEstimatedAt:'2026-11-26T04:15:00.000Z'}]}}};
 assert.equal(savedStoryboardTiming(staleEpisode,shot,binding).durationEstimate.recommendedSeconds,23);
});

test('material-only comparison preserves text, email literals and unproven numbered audio annotations',()=>{
 const refs={references:[{id:'image-a',kind:'image',name:'道具A'},{id:'voice',kind:'audio'}]};
 const body='甲推门。甲（参考@audio1）：回来。';
 assert.equal(sameStoryboardTimingText(body,refs,'甲推门。甲：回来。',{references:[]}),true);
 assert.equal(sameStoryboardTimingText(body,{},'甲推门。甲：回来。',{}),false);
 assert.equal(sameStoryboardTimingText('画面显示 support@image1.cn',refs,'画面显示 support.cn',refs),false);
 assert.equal(sameStoryboardTimingText('密码是“@image1”。',refs,'密码是“”。',refs),false);
 assert.equal(sameStoryboardTimingText('甲说：“保留（参考）两字。”',refs,'甲说：“保留两字。”',refs),false);
 assert.equal(sameStoryboardTimingText('甲推门。',{},'甲推门。\n【人工指定参考】\n道具A（参考@image1）',refs),true);
 assert.equal(sameStoryboardTimingText('甲推门。',{},'甲推门。\n【人工指定参考】\n道具A（参考@image1）\n山崩了。',refs),false);
 assert.equal(sameStoryboardTimingText('甲推门。',{references:{}},'甲推门。',{storyboardRemovedReferences:{}}),true);
});

test('renderer and cloud share identical reference and timing selection rules',()=>{
 const withoutExport=text=>text.trim().split(/\r?\n/).slice(0,-1).join('\n');
 assert.equal(withoutExport(readFileSync(new URL('./storyboardTimingSource.js',import.meta.url),'utf8')),
  withoutExport(readFileSync(new URL('../cloud-backend/shared/storyboard-timing.cjs',import.meta.url),'utf8')));
});

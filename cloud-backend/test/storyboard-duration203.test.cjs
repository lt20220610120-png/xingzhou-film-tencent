const test = require('node:test');
const assert = require('node:assert/strict');
const {patchShot, mergeDirectorEpisodes} = require('../src/storyboard-merge.cjs');
const {settingsFor} = require('../src/storyboard-settings.cjs');

const estimate = (naturalSeconds, maxDurationSeconds = 30) => {
  const needsResegment = naturalSeconds > (maxDurationSeconds === 15 ? 18 : 35);
  const capacityStatus = needsResegment ? '超载需重分' : naturalSeconds > maxDurationSeconds ? '略偏紧' : '正常';
  return { version:'2.0.0', status:'estimated', maxDurationSeconds, naturalSeconds,
    recommendedSeconds:needsResegment ? naturalSeconds : Math.min(naturalSeconds,maxDurationSeconds),
    needsResegment, capacityStatus,
    breakdown:{speechSeconds:0,nonparallelActionSeconds:naturalSeconds - 1,pauseBufferSeconds:0.8},
    reason:needsResegment ? '动作依次完成；需重新划分片段并重新生成提示词。' : '动作依次完成，预留收尾气口。' };
};
const pending = {version:'2.0.0', status:'pending', maxDurationSeconds:30,error:{code:'SOURCE_CONFLICT',message:'声音来源不一致'}};
const shot = (id, item, generationConfig={}) => ({id,label:`1-1-${id}`,content:`分镜${id}`,
  durationEstimate:item, generationConfig:{duration:7,...generationConfig}});
const project = (...shots) => [{id:'ep',episodeNumber:1,prompts:shots,storyboardPrompts:shots}];
const apply = (options={}) => ({operation:'settings',scope:'project',revision:'new-settings',durationMode:'recommended',supportedDurations:[5,10,20],
  settings:{profileId:'profile',model:'video',ratio:'16:9',resolution:'720p'},...options});
const edit = (id, updates, base={}) => ({episodeId:'ep',shotId:id,editPolicy:'direct',updates,base});

test('suggested settings round up to the nearest provider duration without truncating or exceeding the 15/30 cap', () => {
  const original = project(shot('1',estimate(3)),shot('2',estimate(17)),shot('3',estimate(25)),shot('4',estimate(13,15)));
  const [episode] = patchShot(original,apply({recommendedDurations:{'1':5,'2':20}}));
  assert.deepEqual(episode.storyboardPrompts.map(item=>item.generationConfig.duration),[5,20,7,7]);
  assert.equal(episode.storyboardPrompts[1].generationConfig.recommendedDurationSeconds,17);
  assert.equal(episode.storyboardPrompts[1].generationConfig.durationAlignment,'ceil');
  const report = episode.storyboardDefaultSettings.global.recommendedDurationReport;
  assert.deepEqual(report.unsupported,['3','4']);
  assert.deepEqual(report.aligned,[{shotId:'1',recommendedSeconds:3,seconds:5},{shotId:'2',recommendedSeconds:17,seconds:20}]);
  assert.throws(()=>patchShot(original,apply({recommendedDurations:{'2':10}})),{status:409});
  assert.throws(()=>patchShot(original,apply({recommendedDurations:{'4':20}})),{status:409});
  const [continuous] = patchShot(original,apply({supportedDurations:null,durationRange:{min:4,max:30},recommendedDurations:{'1':4,'2':17}}));
  assert.deepEqual(continuous.storyboardPrompts.slice(0,2).map(item=>item.generationConfig.duration),[4,17]);
  assert.deepEqual(continuous.storyboardDefaultSettings.global.recommendedDurationReport.aligned,[{shotId:'1',recommendedSeconds:3,seconds:4}]);
});

test('pending, dirty and overloaded estimates cannot supply executable durations or fall back to legacy headers', () => {
  const dirty = {...estimate(12),status:'needs-review'};
  const overload = estimate(36);
  const old = [shot('1',pending),shot('2',dirty),shot('3',overload)].map(item=>({...item,content:'建议时长：1 秒',recommendedDurationSeconds:1}));
  const [episode] = patchShot(project(...old),apply());
  const report = episode.storyboardDefaultSettings.global.recommendedDurationReport;
  assert.deepEqual(report.blocked,[{shotId:'1',code:'pending'},{shotId:'2',code:'needs-review'},{shotId:'3',code:'overload'}]);
  assert.deepEqual(report.applied,[]);
  assert.deepEqual(episode.storyboardPrompts.map(item=>item.generationConfig.duration),[7,7,7]);
  assert.throws(()=>patchShot(project(...old),apply({recommendedDurations:{'3':20}})),{status:409});
});

test('recommended defaults preserve manual seconds, including stale saves, until a confirmed reset', () => {
  const original = project(shot('1',estimate(17),{duration:12,durationMode:'uniform',durationManuallyAdjusted:true}));
  const [protectedEpisode] = patchShot(original,apply());
  const saved = protectedEpisode.storyboardPrompts[0];
  assert.equal(saved.generationConfig.duration,12);
  assert.equal(saved.generationConfig.durationMode,'uniform');
  assert.equal(saved.generationConfig.durationManuallyAdjusted,true);
  assert.equal(saved.generationConfig.storyboardDefaultsRevision,'new-settings');
  assert.deepEqual(protectedEpisode.storyboardDefaultSettings.global.recommendedDurationReport.manual,['1']);
  assert.equal(settingsFor(protectedEpisode,saved.label,saved.id).settings.duration,undefined);
  const [stale] = patchShot([protectedEpisode],edit('1',{generationConfig:{duration:5,storyboardDefaultsRevision:'old'}}));
  assert.equal(stale.storyboardPrompts[0].generationConfig.duration,12);
  assert.equal(stale.storyboardPrompts[0].generationConfig.durationManuallyAdjusted,true);
  const [reset] = patchShot([protectedEpisode],apply({revision:'confirmed',includeManualDuration:true,recommendedDurations:{'1':20}}));
  assert.equal(reset.storyboardPrompts[0].generationConfig.duration,20);
  assert.equal(reset.storyboardPrompts[0].generationConfig.durationManuallyAdjusted,undefined);
  assert.deepEqual(reset.storyboardDefaultSettings.global.durationManualResetShotIds,['1']);
});

test('editing marks only altered working text stale and re-estimation proves both body and prior timing', () => {
  const original = project(shot('1',estimate(11)));
  const [unchanged] = patchShot(original,edit('1',{content:'分镜1'}));
  assert.equal(unchanged.storyboardPrompts[0].durationEstimate.status,'estimated');
  const [rewritten] = patchShot(original,edit('1',{content:'手工改稿'}));
  assert.equal(rewritten.storyboardPrompts[0].durationEstimate.status,'needs-review');
  const patchedBody = {content:'手工改稿',durationEstimate:rewritten.storyboardPrompts[0].durationEstimate};
  assert.throws(()=>patchShot([rewritten],edit('1',{durationEstimate:estimate(15)},{content:'分镜1',durationEstimate:estimate(11)})),{status:409});
  assert.throws(()=>patchShot([rewritten],edit('1',{durationEstimate:{...estimate(16),recommendedSeconds:21}},patchedBody)),{status:400});
  const [refreshed] = patchShot([rewritten],edit('1',{durationEstimate:estimate(15)},patchedBody));
  assert.equal(refreshed.storyboardPrompts[0].content,'手工改稿');
  assert.equal(refreshed.storyboardPrompts[0].recommendedDurationSeconds,15);
  assert.equal(refreshed.prompts[0].durationEstimate.recommendedSeconds,11);
  const [synced] = mergeDirectorEpisodes([refreshed],project(shot('1',estimate(13))));
  assert.equal(synced.storyboardPrompts[0].durationEstimate.recommendedSeconds,15);
  assert.equal(synced.storyboardPrompts[0].durationEstimate.status,'estimated');
});

test('saved estimates survive only compiler-proven image alias changes', () => {
  const content='甲（参考@）推门。乙说：“进来。”';
  const compiled='甲（参考@image1）推门。乙说：“进来。”';
  const original=project({...shot('1',estimate(11)),content});
  const save=(input,body,provenance={})=>patchShot(input,edit('1',{content:body,generationConfig:provenance}));
  const provenance=(body,source=content)=>({bindingSourcePrompt:source,bindingCompiledPrompt:body});
  const first=save(original,compiled,provenance(compiled));
  assert.equal(first[0].storyboardPrompts[0].durationEstimate.status,'estimated');
  const rebound=compiled.replace('@image1','@image2 @image3');
  const refreshed=save(first,rebound,provenance(rebound));
  assert.equal(refreshed[0].storyboardPrompts[0].durationEstimate.status,'estimated');
  assert.equal(save(refreshed,content,provenance(rebound))[0].storyboardPrompts[0].durationEstimate.status,'estimated');
  assert.equal(save(original,compiled)[0].storyboardPrompts[0].durationEstimate.status,'needs-review');
  for(const body of [compiled.replace('推门','进门'),compiled.replace('进来','请进'),compiled.replace('@image1','@image1 @audio1'),compiled+' abc@image7.com']){
    const next=save(original,body,provenance(body));
    assert.equal(next[0].storyboardPrompts[0].durationEstimate.status,'needs-review');
    assert.equal(next[0].storyboardPrompts[0].recommendedDurationSeconds,undefined);
  }
  const voiceBody=compiled.replace('乙说','乙（参考@audio1）说');
  assert.equal(save(original,voiceBody,provenance(voiceBody))[0].storyboardPrompts[0].durationEstimate.status,'needs-review');
  assert.equal(save(first,rebound,provenance(rebound,compiled))[0].storyboardPrompts[0].durationEstimate.status,'needs-review');
});

test('new recommended alignment caps legacy durations without changing stored values or old exact apply', () => {
  const legacy=(id,seconds,maxDurationSeconds)=>({id,label:`1-1-${id}`,content:`分镜${id}`,recommendedDurationSeconds:seconds,maxDurationSeconds});
  const original=project(legacy('1',29,0),legacy('2',31,35),legacy('3',15,12),legacy('4',16,20),legacy('5',31));
  const [episode]=patchShot(original,apply({supportedDurations:[16,20,30,35],recommendedDurations:{'1':30,'4':16}}));
  assert.deepEqual(episode.storyboardDefaultSettings.global.recommendedDurationReport.unsupported,['2','3','5']);
  assert.deepEqual(episode.storyboardPrompts.map(row=>row.recommendedDurationSeconds),[29,31,15,16,31]);
  assert.throws(()=>patchShot(original,apply({supportedDurations:[30,35],recommendedDurations:{'2':35}})),{status:409});
  const exact=apply({recommendedDurations:{'2':31}});
  delete exact.supportedDurations;
  assert.equal(patchShot(original,exact)[0].storyboardPrompts[1].generationConfig.duration,31);
});

test('director timing can fill a pending published estimate without replacing compiled working text', () => {
  const initial = project({...shot('1',pending),content:'原稿'});
  const [published] = patchShot(initial,{operation:'publish',episodeNumber:1,sceneIds:['1-1'],publicationId:'pub',prompts:[
    {id:'1',label:'1-1-1',content:'原稿',durationEstimate:pending,durationSourceScript:'原始切片',generationConfig:{bindingCompiledPrompt:'原稿 @image1'}}
  ]});
  assert.equal(published.storyboardPrompts[0].durationEstimate.status,'pending');
  assert.equal(published.storyboardPrompts[0].durationSourceScript,'原始切片');
  const [fresh] = mergeDirectorEpisodes([published],project({...shot('1',estimate(14)),content:'原稿'}));
  assert.equal(fresh.storyboardPrompts[0].content,'原稿 @image1');
  assert.equal(fresh.storyboardPrompts[0].durationEstimate.recommendedSeconds,14);
});

test('saved legacy review status cannot be cleared by timing proof tied only to the old director body', () => {
  const working = {id:'1',label:'1-1-1',sourceContent:'旧原稿',content:'已改稿',recommendedDurationSeconds:12,durationStatus:'needs-review',generationConfig:{duration:7}};
  const rows = project(working);
  rows[0].prompts = [];
  const [refreshed] = patchShot(rows,apply({recommendedDurationSources:{'1':{sourcePromptId:'1',sourceContent:'旧原稿',durationEstimate:estimate(12)}}}));
  assert.equal(refreshed.storyboardPrompts[0].durationEstimate.status,'needs-review');
  assert.equal(refreshed.storyboardPrompts[0].generationConfig.duration,7);
  assert.throws(()=>patchShot([refreshed],apply({recommendedDurations:{'1':20}})),{status:409});
});

test('renderer and server agree on v2 metadata including safe fallback for a malformed estimate', async () => {
  const renderer = await import('../../core/promptDisplay.js');
  const cloud = require('../src/prompt-duration.cjs');
  const candidates=[estimate(3),estimate(17,15),estimate(36),pending,{...estimate(7),status:'needs-review'},
    {version:'2.0.0',status:'needs-review',maxDurationSeconds:30},{...estimate(8),recommendedSeconds:100},null];
  for(const durationEstimate of candidates){
    const row={id:'1',content:'建议时长：1秒',durationEstimate,durationSourceScript:'原始切片',recommendedDurationSeconds:1};
    assert.deepEqual(cloud.promptTimingMetadata(row),renderer.promptTimingMetadata(row));
    assert.equal(cloud.recommendedPromptDuration(row),renderer.recommendedPromptDuration(row));
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {patchShot, mergeDirectorEpisodes} = require('../src/storyboard-merge.cjs');
const {settingsFor} = require('../src/storyboard-settings.cjs');

const estimate = (naturalSeconds, maxDurationSeconds = 30, version = '2.0.0') => {
  const needsResegment = naturalSeconds > (maxDurationSeconds === 15 ? 18 : 35);
  const capacityStatus = needsResegment ? '超载需重分' : naturalSeconds > maxDurationSeconds ? '略偏紧' : '正常';
  return { version, status:'estimated', maxDurationSeconds, naturalSeconds,
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

test('recommended settings skip only the named local draft and never apply the saved defaults back onto it', async () => {
  const {applyStoryboardDefaults}=await import('../../core/storyboardDefaults.js');
  const original = project(shot('1',estimate(17),{model:'previous'}),shot('2',estimate(17),{model:'previous'}));
  const [episode] = patchShot(original,apply({excludedShotIds:['1'],recommendedDurations:{'2':20}}));
  const defaults=episode.storyboardDefaultSettings.global;
  assert.deepEqual(defaults.recommendedDurationReport.skipped,['1']);
  assert.deepEqual(episode.storyboardPrompts[0],original[0].storyboardPrompts[0]);
  assert.equal(episode.storyboardPrompts[1].generationConfig.duration,20);
  assert.equal(settingsFor(episode,'1-1-1','1'),undefined);
  const draft={model:'previous',prompt:'还在编辑',duration:12,durationManuallyAdjusted:true};
  assert.equal(applyStoryboardDefaults(draft,defaults,'1'),draft);
  assert.throws(()=>patchShot(original,apply({excludedShotIds:['out-of-scope']})),{status:400});
  assert.throws(()=>patchShot(original,apply({excludedShotIds:['1'],recommendedDurations:{'1':20}})),{status:400});
});

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
  const previousConfig={duration:12,durationMode:'uniform',durationManuallyAdjusted:true,recommendedDurationSeconds:17,
    profileId:'old-profile',model:'old-model',ratio:'9:16',resolution:'480p',libtvMode:'custom',libtvParams:{seed:7},libtvSubmissionMode:'canvas',
    references:[{id:'keep'}]};
  const original = project(shot('1',estimate(17),previousConfig));
  const settings={profileId:'profile',model:'video',ratio:'16:9',resolution:'720p',libtvSubmissionMode:'auto'};
  const [protectedEpisode] = patchShot(original,apply({settings}));
  const saved = protectedEpisode.storyboardPrompts[0];
  const expected={...previousConfig,...settings,libtvMode:'auto',libtvParams:{},storyboardDefaultsRevision:'new-settings'};
  assert.deepEqual(saved.generationConfig,expected);
  assert.deepEqual(protectedEpisode.storyboardDefaultSettings.global.recommendedDurationReport.manual,['1']);
  assert.equal(settingsFor(protectedEpisode,saved.label,saved.id).settings.duration,undefined);
  const staleUpdate=edit('1',{generationConfig:{...previousConfig,duration:5,storyboardDefaultsRevision:'old'}},{generationConfig:previousConfig});
  const [stale] = patchShot([protectedEpisode],staleUpdate);
  assert.deepEqual(stale.storyboardPrompts[0].generationConfig,expected);
  assert.throws(()=>patchShot([protectedEpisode],{...staleUpdate,requireExactBase:true}),{status:409});
  const [reset] = patchShot([protectedEpisode],apply({revision:'confirmed',includeManualDuration:true,recommendedDurations:{'1':20}}));
  assert.equal(reset.storyboardPrompts[0].generationConfig.duration,20);
  assert.equal(reset.storyboardPrompts[0].generationConfig.durationMode,'recommended');
  assert.equal(reset.storyboardPrompts[0].generationConfig.durationManuallyAdjusted,undefined);
  assert.deepEqual(reset.storyboardDefaultSettings.global.durationManualResetShotIds,['1']);
});

test('protected manual settings rebase dirty renderer drafts but preserve legacy revisions and concurrent edits', async () => {
  const {applyStoryboardDefaults,rebaseStoryboardDefaultsDraft}=await import('../../core/storyboardDefaults.js');
  const before=shot('1',pending,{duration:20,durationMode:'uniform',durationManuallyAdjusted:true,model:'old',libtvSubmissionMode:'canvas'});
  const draft={base:{content:before.content,generationConfig:before.generationConfig},value:{...before.generationConfig,prompt:'未保存改稿'},dirty:true};
  const [episode]=patchShot(project(before),apply());
  const saved=episode.storyboardPrompts[0];
  const defaults=episode.storyboardDefaultSettings.global;
  assert.equal(applyStoryboardDefaults(draft.value,defaults,'1').model,'video');
  assert.equal(applyStoryboardDefaults(draft.value,defaults,'1').prompt,'未保存改稿');
  assert.deepEqual(rebaseStoryboardDefaultsDraft(draft,saved,defaults).base.generationConfig,saved.generationConfig);
  assert.equal(rebaseStoryboardDefaultsDraft(draft,{...saved,generationConfig:{...saved.generationConfig,ratio:'2:1'}},defaults),draft);
  const legacy={...defaults};
  delete legacy.manualDurationProtection;
  assert.deepEqual(applyStoryboardDefaults(before.generationConfig,legacy,'1'),{...before.generationConfig,storyboardDefaultsRevision:defaults.revision});
  assert.deepEqual(settingsFor({...episode,storyboardDefaultSettings:{global:legacy}},saved.label,saved.id).settings,{});
});

test('explicit reset preserves a protected duration when the new model cannot fit the estimate', () => {
  const original=project(shot('1',estimate(17),{duration:12,durationMode:'uniform',durationManuallyAdjusted:true,model:'old'}));
  const [reset]=patchShot(original,apply({supportedDurations:[5,10],includeManualDuration:true}));
  const settings=reset.storyboardPrompts[0].generationConfig;
  assert.equal(settings.duration,12);
  assert.equal(settings.durationMode,'uniform');
  assert.equal(settings.durationManuallyAdjusted,true);
  assert.equal(settings.model,'video');
  assert.deepEqual(reset.storyboardDefaultSettings.global.recommendedDurationReport.unsupported,['1']);
  assert.equal(reset.storyboardDefaultSettings.global.durationManualResetShotIds,undefined);
});

test('a fixed settings apply records explicit uniform mode without replacing the estimate', () => {
  const original=project(shot('1',pending,{duration:12,durationMode:'recommended',durationAlignment:'ceil'}));
  const payload=apply({durationMode:'uniform'});
  payload.settings.duration=10;
  for(const durationMode of ['uniform',undefined]){
    const [fixed]=patchShot(original,{...payload,durationMode});
    const row=fixed.storyboardPrompts[0];
    assert.equal(row.generationConfig.duration,10);
    assert.equal(row.generationConfig.durationMode,'uniform');
    assert.equal(row.generationConfig.durationAlignment,undefined);
    assert.deepEqual(row.durationEstimate,pending);
  }
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

test('aged material-only storyboard projections receive latest director timing on merge and recommended apply', async () => {
  const content='甲 （参考@），推门。甲说：“回来。”';
  const compiled='甲（参考@image1 @image2），推门。甲（参考@audio1）说：“回来。”';
  const edited='甲（参考@image1），推门。甲说：“回来。”';
  const director={...shot('1',estimate(23,30,'3.0.0')),content,durationEstimatedAt:'2026-11-26T04:00:00.000Z'};
  const generationConfig={duration:7,bindingSourcePrompt:content,bindingCompiledPrompt:compiled,references:[{id:'b',kind:'image'}],storyboardRemovedReferences:[{id:'a',kind:'image'},{id:'v',kind:'audio'}]};
  const stale={...shot('working',{...estimate(11),status:'needs-review'},generationConfig),sourcePromptId:'1',sourceContent:content,content:edited,durationStatus:'needs-review'};
  const source=project(director);
  const fresh=mergeDirectorEpisodes([{...source[0],storyboardPrompts:[stale]}],source);
  assert.equal(fresh[0].storyboardPrompts[0].content,edited);
  assert.deepEqual(fresh[0].storyboardPrompts[0].durationEstimate,director.durationEstimate);
  const [configured]=patchShot([{...source[0],storyboardPrompts:[stale]}],apply({supportedDurations:[4,24,30],recommendedDurations:{working:24},recommendedDurationSources:{working:{sourcePromptId:'1',sourceContent:content,durationEstimate:director.durationEstimate}}}));
  assert.equal(configured.storyboardPrompts[0].generationConfig.duration,24);
  const modified={...stale,content:edited.replace('回来','离开')};
  const [refreshed]=mergeDirectorEpisodes([{...source[0],storyboardPrompts:[modified]}],source);
  assert.equal(refreshed.storyboardPrompts[0].content,modified.content);
  assert.equal(refreshed.storyboardPrompts[0].durationEstimate.status,'needs-review');
  const {savedStoryboardTiming}=await import('../../core/storyboardTiming.js');
  assert.deepEqual(savedStoryboardTiming(source[0],stale).durationEstimate,fresh[0].storyboardPrompts[0].durationEstimate);
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

test('mixed timing versions keep historical values and use current settings, with an exact proof when re-estimating', () => {
  const original=project(shot('1',estimate(17,30)),shot('2',estimate(34,30,'3.0.0')));
  const [configured]=patchShot(original,apply({supportedDurations:[5,20,30],recommendedDurations:{'1':20,'2':30}}));
  assert.deepEqual(configured.storyboardPrompts.map(row=>[row.durationEstimate.version,row.generationConfig.duration]),[
    ['2.0.0',20],['3.0.0',30],
  ]);
  const first=configured.storyboardPrompts[0], refreshed=estimate(13,30,'3.0.0');
  const proof={content:first.content,durationEstimate:first.durationEstimate};
  for(const tampered of [{...refreshed,version:'3.1.0'},{...refreshed,recommendedSeconds:3},
    {...refreshed,breakdown:{...refreshed.breakdown,pauseBufferSeconds:0.49}},
    {...refreshed,breakdown:{...refreshed.breakdown,pauseBufferSeconds:0.501}}]){
    assert.throws(()=>patchShot([configured],edit('1',{durationEstimate:tampered},proof)),{status:400});
  }
  const [next]=patchShot([configured],edit('1',{durationEstimate:refreshed},proof));
  assert.deepEqual(next.storyboardPrompts[0].durationEstimate,refreshed);
  assert.deepEqual(next.prompts[0].durationEstimate,original[0].prompts[0].durationEstimate);
  assert.throws(()=>patchShot([next],edit('1',{durationEstimate:estimate(11)},proof)),{status:409});
});

test('renderer and server agree on mixed timing versions including safe fallback for a malformed estimate', async () => {
  const renderer = await import('../../core/promptDisplay.js');
  const cloud = require('../src/prompt-duration.cjs');
  const candidates=[estimate(3),estimate(17,15),estimate(36),pending,{...estimate(7),status:'needs-review'},
    estimate(13,15,'3.0.0'),estimate(35,30,'3.0.0'),estimate(39,30,'3.0.0'),{...pending,version:'3.0.0'},
    {...estimate(13,15,'3.0.0'),status:'needs-review'},
    {version:'2.0.0',status:'needs-review',maxDurationSeconds:30},{...estimate(8),recommendedSeconds:100},null];
  for(const durationEstimate of candidates){
    const row={id:'1',content:'建议时长：1秒',durationEstimate,durationSourceScript:'原始切片',recommendedDurationSeconds:1};
    assert.deepEqual(cloud.promptTimingMetadata(row),renderer.promptTimingMetadata(row));
    assert.equal(cloud.recommendedPromptDuration(row),renderer.recommendedPromptDuration(row));
  }
});

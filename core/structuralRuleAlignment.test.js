import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {collabEpisodeNumber, episodeNumbersInText} from './collabEpisodes.js';
import {parseDirectorScenes, parseDirectorScenesReadonly} from './scriptImport.js';
import {splitScreenplayScenes} from './screenplayScenes.js';
import {splitIPScenes} from './ipScenes.js';
import {buildSceneSourceTape} from './directorSegmentation.js';
import {parseArtAnalysis, buildAssetRows} from './collabStore.js';
import {planArtImageBatch, requiresWardrobeBaselineImage} from './artImageBatch.js';
import {alignStoryboardDuration, storyboardDurationPolicy, storyboardEstimateIssue, storyboardTimingForDraft} from './storyboardTiming.js';
import {normalizeCapabilities} from './modelCapabilities.js';
import {pendingDurationEstimate} from './videoDurationMetadata.js';
import {directorDurationTargets, applyDirectorDurationResult, directorDurationPending} from './directorDurationWorkflow.js';
import {editArtReview, newArtReview, reviewRoster, applyArtReviewCandidate} from './artReview.js';
import {matchBasicReferences} from './automaticReferences.js';
import {cleanStoryboardReferenceValue} from './storyboardReferences.js';

const require = createRequire(import.meta.url);
const {episodeNumber} = require('../cloud-backend/src/collab-episodes.cjs');
const {sourceScenes} = require('../cloud-backend/src/art-review-repository.cjs');
const {parsePublicationOutput} = require('../cloud-backend/src/analysis-publication.cjs');
const {alignedSeconds} = require('../cloud-backend/src/storyboard-settings.cjs');

test('Chinese digit sequences and place-value episode numbers agree across creative and collaboration entry points', () => {
  for (const [written, number] of [['一零一', 101], ['一二', 12], ['二零', 20], ['一百零一', 101], ['二十', 20]]) {
    const episode = {title: '第' + written + '集', content: '正文'};
    assert.equal(collabEpisodeNumber(episode), number, written);
    assert.equal(episodeNumber(episode), number, written);
  }
});

test('scene readers ignore ranges that belong to screenplay prose', () => {
  const text = '3-5秒后，灯暗了。\n2-3 人走过。\n## 1-1 厨房 日 内\n甲：你好。\n3-5 秒后，灯亮了。\n2-3人跑来。\n1-2 街道 夜 外\n甲：再见。';
  for (const result of [
    parseDirectorScenes(text, 1).map(scene => scene.label),
    parseDirectorScenesReadonly(text, 1).map(scene => scene.label),
    splitScreenplayScenes(text).scenes.map(scene => scene.id),
    splitIPScenes(text).map(scene => scene.label),
    sourceScenes(text, 1).map(scene => scene.id)
  ]) assert.deepEqual(result, ['1-1', '1-2']);
  assert.deepEqual(episodeNumbersInText(text), [1]);
  const narrative = '3-5秒后，灯暗了。\n甲：你好。';
  assert.equal(buildSceneSourceTape(narrative).sceneHeader, '');
  assert.equal(buildSceneSourceTape(narrative).sourceText, narrative);
});

test('art parsing and cloud publication resolve typography, creatures, and nonvisual priority identically', () => {
  const output = '### 第一二集\n人物：\n- 【异兽】 物种：石甲兽；材质：鳞甲；尺寸：巨型。\n- 【肤色偏深】 古铜色\n- 【室外提示音】 无实际出镜；界面：方形；材质：玻璃。\n- 【腕表提示】 不输出人物资产；外观：黑色；材质：玻璃。\n场景：\n- 无\n道具：\n- 【提示牌】 没有出镜；外观：灰色；材质：塑料。';
  const local = buildAssetRows(parseArtAnalysis(output)).map(({category,name}) => [category,name]);
  const cloud = parsePublicationOutput(output,12).filter(entry=>entry.generatable!==false).map(({category,name}) => [category,name]);
  assert.deepEqual(local, [['character','【异兽】'], ['prop','【腕表提示】']]);
  assert.deepEqual(cloud,local);
});

test('an image-exempt character baseline does not strand another wardrobe in a batch', () => {
  const baseline = {id:'base',category:'character',name:'【阿禾】',first_episode:1,noReferenceImage:true};
  const wardrobe = {id:'wardrobe',category:'character',name:'【阿禾-雨衣】',first_episode:2};
  assert.deepEqual(planArtImageBatch([baseline,wardrobe]).map(job=>[job.asset.id,job.dependency]), [['wardrobe',null]]);
  assert.equal(requiresWardrobeBaselineImage(wardrobe,[baseline,wardrobe]),false);
  assert.equal(requiresWardrobeBaselineImage(wardrobe,[{...baseline,noReferenceImage:false},wardrobe]),true);
});

test('text editing preserves the current pending estimate error', () => {
  const durationEstimate = pendingDurationEstimate(15,'MODEL_RESPONSE','服务返回了不完整的估时账本');
  const draft = storyboardTimingForDraft({content:'原文',durationEstimate},{prompt:'修改'});
  assert.equal(draft.durationEstimate.status,'pending');
  assert.match(storyboardEstimateIssue(draft), /服务返回了不完整的估时账本/);
});

test('a model lower bound applies before either end selects an allowed duration', () => {
  const durations=[3,5,8], range={min:5,max:8};
  const model=normalizeCapabilities({durations,durationRange:range});
  const policy=storyboardDurationPolicy(model,{},'720p');
  assert.equal(alignStoryboardDuration(2,policy,15),5);
  assert.equal(alignedSeconds(2,durations,range,15),5);
});

test('duplicate displayed prompt labels still produce independent estimate request identities and results', () => {
  const project={episodes:[{id:'ep',prompts:[
    {id:'first',label:'1-1-1',content:'甲开门'},
    {id:'second',label:'1-1-1',content:'乙关门'},
    {id:'third',label:'1-2-1',content:'灯暗了'}
  ]}]};
  const targets=directorDurationTargets(project,{});
  const [first,second]=targets[0].prompts;
  const id=row=>row.estimateId||row.label;
  assert.notEqual(id(first),id(second));
  assert.equal(targets[1].prompts.length,1);
  const results=new Map([[id(first),directorDurationPending(30,'FIRST','甲')],[id(second),directorDurationPending(30,'SECOND','乙')]]);
  assert.deepEqual(applyDirectorDurationResult(project,targets[0],results).episodes[0].prompts.map(row=>row.durationEstimate?.error.code),['FIRST','SECOND',undefined]);
});

test('scene rename preserves its ID and a late model result cannot resurrect the obsolete spelling', () => {
  const episode={episodeNumber:1,content:'1-1 厨房 日 内\n甲：你好。'};
  const seed=newArtReview(episode);
  const original={category:'prop',name:'【台灯】',description:'木底台灯',ready:true};
  const first=editArtReview(seed,{type:'upsert',sceneId:'1-1',item:original});
  const prior=first.scenes[0].items[0];
  const renamed=editArtReview(first,{type:'upsert',sceneId:'1-1',itemId:prior.id,item:{...original,name:'【木台灯】'}});
  assert.deepEqual(reviewRoster(renamed).map(row=>[row.name,row.id]),[['【木台灯】',prior.id]]);
  const refreshed=applyArtReviewCandidate(renamed,episode,{items:[{...original,id:'prop:old'}],mapping:[{sceneId:'1-1',assets:[original]}],warnings:[],complete:true});
  assert.deepEqual(reviewRoster(refreshed).map(row=>row.name),['【木台灯】']);
  assert.deepEqual(refreshed.scenes[0].items.map(row=>row.name),['【木台灯】']);
  const restored=editArtReview(refreshed,{type:'undo',sceneId:'1-1'});
  assert.deepEqual(reviewRoster(restored).map(row=>[row.name,row.id]),[['【台灯】',prior.id]]);
});

test('asset matching keeps its automatic anchors within the matching field', () => {
  const prompt='【基础设定】\n道具：无\n限制：\n手机\n【镜头】\n手机震动。';
  const refs=[{id:'phone',kind:'image',category:'prop',name:'手机'}];
  const output=matchBasicReferences({prompt,references:[]},refs);
  assert.equal(output.prompt,prompt);
  assert.deepEqual(output.references,[]);
});

test('upgrading old asset references retains prompt aliases and the external image identity', () => {
  const value={prompt:'甲（参考@image1）；乙（参考@image2）',references:[
    {id:'first',kind:'asset-image',projectId:'p',assetId:'a',imageId:'old'},
    {id:'external',kind:'image',projectId:'p',url:'https://fixture.test/file.png'}
  ],autoReferenceOrder:[{alias:'@image1',key:'asset-image:first'},{alias:'@image2',key:'image:external'}]};
  const next=cleanStoryboardReferenceValue(value,'p');
  assert.equal(next.prompt,value.prompt);
  assert.deepEqual(next.references.map(row=>row.id),['first','external']);
  assert.deepEqual(next.autoReferenceOrder.map(row=>row.key),['image:first','image:external']);
  const legacy=cleanStoryboardReferenceValue({references:value.references,prompt:'甲（参考@asset-image1）；乙（参考@image2）'},'p');
  assert.equal(legacy.prompt,value.prompt);
});

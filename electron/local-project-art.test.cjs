const test = require('node:test');
const assert = require('node:assert/strict');
const {sourceScenes, signature} = require('../cloud-backend/src/art-review-repository.cjs');
const {applyLocalArt} = require('./local-project-art.cjs');

const content = '2-1 山洞 日 内\n铜铃响了。\n\n2-2 山路 日 外\n众人离开。';
const previousOutput = '### 第1集\n人物：\n- 无\n场景：\n- 无\n道具：\n- 【铜铃】 第一集';
const legacyOutput = '### 第2集\n人物：\n- 无\n场景：\n- 无\n道具：\n- 【旧道具】 已整理';
const newOutput = '### 第2集\n人物：\n- 无\n场景：\n- 无\n道具：\n- 【铜铃】 青铜做的铃铛';
const manualAsset = {
  id: 'asset-bell', project_id: 'local-project', name: '【铜铃】', category: 'character',
  description: '人工定稿', custom_prompt: '人工提示词', first_episode: 1, episodes: [1],
  image_url: 'local-media://bell', images: [{id: 'original-image', url: 'local-media://bell'}],
};
function fixture() {
  return {
    project: {
      id: 'local-project', owner_id: 'owner', name: '本地项目', updated_at: 'original',
      episodes: [{title: '第2集', episodeNumber: 2, content}],
      analysis_progress: {1: {output: previousOutput}, 2: {output: legacyOutput, fingerprint: 'legacy', note: '保留'}},
      analysis_output: previousOutput + '\n\n' + legacyOutput,
    },
    assets: [structuredClone(manualAsset), {id: 'legacy', name: '【旧道具】', category: 'prop', episodes: [1, 2], images: [{id:'keep'}]}],
    media: [{id: 'unrelated'}],
  };
}
const item = (name, category) => ({id: name, name, category, description: '核实描述', ready: true});
function review() {
  const scenes = sourceScenes(content, 2);
  scenes[0].items = [item('【铜铃】', 'prop'), {...item('【画外音】', 'character'), detailStatus: 'nonvisual'}];
  scenes[1].items = [item('【山路】', 'scene')];
  for (const scene of scenes) scene.approval = {signature: signature(scene), actor: 'owner'};
  return {schema: 1, episodeNumber: 2, sourceContent: content, scenes, unassigned: [], pending: true};
}
function apply(record, action, payload) {
  return applyLocalArt(record, action, {episodeNumber: 2, ...payload}, 'owner');
}

test('local analysis returns the cloud acknowledgement and preserves asset identity, media and other episode output', () => {
  const record = fixture();
  const payload = {sourceContent: content, baseOutput: legacyOutput, output: newOutput, fingerprint: 'new', assets: [item('【铜铃】', 'prop')]};
  const ack = apply(record, 'publishAnalysis', payload);
  assert.deepEqual(ack, {id: record.project.id, updated_at: record.project.updated_at, fingerprint: 'new'});
  assert.deepEqual(record.assets[0], {...manualAsset, category: 'prop', episodes: [1, 2]});
  assert.equal(record.project.analysis_progress[2].note, '保留');
  assert.match(record.project.analysis_output, /第一集/);
  assert.match(record.project.analysis_output, /青铜/);
  assert.doesNotMatch(record.project.analysis_output, /旧道具/);
  assert.deepEqual(record.media, [{id: 'unrelated'}]);
  assert.deepEqual(apply(record, 'publishAnalysis', payload), ack);
  const before = structuredClone(record);
  assert.throws(() => apply(record, 'publishAnalysis', {...payload, fingerprint: 'different'}), error => error.status === 409);
  assert.deepEqual(record, before);
});

test('local review save validates source and revision and returns the same receipt for a repeated write', () => {
  const record = fixture();
  const payload = {data: review(), baseVersion: 0, writeId: 'save-1'};
  const saved = apply(record, 'saveArtReview', payload);
  assert.equal(saved.version, 1);
  assert.equal(saved.lastWriteId, 'save-1');
  assert.equal(saved.updatedBy, 'owner');
  assert.equal(saved.pending, undefined);
  assert.equal(record.assets.length, 2);
  assert.equal(record.project.analysis_progress[2].output, legacyOutput);
  assert.deepEqual(apply(record, 'saveArtReview', payload), saved);
  const before = structuredClone(record);
  assert.throws(() => apply(record, 'saveArtReview', {...payload, writeId: 'stale'}), error => error.status === 409);
  assert.throws(() => apply(record, 'saveArtReview', {...payload, baseVersion: 1, writeId: 'changed', data: {...payload.data, sourceContent: '已修改'}}), /正文已改变/);
  assert.deepEqual(record, before);
});

test('local review publication keeps existing image and prompt data and detaches replaced episode membership', () => {
  const record = fixture();
  const saved = apply(record, 'saveArtReview', {data: review(), baseVersion: 0, writeId: 'save-1'});
  const payload = {baseVersion: saved.version, writeId: 'publish-1', sceneIds: ['2-1', '2-2']};
  const published = apply(record, 'publishArtReview', payload);
  assert.equal(published.version, 2);
  assert.deepEqual(record.assets[0], {...manualAsset, category: 'prop', episodes: [1, 2]});
  assert.deepEqual(record.assets.find(asset => asset.id === 'legacy').episodes, [1]);
  assert.deepEqual(record.assets.find(asset => asset.id === 'legacy').images, [{id:'keep'}]);
  assert.equal(record.assets.find(asset => asset.name === '【山路】').category, 'scene');
  assert.equal(record.assets.some(asset => asset.name === '【画外音】'), false);
  assert.equal(published.published['2-1'].items[1].detailStatus, 'nonvisual');
  assert.equal(published.classificationCorrections[0].assetId, manualAsset.id);
  assert.equal(record.project.analysis_progress[2].fingerprint, 'art-review-2');
  assert.match(record.project.analysis_output, /第一集/);
  assert.match(record.project.analysis_output, /道具：\n- 【铜铃】/);
  assert.deepEqual(apply(record, 'publishArtReview', payload), published);
  assert.equal(record.assets.length, 3);
});

test('an unverified local scene cannot publish any asset from the same request', () => {
  const record = fixture(), data = review();
  delete data.scenes[1].approval;
  const saved = apply(record, 'saveArtReview', {data, baseVersion: 0, writeId: 'save-1'});
  const before = structuredClone(record);
  assert.throws(() => apply(record, 'publishArtReview', {baseVersion: saved.version, writeId: 'publish-1', sceneIds: ['2-1', '2-2']}), /尚未核实/);
  assert.deepEqual(record, before);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {appendArtEpisodeSnapshot, episodeNumber} = require('../src/collab-episodes.cjs');
const {parsePublicationOutput, validatePublicationAssets} = require('../src/analysis-publication.cjs');
const output = (heading = '第20集', person = '- 无') => `### ${heading}\n人物：\n${person}\n场景：\n- 无\n道具：\n- 无`;
const {patchShot} = require('../src/storyboard-merge.cjs');
const {handleAction} = require('../src/collab.cjs');
const writes = ['assets-replace','asset-create','asset-update','asset-image-record','asset-image-delete','asset-images-clear','task-assign','task-update','task-delete','message-send','project-update','project-delete','project-link-director','art-episode-append','analysis-publish','storyboard-patch','member-add','member-remove','member-role'];
function guardRepo(row, lock) {
  const mutations = [];
  const base = {getProject:async()=>row, isProjectLocked:lock, findMembership:async()=>({role:'producer'}), listMembers:async()=>[]};
  return {mutations, repo:new Proxy(base, {get:(obj,key) => obj[key] || (async () => {mutations.push(key); return row || {ok:true};})})};
}

test('all ordinary collaboration writes fail closed when lock lookup errors or returns an unknown state', async () => {
  for (const action of writes) for (const lock of [async()=>{throw new Error('db unavailable');}, async()=>null]) {
    const {repo, mutations} = guardRepo({id:'copy', owner_id:'owner', genre:'[COLLAB_PROJECT]'}, lock);
    const result = await handleAction(action, {projectId:'copy', assetId:'asset'}, {id:'owner'}, repo);
    assert.equal(result.status, 503, action);
    assert.deepEqual(mutations, [], action);
  }
});

test('deleted and legacy recycled projects reject ordinary writes but retain the explicit restore exception', async () => {
  for (const extra of [{deleted_at:'2026-01-01'}, {genre:'[COLLAB_PROJECT]\n[RECYCLE_UNTIL:2099-01-01]'}]) {
    for (const action of [...writes, 'project-lock']) {
      const {repo, mutations} = guardRepo({id:'copy', owner_id:'owner', genre:'[COLLAB_PROJECT]', ...extra}, async()=>false);
      assert.equal((await handleAction(action, {projectId:'copy', assetId:'asset'}, {id:'owner'}, repo)).status, 410, action);
      assert.deepEqual(mutations, [], action);
    }
    const {repo, mutations} = guardRepo({id:'copy', owner_id:'owner', ...extra}, async()=>{throw new Error('not needed for restore');});
    assert.equal((await handleAction('project-restore', {projectId:'copy'}, {id:'owner'}, repo)).status, 200);
    assert.deepEqual(mutations, ['restoreProject']);
  }
  const {repo, mutations} = guardRepo({id:'copy', owner_id:'owner', genre:'[COLLAB_PROJECT]\n[PROJECT_LOCKED]'}, async()=>true);
  assert.equal((await handleAction('project-lock', {projectId:'copy', locked:false}, {id:'owner'}, repo)).status, 200);
  assert.deepEqual(mutations, ['setProjectLocked']);
});

test('shot creation checks explicit episode and existing scene ownership without ordinal fallback', () => {
  const e19 = {id:'e19', title:'第19集', content:'19-1 家 日 内', prompts:[]};
  const request = {episodeId:'e19', operation:'create', shotId:'new', scene:'20-1'};
  for (const scene of ['20-1', '1-1', '19-2']) assert.throws(() => patchShot([e19], {...request, scene}), e => e.status === 400);
  assert.equal(patchShot([e19], {...request, scene:'19-1'})[0].prompts[0].label, '19-1-1');
  const empty = {id:'e19', episodeNumber:19, title:'续写', prompts:[]};
  assert.throws(() => patchShot([empty], request), e => e.status === 400);
  assert.equal(patchShot([empty], {...request, scene:'19-1'})[0].prompts[0].label, '19-1-1');
  assert.throws(() => patchShot([{...e19, content:'20-1 家 日 内'}], request), e => e.status === 400);
  assert.deepEqual(e19.prompts, []);
});
const classificationCases = [
  ['【电话音】', '仅声音出场，无实体形象。外观：矩形；界面：蓝色', null],
  ['【系统VO】', '仅声音出场，未实际出镜，无实体形象。脸型：方脸；服装：西装', null],
  ['【机器人】', '实体出镜，拟人化角色；外观：金属机身；屏幕：蓝色；服装：西装', 'character'],
  ['【韩川-手机状态】', '脸型：方脸；发型：黑色短发；屏幕：亮起；界面：蓝色', 'character'],
  ['【韩川手机】', '外观：矩形；界面：蓝色；材质：金属', 'prop'],
];

test('nonvisual character exclusion runs before prop migration and negated visibility is not positive', () => {
  for (const [name, description, category] of classificationCases) {
    const parsed = parsePublicationOutput(output('第20集', `- ${name}${description}`), 20);
    assert.deepEqual(parsed.filter(e => e.generatable !== false).map(e => e.category), category ? [category] : [], name);
    if (!category) {
      for (const forged of ['character', 'prop']) assert.throws(() => validatePublicationAssets([{name, category:forged}], parsed, 20), e => e.status === 400);
    } else assert.equal(validatePublicationAssets([{name, category}], parsed, 20).length, 1);
  }
});

test('real renderer and backend agree on voice exclusions including prop rows and negative actual visibility', async () => {
  const {parseArtAnalysis, buildAssetRows} = await import('../../core/collabStore.js');
  const cases = [...classificationCases,
    ['【系统面板】', '明确不输出人物资产；半透明矩形科技界面，蓝色发光边框。', 'prop'],
    ['【幻听机器人】', '仅声音出场，无实体形象；拟人化角色，服装：西装。', null],
    ['【未出镜者】', '未实际出镜；脸型：方脸；服装：西装。', null],
    ['【画外来电】', '仅声音出场，无实体形象。外观：矩形；界面：蓝色', null, 'prop'],
  ];
  for (const [name, description, category, inputCategory] of cases) {
    let raw = output('第20集', `- ${name}${description}`);
    if (inputCategory === 'prop') raw = output().replace('道具：\n- 无', `道具：\n- ${name}${description}`);
    const front = buildAssetRows(parseArtAnalysis(raw));
    const parsed = parsePublicationOutput(raw, 20);
    const back = parsed.filter(e => e.generatable !== false);
    assert.deepEqual(front.map(e => [e.name,e.category]), category ? [[name,category]] : [], name+' renderer');
    assert.deepEqual(back.map(e => [e.name,e.category]), front.map(e => [e.name,e.category]), name+' backend');
    assert.equal(validatePublicationAssets(front, parsed, 20).length, front.length);
  }
});

test('compact combined episode headings cannot enter append or publication', () => {
  for (const heading of ['第20集兼21集', '第20集/21集', '第二十集兼二十一集', '第20集／21集']) {
    for (const fields of [{title:heading, content:'20-1 家 日 内'}, {title:'第20集', content:`${heading}\n20-1 家 日 内`}]) {
      assert.equal(episodeNumber({episodeNumber:20, ...fields}), 0, heading);
      assert.throws(() => appendArtEpisodeSnapshot({episodes:[]}, {episodeNumber:20, ...fields}), e => e.status === 400);
    }
    assert.throws(() => parsePublicationOutput(output(heading), 20), e => e.status === 400, heading);
  }
  const content = '20-1 家 日 内\n韩川：第20集兼21集的故事，还没讲完。';
  assert.equal(appendArtEpisodeSnapshot({episodes:[]}, {episodeNumber:20, content}).episodes[0].number, 20);
  assert.equal(episodeNumber({title:'未编号', content:'韩川：第20集/21集都看过。'}), 0);
});
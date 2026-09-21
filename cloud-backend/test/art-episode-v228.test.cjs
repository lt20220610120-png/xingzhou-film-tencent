const test = require('node:test');
const assert = require('node:assert/strict');
const {handleAction} = require('../src/collab.cjs');
test('append accepts 第五十回合 narration while preserving real chapter headings',()=>{
 const {appendArtEpisodeSnapshot,unitHeaders}=require('../src/collab-episodes.cjs');
 const content='第二十一集\n21-1 废土荒界·枯寂裂谷上空 日 外\n第五十回合，寂手大能一袖卷起千丈龙卷。\n第一百回合，两人在云层之上连续对撞。\n第一百八十回合，寂手大能引动地脉。\n第二百四十回合，两人的身影同时消失。\n第三百回合，姜蓝与寂手大能在高空擦身而过。\n21-10 废土荒界·黑岩乱石滩 日 外';
 assert.equal(unitHeaders(content).length,1);
 const row={script:'原剧本',episodes:[{title:'第20集',content:'20-1 外景 山林 日'}]};
 const result=appendArtEpisodeSnapshot(row,{episodeNumber:21,title:'第21集',content});
 assert.equal(result.episodes.at(-1).content,content);
 assert.equal(unitHeaders('第五十回 风雪夜')[0].number,50);
});

test('append keeps time ranges intact without mistaking them for episode numbers',()=>{
 const {appendArtEpisodeSnapshot}=require('../src/collab-episodes.cjs');
 const content='21-1 外景 神木 日\n50-100秒：花海\n100-180 秒 镜头向上\n180-240s 树冠\n240-300 秒：人物\n300-360秒 结束\n50-100人走过\n100-180米之外';
 const row={script:'原剧本',episodes:[{title:'第20集',content:'20-1 外景 山林 日'}]};
 const result=appendArtEpisodeSnapshot(row,{episodeNumber:21,title:'第21集',content});
 assert.equal(result.episodes.at(-1).content,content);assert.ok(result.script.endsWith(content));
 assert.throws(()=>appendArtEpisodeSnapshot(row,{episodeNumber:21,title:'第21集',content:content+'\n22-1 外景 山林 夜'}),/不一致/);
});

function repository(role = 'producer', genre = '都市\n[COLLAB_PROJECT]', locked = false) {
  const row = {id: 'collab', owner_id: 'owner', genre, episodes: [{title: '第19集', content: '19-1 家 日 内'}]};
  const calls = [];
  return {
    calls,
    getProject: async () => row,
    findMembership: async () => ({role}),
    listMembers: async () => [{user_id: 'artist', role}],
    isProjectLocked: async () => locked,
    appendArtEpisode: async (pid, payload, uid) => {
      calls.push({pid, payload, uid});
      return {...row, episodes: [...row.episodes, {episodeNumber: payload.episodeNumber, title: payload.title, content: payload.content, collabOnly: true}]};
    },
  };
}

test('art episode append uses the authenticated art role and exact collaboration target', async () => {
  for (const role of ['producer', 'artist', 'artist_collaborator']) {
    const repo = repository(role);
    const payload = {projectId: 'collab', episodeNumber: 20, title: '第20集', content: '20-1 家 清晨 内', userId: 'spoofed'};
    const user = {id: role === 'producer' ? 'owner' : 'artist'};
    const result = await handleAction('art-episode-append', payload, user, repo);
    assert.equal(result.status, 200);
    assert.equal(result.body.episodes.at(-1).collabOnly, true);
    assert.equal(repo.calls.length, 1);
    assert.equal(repo.calls[0].pid, 'collab');
    assert.equal(repo.calls[0].uid, user.id);
  }
});

test('append rejects storyboard-only members, locked projects and director documents without writes', async () => {
  for (const [repo, user, status] of [
    [repository('collaborator'), {id: 'artist'}, 403],
    [repository('artist', '都市\n[COLLAB_PROJECT]', true), {id: 'artist'}, 423],
    [repository('producer', '都市\n[DIRECTOR_PROJECT]'), {id: 'owner'}, 403],
  ]) {
    const result = await handleAction('art-episode-append', {projectId: 'collab', episodeNumber: 20, content: '20-1 家 日 内'}, user, repo);
    assert.equal(result.status, status);
    assert.equal(repo.calls.length, 0);
  }
});

test('append preserves prior project work and creates an independently owned episode', () => {
  const {appendArtEpisodeSnapshot} = require('../src/collab-episodes.cjs');
  const original = {id: 'collab', script: '原有十九集', episodes: [{id: 'e19', title: '第19集', content: '19-1 家 日 内', prompts: [{id: 'shot', content: '导演提示词'}]}], analysis_progress: {19: {output: '已有清单'}}};
  const snapshot = structuredClone(original);
  const next = appendArtEpisodeSnapshot(original, {episodeNumber: 20, title: '第20集', content: '20-1 家 清晨 内'});
  assert.deepEqual(original, snapshot);
  assert.deepEqual(next.episodes[0], original.episodes[0]);
  assert.deepEqual(next.analysis_progress, original.analysis_progress);
  assert.equal(next.episodes[1].episodeNumber, 20);
  assert.equal(next.episodes[1].collabOnly, true);
  assert.equal(next.episodes[1].origin, 'collab-art');
  assert.match(next.script, /^原有十九集\n\n第20集\n20-1 家 清晨 内$/);
  assert.deepEqual(appendArtEpisodeSnapshot(next, {episodeNumber: 20, title: '第20集', content: '20-1 家 清晨 内'}), next);
  assert.throws(() => appendArtEpisodeSnapshot(next, {episodeNumber: 20, title: '第20集', content: '另一版本'}), error => error.status === 409);
});

function transactionPool(row, assets = []) {
  const queries = [];
  let saved = structuredClone(row);
  const client = {
    query: async (sql, values) => {
      queries.push({sql, values});
      if (/^select \* from collab_assets/.test(sql)) return {rows: structuredClone(assets)};
      if (/^select p\.\* from collab_projects/.test(sql) || /^select \* from collab_projects/.test(sql)) return {rows: [structuredClone(saved)]};
      if (/^update collab_projects set script=/.test(sql)) saved = {...saved, script: values[1], episodes: JSON.parse(values[2])};
      return {rows: [structuredClone(saved)]};
    },
    release: () => queries.push({sql: 'RELEASE'}),
  };
  return {connect: async () => client, queries, saved: () => saved};
}

test('transactional append locks and writes only the collaboration row with art membership authorization', async () => {
  const {analysisRepository} = require('../src/analysis-repository.cjs');
  const pool = transactionPool({id: 'collab', owner_id: 'owner', genre: '[COLLAB_PROJECT]', script: '十九集', episodes: [{title: '第19集', content: '19-1 家 日 内'}]});
  const saved = await analysisRepository(pool).appendArtEpisode('collab', {episodeNumber: 20, title: '第20集', content: '20-1 家 清晨 内'}, 'artist');
  assert.equal(saved.episodes.length, 2);
  const lock = pool.queries.find(query => /for update/.test(query.sql));
  assert.deepEqual(lock.values, ['collab']);
  const auth = pool.queries.find(query => /select 1 as ok from collab_members/.test(query.sql));
  assert.match(auth.sql, /artist_collaborator/);
  assert.deepEqual(auth.values, ['collab', 'artist']);
  assert.ok(pool.queries.indexOf(auth) > pool.queries.indexOf(lock));
  const writes = pool.queries.filter(query => /^update /.test(query.sql));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values[0], 'collab');
  assert.doesNotMatch(writes[0].sql, /genre|analysis_progress|delete/);
  assert.equal(pool.queries.at(-2).sql, 'COMMIT');
});

test('director refresh and explicit sync preserve destination-owned episode content and master text', () => {
  const {mergeDirectorEpisodes} = require('../src/storyboard-merge.cjs');
  const {appendArtEpisodeSnapshot, composeDirectorScript} = require('../src/collab-episodes.cjs');
  const source = {script: '设定\n\n第19集\n19-1 家 日 内', episodes: [{id: 'e19', title: '第19集', content: '19-1 家 日 内'}]};
  const local = appendArtEpisodeSnapshot(source, {episodeNumber: 20, title: '第20集', content: '20-1 家 清晨 内'});
  const merged = mergeDirectorEpisodes(local.episodes, source.episodes);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].content, '20-1 家 清晨 内');
  assert.match(composeDirectorScript(source.script, local.episodes, source.episodes), /第20集\n20-1 家 清晨 内$/);
  const future = [...source.episodes, {id: 'director-e20', title: '第20集', content: '20-1 家 夜 内'}];
  const collision = mergeDirectorEpisodes(local.episodes, future);
  assert.equal(collision.length, 2);
  assert.equal(collision[1].id, local.episodes[1].id);
  assert.equal(collision[1].content, local.episodes[1].content);
  assert.equal(collision[1].collabOnly, true);
  const master = composeDirectorScript(`${source.script}\n\n第20集\n20-1 家 夜 内`, local.episodes, future);
  assert.doesNotMatch(master, /20-1 家 夜 内/);
  assert.equal((master.match(/第20集/g) || []).length, 1);
  assert.equal(source.episodes.length, 1);
});

test('publishing a missing-number incremental episode finds its stable number and preserves first appearances', async () => {
  const {analysisRepository} = require('../src/analysis-repository.cjs');
  const pool = transactionPool({id: 'collab', owner_id: 'owner', genre: '[COLLAB_PROJECT]', episodes: [{kind: 'setting', title: '设定和小传'}, {title: '第19集', content: '19-1 家 日 内'}, {episodeNumber: 20, title: '续写', content: '20-1 家 清晨 内', collabOnly: true}], analysis_progress: {19: {output: '历史清单'}}, analysis_output: '### 第19集\n人物：\n- 【韩川-日常服】原有形象'}, [{id:'existing',project_id:'collab',name:'【韩川-日常服】',category:'character',first_episode:19,episodes:[19],image_url:'keep.png'}]);
  const output = '### 第20集\n人物：\n- 【韩川-日常服】（复用自第19集）\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）';
  await analysisRepository(pool).publishAnalysis('collab', {episodeNumber: 20, sourceContent: '20-1 家 清晨 内', fingerprint: 'v5', output, baseOutput: '', assets: [{name: '【韩川-日常服】', category: 'character', description: '', first_episode: 19, episodes: [20]}]}, 'artist');
  const insert = pool.queries.find(query => /^insert into collab_assets/.test(query.sql));
  assert.equal(insert.values[4], 19);
  assert.deepEqual(insert.values[5], [20]);
  const lock = pool.queries.find(query => /for update/.test(query.sql));
  const auth = pool.queries.find(query => /select 1 as ok from collab_members/.test(query.sql));
  assert.ok(pool.queries.indexOf(auth) > pool.queries.indexOf(lock));
  assert.match(auth.sql, /artist_collaborator/);
});

test('publishing refuses another episode output before writing any assets', async () => {
  const {analysisRepository} = require('../src/analysis-repository.cjs');
  const pool = transactionPool({id: 'collab', owner_id: 'owner', genre: '[COLLAB_PROJECT]', episodes: [{episodeNumber: 20, title: '第20集', content: '20-1 家 日 内'}]});
  await assert.rejects(analysisRepository(pool).publishAnalysis('collab', {episodeNumber: 20, sourceContent: '20-1 家 日 内', fingerprint: 'v5', output: '### 第19集\n人物：\n- 【意外角色】', assets: [{name: '【意外角色】', category: 'character'}]}, 'owner'), error => error.status === 400);
  assert.equal(pool.queries.filter(query => /^insert into collab_assets/.test(query.sql)).length, 0);
  assert.equal(pool.queries.at(-2).sql, 'ROLLBACK');
});

test('a later director refresh does not place the local twentieth episode behind episode twenty-one', () => {
  const {mergeDirectorEpisodes} = require('../src/storyboard-merge.cjs');
  const {composeDirectorScript} = require('../src/collab-episodes.cjs');
  const local = [{id: 'e19', title: '第19集', content: '19-1 家 日 内'}, {id: 'local20', episodeNumber: 20, title: '第20集', content: '20-1 家 清晨 内', collabOnly: true}];
  const incoming = [local[0], {id: 'e21', title: '第21集', content: '21-1 公司 日 内'}];
  const merged = mergeDirectorEpisodes(local, incoming);
  assert.deepEqual(merged.map(episode => episode.title), ['第19集', '第20集', '第21集']);
  const master = composeDirectorScript('第19集\n19-1 家 日 内\n\n第21集\n21-1 公司 日 内', local, incoming);
  assert.ok(master.indexOf('第20集') < master.indexOf('第21集'));
});

test('a corrected prop classification preserves the same asset ID and media rather than replacing rows', async () => {
  const {analysisRepository} = require('../src/analysis-repository.cjs');
  const pool = transactionPool({id: 'collab', owner_id: 'owner', genre: '[COLLAB_PROJECT]', episodes: [{episodeNumber: 20, content: '20-1 家 日 内'}]});
  await analysisRepository(pool).publishAnalysis('collab', {episodeNumber: 20, sourceContent: '20-1 家 日 内', fingerprint: 'v5', output: '### 第20集\n人物：\n- 无（本集未出现）\n场景：\n- 无（本集未出现）\n道具：\n- 【韩川手机】黑色智能手机', assets: [{name: '【韩川手机】', category: 'prop', description: '黑色智能手机'}]}, 'owner');
  const insert = pool.queries.find(query => /^insert into collab_assets/.test(query.sql));
  assert.match(insert.sql, /category=case when collab_assets\.category='character' and excluded\.category='prop' then 'prop'/);
  assert.doesNotMatch(insert.sql, /delete|image_url=|\bid=/i);
});

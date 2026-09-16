const test = require('node:test');
const assert = require('node:assert/strict');
const {extendRepository} = require('../src/repository-extras.cjs');
const {handleAction} = require('../src/collab.cjs');
const {analysisRepository} = require('../src/analysis-repository.cjs');

// No database/network: exercise real repositories with a SQL-aware boundary.
function fixturePool(projects, members = [], initialAssets = []) {
  let rows = structuredClone(projects), assets = structuredClone(initialAssets), baseline;
  const queries = [];
  const readable = (row, uid) => row.owner_id === uid || members.some(m => m.project_id === row.id && m.user_id === uid);
  const query = async (sql, values = []) => {
    queries.push({sql, values: structuredClone(values)});
    if (sql === 'BEGIN') baseline = structuredClone({rows, assets});
    if (sql === 'ROLLBACK' && baseline) ({rows, assets} = structuredClone(baseline));
    if (/^select .*from collab_projects/i.test(sql)) {
      let result;
      if (/id::text=\$1 or .*analysis_output=\$1/.test(sql)) {
        result = rows.filter(row => (row.id === values[0] || row.analysis_output === values[0]) && /\[DIRECTOR.PROJECT\]/.test(row.genre) && !row.deleted_at);
      } else result = rows.filter(row => row.id === values[0]);
      if (/owner_id=\$2/.test(sql)) result = result.filter(row => readable(row, values[1]));
      if (/where id=\$1 and owner_id=\$2/.test(sql)) result = result.filter(row => row.owner_id === values[1]);
      return {rows: structuredClone(result)};
    }
    if (/^select .*from collab_assets/i.test(sql)) return {rows: structuredClone(assets.filter(asset => asset.project_id === values[0]))};
    if (/^update collab_projects set/.test(sql)) {
      const set = sql.split(' set ')[1].split(/,?\s*updated_at=| where /)[0];
      const pidIndex = Number(sql.match(/where id=\$(\d+)/)?.[1] || 1) - 1;
      const row = rows.find(row => row.id === values[pidIndex]);
      if (!row) return {rows: []};
      for (const match of set.matchAll(/(\w+)=\$(\d+)/g)) {
        const value = values[Number(match[2]) - 1];
        row[match[1]] = ['episodes', 'analysis_progress'].includes(match[1]) ? JSON.parse(value) : value;
      }
      return {rows: [structuredClone(row)]};
    }
    if (/^insert into collab_projects/.test(sql)) {
      const [name, owner_id, owner_name, style, genre, script, episodes, director_project_id] = values;
      const row = {id: 'created', name, owner_id, owner_name, style, genre, script, episodes: JSON.parse(episodes), director_project_id};
      rows.push(row); return {rows: [structuredClone(row)]};
    }
    if (/^insert into collab_assets/.test(sql)) {
      const [project_id, category, name, description, first_episode, episodes] = values;
      const old = assets.find(asset => asset.project_id === project_id && asset.name === name);
      if (old) {
        if (old.category !== category && !(old.category === 'character' && category === 'prop')) return {rows: [], rowCount: 0};
        if (old.category === 'character' && category === 'prop') old.category = category;
        old.episodes = [...new Set([...old.episodes, ...episodes])].sort((a,b) => a-b);
        if (/first_episode\s*=\s*least/i.test(sql)) old.first_episode = Math.min(old.first_episode, first_episode);
        return {rows: [{id: old.id, category: old.category}], rowCount: 1};
      }
      const created={id: 'generated-' + assets.length, project_id, category, name, description, first_episode, episodes, image_url: ''};
      assets.push(created);
      return {rows: [{id: created.id, category: created.category}], rowCount: 1};
    }
    return {rows: []};
  };
  return {query, connect: async () => ({query, release() {}}), queries, projects: () => structuredClone(rows), assets: () => structuredClone(assets)};
}
const collab = (extra = {}) => ({id: 'copy', owner_id: 'alice', genre: '都市\n[COLLAB_PROJECT]', script: '原稿', episodes: [{id: 'e19', title: '第19集', content: '19-1 家 日 内'}], ...extra});
function actionRepo(row, role = 'producer') {
  const writes = [];
  return {writes, getProject: async () => row, findMembership: async () => ({role}), isProjectLocked: async () => false,
    listMembers: async () => [], updateProjectFields: async (...args) => {writes.push(args); return row;}, syncDirectorSnapshot: async (...args) => {writes.push(args); return row;}};
}
test('domain isolation: generic updates cannot strip director type or bypass director merge; unscoped writes require producer', async () => {
  for (const scope of ['', 'director-sync', 'storyboard']) {
    const repo = actionRepo(director({owner_id: 'alice'}));
    const result = await handleAction('project-update', {projectId: 'source', scope, updates: {genre: '都市', script: '覆盖', episodes: []}}, {id: 'alice'}, repo);
    assert.equal(result.status, 403);
    assert.equal(repo.writes.length, 0);
  }
  for (const role of ['artist', 'collaborator', 'artist_collaborator']) {
    const repo = actionRepo(collab(), role);
    const result = await handleAction('project-update', {projectId: 'copy', updates: {genre: '都市', script: '覆盖', episodes: []}}, {id: 'member'}, repo);
    assert.equal(result.status, 403);
    assert.equal(repo.writes.length, 0);
  }
});
test('domain isolation: genre edits preserve server markers and cannot inject type, link, lock or recycle state', async () => {
  const original = collab({genre: '都市\n[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]'});
  const pool = fixturePool([original]);
  const saved = await extendRepository(pool).updateProjectFields('copy', {genre: '喜剧\n[DIRECTOR_PROJECT]\n[PROJECT_LOCKED]\n[RECYCLE_UNTIL:2099-01-01]\n[COLLAB_SOURCE:evil]'}, 'alice');
  assert.equal(saved.genre, '喜剧\n[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]');
  assert.equal(saved.script, original.script);
  const blocked = fixturePool([collab({genre: '[COLLAB_PROJECT]\n[PROJECT_LOCKED]\n[RECYCLE_UNTIL:2099-01-01]'})]);
  await assert.rejects(extendRepository(blocked).updateProjectFields('copy', {genre: '喜剧'}, 'alice'), e => e.status === 423 || e.status === 410);
  assert.equal(blocked.queries.some(q => /^update /.test(q.sql)), false);
});

const director = (extra = {}) => ({id: 'source', owner_id: 'bob', genre: '[DIRECTOR_PROJECT]', analysis_output: 'local-source', script: '外人的秘密剧本', episodes: [{id: 'e19', title: '第19集', content: '19-1 外人家 日 内'}], ...extra});


test('domain isolation: creation sanitizes genre and validates a requested source before any insert', async () => {
  const {createRepository} = require('../src/postgres-repository.cjs');
  const pool = fixturePool([director()]);
  const repo = createRepository('', {pool});
  await assert.rejects(repo.createProject({ownerId: 'alice', genre: '[DIRECTOR_PROJECT]', directorProjectId: 'source'}), e => e.status === 403);
  assert.equal(pool.queries.some(q => /^insert /.test(q.sql)), false);
  const created = await repo.createProject({ownerId: 'alice', genre: '喜剧\n[DIRECTOR_PROJECT]\n[PROJECT_LOCKED]\n[COLLAB_SOURCE:evil]\n[RECYCLE_UNTIL:2099-01-01]'});
  assert.equal(created.genre, '喜剧\n[COLLAB_PROJECT]');
  const allowed = fixturePool([director({owner_id: 'alice'})]);
  const linked = await createRepository('', {pool: allowed}).createProject({ownerId: 'alice', directorProjectId: 'local-source'});
  assert.equal(linked.genre, '[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]');
  assert.equal(linked.director_project_id, 'local-source');
});


test('domain isolation: locked transactions reject director targets and promote ordinary untyped legacy collab rows', async () => {
  for (const operation of ['appendArtEpisode', 'publishAnalysis', 'syncDirectorSnapshot']) {
    const row = director({owner_id: 'alice', genre: '[DIRECTOR_PROJECT]\n[COLLAB_PROJECT]'});
    const pool = fixturePool([row]);
    assert.equal(await extendRepository(pool)[operation]('source', {episodeNumber: 20, content: '20-1 家 日 内', script: '覆盖', episodes: []}, 'alice'), null);
    assert.deepEqual(pool.projects(), [row]);
    assert.equal(pool.queries.some(q => /^update |^insert /.test(q.sql)), false);
  }
  const row = collab({genre: '都市\n[COLLAB_SOURCE:local-source]'});
  const pool = fixturePool([row, director({owner_id:'alice'})]);
  const saved = await extendRepository(pool).appendArtEpisode('copy', {episodeNumber: 20, content: '20-1 家 日 内'}, 'alice');
  assert.equal(saved.genre, '都市\n[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]');
  assert.equal(saved.episodes.length, 2);
  const missingAuth = fixturePool([collab()]);
  assert.equal(await extendRepository(missingAuth).syncDirectorSnapshot('copy', {script: '覆盖', episodes: []}), null);
  const repo = actionRepo(collab());
  assert.equal((await handleAction('project-update', {projectId:'copy',scope:'director-sync',updates:{script:'最新',episodes:[]},userId:'spoof'}, {id:'alice'}, repo)).status, 200);
  assert.equal(repo.writes[0][2], 'alice');
});


test('numbering: no ordinal guessing; all explicit evidence must agree and all source numbers must be unique', () => {
  const {episodeNumber, numberedEpisodes, appendArtEpisodeSnapshot} = require('../src/collab-episodes.cjs');
  assert.equal(episodeNumber({title: '续写', content: '自由格式'}, 7), 0);
  assert.throws(() => numberedEpisodes([{title:'续写',content:'自由格式'}]), e => e.status === 400);
  for (const ep of [
    {episodeNumber:20,title:'第十九集',content:'20-1 家 日 内'},
    {number:20,episode_number:21,title:'第20集'},
    {number:20,title:'EP XIX',content:'20-1 家 日 内'},
    {number:20,title:'第20集',content:'Episode XIX\n20-1 家 日 内'},
    {title:'第20集兼第21集',content:'20-1 家 日 内'},
    {title:'Episode 20',content:'EP 21\n21-1 家 日 内'},
    {title:'第20集',content:'第20集\n20-1 家 日 内\n第21集\n21-1 家 日 内'},
  ]) assert.equal(episodeNumber(ep), 0);
  assert.throws(() => numberedEpisodes([{title:'第20集'},{number:20,title:'Episode 20'}]), e => e.status === 400);
  for (const ep of [{episodeNumber:19},{number:'19'},{episode:19},{episode_number:19},{title:'第十九集'},{title:'Episode 19'},{title:'EP19'},{content:'19-1 家 日 内'}]) assert.equal(episodeNumber(ep),19);
  assert.deepEqual(numberedEpisodes([{kind:'setting',title:'第零集'}, {title:'第十九集',content:'19-1 家 日 内'}]).map(x=>x.number),[19]);
  const row = collab();
  for (const [title,content] of [
    ['第20集兼第21集','20-1 家 日 内'],['第20集','EP 20\n20-1 家 日 内\nEpisode 21\n21-1 公司 日 内'],
    ['第20集','第二十集\n20-1 家 日 内\n第二十一集\n21-1 公司 日 内'],
    ['第20集','第一章\n甲\n第二章\n乙'],['第20集','Act 1\n甲\nAct 2\n乙'],
  ]) assert.throws(()=>appendArtEpisodeSnapshot(row,{episodeNumber:20,title,content}), e=>e.status===400);
  const next=appendArtEpisodeSnapshot(row,{episodeNumber:20,title:'EP20',content:'20-1 家 日 内\n韩川：第二天再来。'});
  assert.equal(next.episodes.at(-1).title,'EP20');
  assert.deepEqual(row.episodes[0],{id:'e19',title:'第19集',content:'19-1 家 日 内'});
});


const emptyOutput = n => `### 第${n}集\n人物：\n- 无（本集未出现）\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）`;
const publication = (output, assets=[], n=19) => ({episodeNumber:n,sourceContent:`${n}-1 家 日 内`,output,assets,fingerprint:'v5',baseOutput:''});
test('publication format: other-unit headers in any language or heading form rollback; categories must all belong to the target', async () => {
  for(const output of [
    emptyOutput(19)+'\n###第十九集\n人物：\n- 无（本集未出现）',
    emptyOutput(19)+'\n第20集\n人物：\n- 【入侵】',
    emptyOutput(19)+'\nEpisode 20\n场景：\n- 【入侵】',
    emptyOutput(19)+'\n第一章\n道具：\n- 【入侵】',
    '场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）\n### 第19集\n人物：\n- 无（本集未出现）',
    '### 第19集\n人物：\n- 无（本集未出现）\n场景：\n道具：\n- 无（本集未出现）',
  ]) {
    const row=collab(),pool=fixturePool([row]);
    await assert.rejects(analysisRepository(pool).publishAnalysis('copy',publication(output),'alice'),e=>e.status===400);
    assert.deepEqual(pool.projects(),[row]);
    assert.equal(pool.queries.some(q=>/^insert into collab_assets/.test(q.sql)),false);
    assert.equal(pool.queries.at(-1).sql,'ROLLBACK');
  }
  const pool=fixturePool([collab()]);
  assert.ok(await analysisRepository(pool).publishAnalysis('copy',publication(emptyOutput(19)),'alice'));
});


test('publication assets: whitelist subset only; invalid, duplicate, hidden and wrong-episode items rollback as a whole', async () => {
  const output='### 第19集\n人物：\n- 【韩川-常服】实际出镜；脸型：长脸；服装：白衬衫。\n场景：\n- 【家-日-内】实际场次头\n- 【床边-日-内】动作提及的额外场景\n道具：\n- 【手机】黑色智能手机';
  const valid={name:'【手机】',category:'prop',episodes:[19],first_episode:19};
  for(const bad of [null,{}, {name:'【不存在】',category:'prop'}, {name:'【手机】',category:'invalid'}, {name:'【手机】',category:'character'}, {name:'【手机】',category:'prop',episodes:[19,20]}, {name:'【手机】',category:'prop',episode:20}]) {
    const row=collab(),pool=fixturePool([row]);
    await assert.rejects(analysisRepository(pool).publishAnalysis('copy',publication(output,[valid,bad]),'alice'),e=>e.status===400);
    assert.deepEqual(pool.projects(),[row]);assert.deepEqual(pool.assets(),[]);
    assert.equal(pool.queries.some(q=>/^insert into collab_assets/.test(q.sql)),false);
  }
  const duplicate=fixturePool([collab()]);
  await assert.rejects(analysisRepository(duplicate).publishAnalysis('copy',publication(output,[valid,valid]),'alice'),e=>e.status===400);
  const subset=fixturePool([collab()]);
  await analysisRepository(subset).publishAnalysis('copy',publication(output,[valid]),'alice');
  assert.deepEqual(subset.assets().map(x=>x.name),['【手机】']);
});


test('publication visibility: misclassified phone and visible panel become props; visible humans remain characters and voice-only is excluded', async () => {
  const output='### 第19集\n人物：\n- 【苏橙橙手机】外观：黑色智能手机；材质：玻璃；屏幕：来电。\n- 【系统面板】明确不输出人物资产；半透明矩形科技界面，蓝色发光边框。\n- 【韩川-商务装（手机状态）】实际出镜；脸型与五官：长脸直鼻；发型发色：短发；服装：西装。\n- 【系统VO】仅声音/画外，不生成人物资产，无实体形象。\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）';
  const items=[{name:'【苏橙橙手机】',category:'prop'},{name:'【系统面板】',category:'prop'},{name:'【韩川-商务装（手机状态）】',category:'character'}];
  const pool=fixturePool([collab()]);
  await analysisRepository(pool).publishAnalysis('copy',publication(output,items),'alice');
  assert.deepEqual(pool.assets().map(x=>[x.name,x.category]),items.map(x=>[x.name,x.category]));
  for(const item of [{name:'【系统VO】',category:'character'}, {name:'【韩川-商务装（手机状态）】',category:'prop'}, {name:'【苏橙橙手机】',category:'character'}]) {
    const rejected=fixturePool([collab()]);
    await assert.rejects(analysisRepository(rejected).publishAnalysis('copy',publication(output,[item]),'alice'),e=>e.status===400);
    assert.deepEqual(rejected.assets(),[]);
  }
});


test('script continuity: opaque colliding source cannot be rebuilt from episodes or overwrite the copy; opaque preface survives idempotent append', async () => {
  const {composeDirectorScript}=require('../src/collab-episodes.cjs');
  const current=[{id:'e19',title:'第19集',content:'19-1 家 日 内'},{id:'local20',title:'EP20',number:20,content:'20-1 家 清晨 内',collabOnly:true,prompts:[]}];
  const incoming=[current[0],{id:'source20',title:'第20集',content:'20-1 源 夜 内'}];
  const opaque='  作者手写前言：绝不能删除。\n全剧手工格式，不带分集标题，包含源第二十集原文。';
  assert.throws(()=>composeDirectorScript(opaque,current,incoming),e=>e.status===409);
  assert.throws(()=>composeDirectorScript('前言\n第19集\n手写十九与二十集混排',current,incoming),e=>e.status===409);
  const row=collab({genre:'[COLLAB_PROJECT]\n[COLLAB_SOURCE:source]',script:'协作完整原稿\nEP20\n20-1 家 清晨 内',episodes:current});
  const pool=fixturePool([row,director({owner_id:'alice',script:opaque,episodes:incoming})]);
  await assert.rejects(extendRepository(pool).refreshDirectorPrompts('copy','alice'),e=>e.status===409);
  assert.deepEqual(pool.projects()[0],row);assert.equal(pool.projects()[1].script,opaque);
  const first=composeDirectorScript(opaque,current,[current[0]]);
  assert.ok(first.startsWith(opaque));
  assert.equal(composeDirectorScript(first,current,[current[0]]),first);
  assert.equal((first.match(/EP20/g)||[]).length,1);
});


test('first appearance: arbitrary declarations and unproven reuse cannot backdate assets; proven existing reuse is allowed', async () => {
  const output='### 第19集\n人物：\n- 无（本集未出现）\n场景：\n- 无（本集未出现）\n道具：\n- 【手机】黑色智能手机';
  for(const [text,item,existing] of [
    [output,{name:'【手机】',category:'prop',first_episode:1},[]],
    [output.replace('黑色智能手机','（复用自第1集）'),{name:'【手机】',category:'prop',first_episode:1},[]],
    [output.replace('黑色智能手机','（复用自第1集）'),{name:'【手机】',category:'prop',first_episode:2},[{id:'phone',project_id:'copy',category:'prop',name:'【手机】',first_episode:1,episodes:[1],image_url:'keep.png'}]],
  ]) {
    const pool=fixturePool([collab()],[],existing);
    await assert.rejects(analysisRepository(pool).publishAnalysis('copy',publication(text,[item]),'alice'),e=>e.status===400);
    assert.deepEqual(pool.assets(),existing);
    assert.equal(pool.queries.some(q=>/^insert into collab_assets/.test(q.sql)),false);
  }
  const existing=[{id:'phone',project_id:'copy',category:'character',name:'【手机】',first_episode:1,episodes:[1],image_url:'keep.png'}];
  const pool=fixturePool([collab()],[],existing);
  await analysisRepository(pool).publishAnalysis('copy',publication(output.replace('黑色智能手机','（复用自第1集）'),[{name:'【手机】',category:'prop',first_episode:1}]),'alice');
  assert.equal(pool.assets()[0].id,'phone');assert.equal(pool.assets()[0].image_url,'keep.png');assert.equal(pool.assets()[0].category,'prop');
});


test('first appearance: out-of-order 20 then 19 publication lowers first with LEAST and preserves identity and images', async () => {
  const episodes=[{number:19,content:'19-1 家 日 内'},{number:20,content:'20-1 家 日 内'}];
  const row=collab({episodes}), pool=fixturePool([row],[],[{id:'phone',project_id:'copy',category:'character',name:'【手机】',first_episode:20,episodes:[20],image_url:'keep.png'}]);
  for(const n of [20,19]) {
    const output=emptyOutput(n).replace('道具：\n- 无（本集未出现）','道具：\n- 【手机】黑色智能手机');
    await analysisRepository(pool).publishAnalysis('copy',publication(output,[{name:'【手机】',category:'prop',first_episode:n,episodes:[n]}],n),'alice');
  }
  const [asset]=pool.assets();
  assert.equal(asset.first_episode,19);assert.equal(asset.id,'phone');assert.equal(asset.image_url,'keep.png');assert.equal(asset.category,'prop');assert.deepEqual(asset.episodes,[19,20]);
  const inserts=pool.queries.filter(q=>/^insert into collab_assets/.test(q.sql));
  assert.ok(inserts.every(q=>/first_episode\s*=\s*least\(collab_assets.first_episode,excluded.first_episode\)/i.test(q.sql)));
  assert.ok(inserts.every(q=>/on conflict\(project_id,name\)/.test(q.sql)&&!/delete|image_url=|\bid=/i.test(q.sql)));
});


test('episode provenance: a director numbered collision leaves the entire collab-only copy untouched, including prompts and source identity', () => {
  const {mergeDirectorEpisodes}=require('../src/storyboard-merge.cjs');
  const local={id:'local20',number:20,title:'EP20',content:'20-1 协作 原文',collabOnly:true,origin:'collab-art',source:'local-source',prompts:[{id:'m20',label:'20-1-1',manual:true,content:'本地手工',sourceContent:'手工来源',generationConfig:{references:[{id:'img'}]}}],deletedPromptIds:['deleted'],shotCounters:{'20-1':7}};
  const current=[{id:'e19',title:'第19集',content:'19-1 家 日 内'},local];
  const incoming=[current[0],{id:'director20',title:'第20集',content:'20-1 导演 原文',source:'director-source',prompts:[{id:'s20',label:'20-1-1',content:'导演分镜'}]},{id:'e21',title:'第21集',content:'21-1 公司 日 内'}];
  const snapshot=structuredClone({current,incoming});
  const merged=mergeDirectorEpisodes(current,incoming);
  assert.equal(merged.length,3);assert.deepEqual(merged[1],local);
  assert.deepEqual(merged.map(ep=>ep.title),['第19集','EP20','第21集']);
  assert.deepEqual(mergeDirectorEpisodes(merged,incoming),merged);
  assert.deepEqual({current,incoming},snapshot);
});


test('domain isolation: generic collaboration entry points refuse director documents, while explicit director update keeps three-way authorization', async () => {
  const row=director({owner_id:'alice'}),repo=actionRepo(row),writes=[];
  Object.assign(repo,{patchStoryboard:async()=>{writes.push('patch');return row;},softDeleteProject:async()=>{writes.push('delete');return row;},setProjectLocked:async()=>{writes.push('lock');return row;},linkDirectorProject:async()=>{writes.push('link');return row;},listAssets:async()=>[],listAssetImages:async()=>[],getStatsBundle:async()=>({}),refreshDirectorPrompts:async()=>row});
  for(const action of ['project-get','storyboard-patch','project-delete','project-lock','project-link-director','assets-list','stats-get']) {
    const result=await handleAction(action,{projectId:'source'}, {id:'alice'},repo);
    assert.ok([403,404].includes(result.status),action);
    assert.equal(writes.length,0);
  }
  const pool=fixturePool([row]);
  const base={name:row.name,script:row.script,episodes:row.episodes};
  const result=await handleAction('director-project-update',{projectId:'source',base,updates:{script:'合法三方保存'}},{id:'alice'},extendRepository(pool));
  assert.equal(result.status,200);assert.equal(result.body.script,'合法三方保存');assert.equal(result.body.genre,row.genre);
  const outsider=fixturePool([row]);
  assert.equal(await extendRepository(outsider).updateDirectorProject('source',{base,updates:{script:'外人覆盖'}},'mallory'),null);
});


test('domain isolation: link locks original destination type and director creation cannot take client internal markers', async () => {
  const target=director({id:'target',owner_id:'alice'}),source=director({owner_id:'alice'}),pool=fixturePool([target,source]);
  assert.equal(await extendRepository(pool).linkDirectorProject('target','source','alice'),null);
  assert.deepEqual(pool.projects(),[target,source]);
  const create=fixturePool([]);
  const created=await extendRepository(create).createDirectorProject({genre:'喜剧\n[COLLAB_PROJECT]\n[COLLAB_SOURCE:evil]\n[PROJECT_LOCKED]\n[RECYCLE_UNTIL:2099-01-01]'},'alice','制片');
  assert.equal(created.genre,'喜剧\n[DIRECTOR_PROJECT]');
  const valid=fixturePool([collab(),source]);
  const linked=await extendRepository(valid).linkDirectorProject('copy','local-source','alice');
  assert.equal(linked.genre,'都市\n[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]');
  const lock=valid.queries.find(q=>/for update/.test(q.sql));
  assert.deepEqual(lock.values,['copy','alice']);
});


test('script continuity: project-get returns the explicit refresh conflict instead of throwing an opaque server error', async () => {
  const repo=actionRepo(collab());
  repo.refreshDirectorPrompts=async()=>{throw Object.assign(new Error('原文无法可靠分段，保留双方原稿'),{status:409});};
  const result=await handleAction('project-get',{projectId:'copy'},{id:'alice'},repo);
  assert.equal(result.status,409);assert.match(result.body.error,/保留双方原稿/);assert.equal(repo.writes.length,0);
});


test('publication assets: malformed episode metadata is not accepted by numeric coercion', async () => {
  const output=emptyOutput(19).replace('道具：\n- 无（本集未出现）','道具：\n- 【手机】黑色智能手机');
  for(const extra of [{episodes:[[19]]},{episode:[19]},{first_episode:[19]},{episodeNumber:20},{number:20},{episode_number:20}]) {
    const pool=fixturePool([collab()]);
    await assert.rejects(analysisRepository(pool).publishAnalysis('copy',publication(output,[{name:'【手机】',category:'prop',...extra}]),'alice'),e=>e.status===400);
    assert.deepEqual(pool.assets(),[]);
  }
});


test('publication assets: parser canonical bracket-name whitespace agrees with current clients without accepting unseen names', async () => {
  const output=emptyOutput(19).replace('道具：\n- 无（本集未出现）','道具：\n- 【 手机 】黑色智能手机');
  const pool=fixturePool([collab()]);
  await analysisRepository(pool).publishAnalysis('copy',publication(output,[{name:'【手机】',category:'prop'}]),'alice');
  assert.equal(pool.assets()[0].name,'【手机】');
  const other=fixturePool([collab()]);
  await assert.rejects(analysisRepository(other).publishAnalysis('copy',publication(output,[{name:'【别的手机】',category:'prop'}]),'alice'),e=>e.status===400);
});


test('domain isolation: refresh and storyboard transactions also keep the locked original director type', async () => {
  const target=director({id:'target',owner_id:'alice',genre:'[DIRECTOR_PROJECT]\n[COLLAB_SOURCE:source]',script:'受保护导演原稿'}),source=director({owner_id:'alice'});
  for(const operation of ['refreshDirectorPrompts','patchStoryboard']) {
    const pool=fixturePool([target,source]);
    const result=operation==='refreshDirectorPrompts'?await extendRepository(pool)[operation]('target','alice'):await extendRepository(pool)[operation]('target',{episodeId:'e19',operation:'create',scene:'19-1',shotId:'m'});
    assert.equal(result,null);assert.deepEqual(pool.projects(),[target,source]);assert.equal(pool.queries.some(q=>/^update /.test(q.sql)),false);
  }
});


test('source access: only exact live director types are valid sources, not SQL-LIKE underscore matches or legacy recycled records', async () => {
  for(const genre of ['[COLLAB_PROJECT]\n[DIRECTORXPROJECT]','[DIRECTOR_PROJECT]\n[RECYCLE_UNTIL:2099-01-01]']) {
    const source=director({owner_id:'alice',genre}),pool=fixturePool([collab(),source]);
    assert.equal(await extendRepository(pool).findReadableDirectorSource('source','alice'),null);
    assert.equal(await extendRepository(pool).linkDirectorProject('copy','source','alice'),null);
    assert.equal(pool.queries.some(q=>/^update /.test(q.sql)),false);
  }
});


test('publication compatibility: captured real-model canonical output accepts a scene-filtered legal subset with proven reuse', async () => {
  const output=require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/art-v228-live-output.txt'),'utf8');
  const {parsePublicationOutput}=require('../src/analysis-publication.cjs');
  const parsed=parsePublicationOutput(output,20);
  const selected=parsed.filter(entry=>entry.category!=='scene'||entry.name==='【韩川出租屋-清晨-内】');
  const existing=selected.filter(entry=>entry.reuseOf).map((entry,index)=>({id:`existing-${index}`,project_id:'copy',name:entry.name,category:entry.category,first_episode:entry.reuseOf,episodes:[entry.reuseOf],image_url:`keep-${index}.png`}));
  const pool=fixturePool([collab({episodes:[{number:20,content:'20-1 家 日 内'}]})],[],existing);
  const items=selected.map(entry=>({name:entry.name,category:entry.category,first_episode:entry.reuseOf||20,episodes:[20]}));
  await analysisRepository(pool).publishAnalysis('copy',publication(output,items,20),'alice');
  assert.equal(pool.assets().length,selected.length);
  assert.equal(pool.assets().some(asset=>asset.name==='【韩川出租屋-夜-内】'),false);
  for(const asset of existing){const saved=pool.assets().find(row=>row.id===asset.id);assert.equal(saved.image_url,asset.image_url);}
  assert.equal(pool.projects()[0].analysis_progress[20].output,output);
});

test('continuity compatibility: revoked source membership stops the next refresh and legacy publication promotes only its own row', async () => {
  const members=[{project_id:'source',user_id:'alice',role:'collaborator'}],row=collab({genre:'[COLLAB_PROJECT]\n[COLLAB_SOURCE:source]'}),pool=fixturePool([row,director()],members);
  const repo=extendRepository(pool);
  const first=await repo.refreshDirectorPrompts('copy','alice');
  members.splice(0);
  assert.deepEqual(await repo.refreshDirectorPrompts('copy','alice'),first);
  assert.equal(pool.queries.filter(q=>/^update /.test(q.sql)).length,1);
  const legacy=fixturePool([collab({genre:'都市'}),director()]);
  const saved=await analysisRepository(legacy).publishAnalysis('copy',publication(emptyOutput(19)),'alice');
  assert.equal(saved.genre,'都市\n[COLLAB_PROJECT]');
  assert.deepEqual(legacy.projects()[1],director());
});


test('publication reuse: multiline metadata cannot hide conflicting or future reuse evidence', async () => {
  for(const tail of ['复用自第20集','复用自第2集']) {
    const output=emptyOutput(19).replace('道具：\n- 无（本集未出现）',`道具：\n- 【手机】（复用自第1集）\n补充说明：（${tail}）`);
    const existing=[{id:'phone',project_id:'copy',name:'【手机】',category:'prop',first_episode:1,episodes:[1],image_url:'keep.png'}];
    const pool=fixturePool([collab()],[],existing);
    await assert.rejects(analysisRepository(pool).publishAnalysis('copy',publication(output,[{name:'【手机】',category:'prop',first_episode:1}]),'alice'),e=>e.status===400);
    assert.deepEqual(pool.assets(),existing);assert.equal(pool.queries.some(q=>/^insert into collab_assets/.test(q.sql)),false);
  }
});


test('publication compatibility: client-deduplicated phone corrected from character and prop columns stays a single valid asset', async () => {
  const output=emptyOutput(19).replace('人物：\n- 无（本集未出现）','人物：\n- 【苏橙橙手机】外观：黑色智能手机；材质：玻璃；屏幕：来电。').replace('道具：\n- 无（本集未出现）','道具：\n- 【苏橙橙手机】黑色智能手机');
  const pool=fixturePool([collab()]),item={name:'【苏橙橙手机】',category:'prop',first_episode:19,episodes:[19]};
  await analysisRepository(pool).publishAnalysis('copy',publication(output,[item]),'alice');
  assert.equal(pool.assets().length,1);assert.equal(pool.assets()[0].category,'prop');
  const duplicated=fixturePool([collab()]);
  await assert.rejects(analysisRepository(duplicated).publishAnalysis('copy',publication(output,[item,item]),'alice'),e=>e.status===400);
});


test('domain isolation: link handler preserves locked and recycled transaction status without genre mutation', async () => {
  for(const status of [423,410]) {
    const repo=actionRepo(collab());
    repo.linkDirectorProject=async()=>{throw Object.assign(new Error('关联目标不可编辑'),{status});};
    const result=await handleAction('project-link-director',{projectId:'copy',directorProjectId:'source'},{id:'alice'},repo);
    assert.equal(result.status,status);assert.equal(repo.writes.length,0);
  }
});


test('publication continuity: replacing an accepted plain Chinese target section does not duplicate it in accumulated output', async () => {
  const old=emptyOutput(19).replace('### 第19集','第十九集'),historical=emptyOutput(18);
  const row=collab({analysis_progress:{19:{output:old,fingerprint:'old'}},analysis_output:historical+'\n\n'+old});
  const pool=fixturePool([row]);
  await analysisRepository(pool).publishAnalysis('copy',{...publication(emptyOutput(19)),baseOutput:old},'alice');
  const saved=pool.projects()[0];
  assert.equal(saved.analysis_output,historical+'\n\n'+emptyOutput(19));
  assert.equal(saved.analysis_progress[19].output,emptyOutput(19));
});

test('source access: owner cannot link an unreadable director by cloud or local ID', async () => {
  for (const source of ['source', 'local-source']) {
    const pool = fixturePool([collab(), director()]);
    assert.equal(await extendRepository(pool).linkDirectorProject('copy', source, 'alice'), null);
    assert.equal(pool.queries.some(q => /^update /.test(q.sql)), false);
    assert.equal(pool.projects()[0].script, '原稿');
  }
});

test('source access: refresh rechecks access and resolves only unique readable legacy local IDs', async () => {
  for (const source of ['source', 'local-source']) {
    const row = collab({genre: `[COLLAB_PROJECT]\n[COLLAB_SOURCE:${source}]`});
    const pool = fixturePool([row, director()]);
    assert.deepEqual(await extendRepository(pool).refreshDirectorPrompts('copy', 'alice'), row);
    assert.equal(pool.queries.some(q => /^update /.test(q.sql)), false);
  }
  const members = [{project_id: 'source', user_id: 'alice', role: 'collaborator'}];
  const row = collab({genre: '[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]'});
  const pool = fixturePool([row, director(), director({id: 'unreadable-duplicate'})], members);
  const saved = await extendRepository(pool).refreshDirectorPrompts('copy', 'alice');
  assert.equal(saved.script, '外人的秘密剧本');
  assert.equal(pool.queries.filter(q => /^update /.test(q.sql)).length, 1);
  const ambiguous = fixturePool([row, director({owner_id: 'alice'}), director({id: 'duplicate', owner_id: 'alice'})]);
  assert.deepEqual(await extendRepository(ambiguous).refreshDirectorPrompts('copy', 'alice'), row);
  assert.equal(ambiguous.queries.some(q => /^update /.test(q.sql)), false);
});

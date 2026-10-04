import test from 'node:test';
import assert from 'node:assert/strict';
import * as creatorDomain from './creatorWorkspace.js';
import {
  normalizeCreatorProject, createCreatorProject, updateCreatorProject,
  updateCreatorSection, updateCreatorEpisode, addCreatorEpisode, removeCreatorNode,
  importCreatorSource, addCreatorReference, appendCreatorRecord, adoptCreatorRecord,
  buildCreatorText, editCreatorMaster, archiveCreatorProject, creatorInputFingerprint,
} from './creatorWorkspace.js';

const empty = () => ({ fruitProjects: [], scriptProjects: [], scriptLibrary: [] });
const project = (state, kind = 'script') => state[`${kind}Projects`].at(-1);
const make = (mode = 'free') => createCreatorProject(empty(), { name: '测试作品', mode, groupId: 'group-1' });

test('migration retains both episode sides and conflicting masters without stale aggregate overriding edits', () => {
  const old = { id: 'old', name: '旧作品', mode: 'original', groupId: 'g', finalScript: '旧总稿', masterScript: '另一份旧稿', episodes: [{ id: 'e1', title: '第1集', content: '原稿', result: '逐集转换稿', selectedSkill: 'skill' }] };
  const migrated = normalizeCreatorProject(old, 'script');
  assert.equal(migrated.creator.mode, 'free');
  assert.equal(migrated.episodes[0].content, '原稿');
  assert.equal(migrated.episodes[0].selectedSkill, 'skill');
  assert.equal(migrated.creator.legacy.finalScript, '旧总稿');
  assert.equal(migrated.creator.legacy.masterScript, '另一份旧稿');
  assert.equal(buildCreatorText(migrated, 'script', 'output'), '【第1集】\n逐集转换稿');
  assert.deepEqual(normalizeCreatorProject(migrated, 'script'), migrated);
  assert.equal(old.creator, undefined);
});

test('aggregate-only legacy projects remain readable and receive repeatable IDs', () => {
  const old = { id: 'only-master', mode: 'rewrite', finalScript: '完整旧终稿', episodes: [] };
  const migrated = normalizeCreatorProject(old, 'script');
  assert.match(buildCreatorText(migrated, 'script', 'output'), /完整旧终稿/);
  assert.equal(migrated.episodes[0].id, normalizeCreatorProject(old, 'script').episodes[0].id);
  assert.deepEqual(normalizeCreatorProject(migrated, 'script'), migrated);
});

test('creating each mode preserves legacy script mode compatibility and starts usable nodes', () => {
  for (const mode of ['fruit', 'rewrite', 'free', 'framework']) {
    const state = make(mode);
    const kind = mode === 'fruit' ? 'fruit' : 'script';
    const p = project(state, kind);
    assert.equal(p.creator.mode, mode);
    assert.equal(p.groupId, 'group-1');
    if (kind === 'script') assert.equal(p.mode, mode === 'rewrite' ? 'rewrite' : 'original');
    if (mode === 'fruit' || mode === 'free') assert.equal(p.episodes.length, 1);
    assert.ok(p.creator.sections.settings);
    assert.deepEqual(p.creator.references, []);
  }
});

test('empty output never falls back to original or legacy master', () => {
  const p = normalizeCreatorProject({ id: 'p', mode: 'original', finalScript: '过时稿', episodes: [{ id: 'e', title: '第1集', content: '只有原稿', result: '' }] }, 'script');
  assert.equal(buildCreatorText(p, 'script', 'output'), '');
  assert.equal(buildCreatorText(p, 'script', 'input'), '【第1集】\n只有原稿');
  const fruit = normalizeCreatorProject({ id: 'f', masterScript: '旧果子总稿', episodes: [{ id: 'e', title: '第1集', rawText: '原文', scriptText: '' }] }, 'fruit');
  assert.equal(buildCreatorText(fruit, 'fruit', 'output'), '');
});

test('master editing writes the same nodes while preserving IDs and the opposite side', () => {
  let state = make();
  const p = project(state), id = p.id, first = p.episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, first, { content: '输入一', result: '输出一' });
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  const second = project(state).episodes[1].id;
  state = updateCreatorEpisode(state, 'script', id, second, { content: '输入二', result: '输出二' });
  state = editCreatorMaster(state, 'script', id, 'output', '【第1集】\n改后输出一\n\n【第2集】\n改后输出二');
  assert.deepEqual(project(state).episodes.map(e => e.id), [first, second]);
  assert.deepEqual(project(state).episodes.map(e => e.content), ['输入一', '输入二']);
  assert.equal(project(state).episodes[1].result, '改后输出二');
  assert.equal(buildCreatorText(project(state), 'script', 'output'), '【第1集】\n改后输出一\n\n【第2集】\n改后输出二');
});

test('master episode headings add new nodes and exact title matches survive reordering', () => {
  let state = make();
  const id = project(state).id, first = project(state).episodes[0].id;
  state = editCreatorMaster(state, 'script', id, 'input', '第1集\n第一集正文\n\n第2集\n第二集正文');
  const second = project(state).episodes[1].id;
  assert.equal(project(state).episodes[0].id, first);
  state = editCreatorMaster(state, 'script', id, 'input', '【第2集】\n改二\n【第1集】\n改一');
  assert.deepEqual(project(state).episodes.map(e => e.id), [second, first]);
});

test('one unnumbered master stays in one existing node and ambiguous multi-node paste is rejected', () => {
  let state = make();
  const id = project(state).id, first = project(state).episodes[0].id;
  state = editCreatorMaster(state, 'script', id, 'input', '没有集号的整篇初稿');
  state = editCreatorMaster(state, 'script', id, 'input', '没有集号的整篇修订稿');
  assert.equal(project(state).episodes.length, 1);
  assert.equal(project(state).episodes[0].id, first);
  assert.equal(project(state).episodes[0].content, '没有集号的整篇修订稿');
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  assert.throws(() => editCreatorMaster(state, 'script', id, 'input', '无法识别分集的全文'), { code: 'CREATOR_AMBIGUOUS_MASTER' });
  assert.throws(() => editCreatorMaster(state, 'script', id, 'input', '【第1集】\n一\n【第1集】\n重复'), { code: 'CREATOR_AMBIGUOUS_MASTER' });
});

test('source import freezes the document separately from independent blank new episodes', () => {
  let state = make('rewrite');
  const id = project(state).id;
  const doc = { id: 'source-a', name: '对标稿', content: '第1集\n原作一\n\n第3集\n原作三' };
  state = importCreatorSource(state, id, doc);
  const p = project(state), sourceIds = p.creator.source.episodes.map(e => e.id);
  assert.equal(p.creator.source.content, doc.content);
  assert.deepEqual(p.creator.source.episodes.map(e => e.title), ['第1集', '第3集']);
  assert.equal(p.episodes.length, 2);
  assert.ok(p.episodes.every(e => !e.content && !e.result));
  assert.notEqual(p.episodes[0].id, sourceIds[0]);
  assert.deepEqual(p.episodes[0].sourceEpisodeIds, [sourceIds[0]]);
  assert.equal(buildCreatorText(p, 'script', 'output'), '');
  doc.content = '外部源被改了';
  assert.match(p.creator.source.content, /原作一/);
  const again = importCreatorSource(state, id, { id: 'source-a', name: '对标稿', content: p.creator.source.content });
  assert.deepEqual(project(again).creator.source.episodes.map(e => e.id), sourceIds);
});

test('updating source preserves an unequal count of existing new episodes and their content', () => {
  let state = make('rewrite');
  const id = project(state).id;
  state = addCreatorEpisode(state, 'script', id, { title: '我的第1集' });
  const episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '我的成稿', content: '故事正文', sourceEpisodeIds: ['old-source'] });
  state = importCreatorSource(state, id, { name: '新来源', content: '第1集\n原一\n第2集\n原二\n第3集\n原三' });
  assert.equal(project(state).episodes.length, 1);
  assert.equal(project(state).episodes[0].result, '我的成稿');
  assert.equal(project(state).episodes[0].id, episodeId);
  assert.deepEqual(project(state).episodes[0].sourceEpisodeIds, ['old-source']);
});

test('framework references retain independent snapshots and enforce the three-material limit', () => {
  let state = make('framework');
  const id = project(state).id;
  const doc = { name: '核心参考', content: '完整参考文' };
  state = addCreatorReference(state, id, doc);
  doc.content = '外部变更';
  assert.equal(project(state).creator.references[0].content, '完整参考文');
  state = addCreatorReference(state, id, { name: '参考二', content: '二' });
  state = addCreatorReference(state, id, { name: '参考三', content: '三' });
  assert.throws(() => addCreatorReference(state, id, { name: '参考四', content: '四' }), { code: 'CREATOR_REFERENCE_LIMIT' });
});

test('candidate records leave outputs untouched until explicit adoption and keep replaced history', () => {
  let state = make();
  const p = project(state), id = p.id, episodeId = p.episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '原稿', result: '手写输出' });
  const target = { episodeId, side: 'output' };
  state = appendCreatorRecord(state, 'script', id, { id: 'run-1', target, output: '候选输出', inputFingerprint: creatorInputFingerprint(project(state), target) });
  assert.equal(project(state).episodes[0].result, '手写输出');
  assert.equal(project(state).creator.records[0].status, 'candidate');
  state = adoptCreatorRecord(state, 'script', id, 'run-1');
  assert.equal(project(state).episodes[0].result, '候选输出');
  assert.equal(project(state).episodes[0].generationVersion, 1);
  assert.ok(project(state).creator.records.some(r => r.status === 'replaced' && r.output === '手写输出'));
  assert.equal(project(state).creator.records.find(r => r.id === 'run-1').status, 'adopted');
});

test('stale AI returns remain candidates and cannot overwrite newer target text', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id, target = { episodeId };
  const fingerprint = creatorInputFingerprint(project(state), target);
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '运行后改了输入', result: '人工最新结果' });
  state = appendCreatorRecord(state, 'script', id, { id: 'late', target, inputFingerprint: fingerprint, output: '过时回包' });
  assert.equal(project(state).creator.records.find(r => r.id === 'late').stale, true);
  assert.throws(() => adoptCreatorRecord(state, 'script', id, 'late'), { code: 'CREATOR_STALE_RESULT' });
  assert.equal(project(state).episodes[0].result, '人工最新结果');
  state = adoptCreatorRecord(state, 'script', id, 'late', { allowStale: true });
  assert.equal(project(state).episodes[0].result, '过时回包');
  assert.equal(project(state).episodes[0].stale, true);
});

test('fingerprints ignore pending history and chat but include adopted settings and frozen source', () => {
  let state = make();
  const id = project(state).id, target = { episodeId: project(state).episodes[0].id };
  const initial = creatorInputFingerprint(project(state), target);
  state = appendCreatorRecord(state, 'script', id, { target: { section: 'settings' }, output: '未选反派' });
  state = updateCreatorProject(state, 'script', id, { chat: [{ role: 'assistant', content: '未选反派' }] });
  state = updateCreatorSection(state, 'script', id, 'settings', { output: '未采用草稿', accepted: false });
  assert.equal(creatorInputFingerprint(project(state), target), initial);
  state = updateCreatorSection(state, 'script', id, 'settings', { output: '已采用规则', accepted: true });
  const adopted = creatorInputFingerprint(project(state), target);
  assert.notEqual(adopted, initial);
  state = importCreatorSource(state, id, { name: '来源', content: '来源正文' });
  assert.notEqual(creatorInputFingerprint(project(state), target), adopted);
});

test('locked sections reject ordinary editing and candidate adoption until explicit unlock', () => {
  let state = make('framework');
  const id = project(state).id;
  state = updateCreatorSection(state, 'script', id, 'skeleton', { output: '固定结局', accepted: true, locked: true });
  assert.throws(() => updateCreatorSection(state, 'script', id, 'skeleton', { output: '改结局' }), { code: 'CREATOR_LOCKED' });
  state = appendCreatorRecord(state, 'script', id, { id: 'branch', target: { section: 'skeleton' }, output: '候选结局' });
  assert.throws(() => adoptCreatorRecord(state, 'script', id, 'branch'), { code: 'CREATOR_LOCKED' });
  state = adoptCreatorRecord(state, 'script', id, 'branch', { unlock: true });
  assert.equal(project(state).creator.sections.skeleton.output, '候选结局');
  assert.equal(project(state).creator.sections.skeleton.locked, false);
});

test('adoption supports append and input sides without changing the other side', () => {
  let state = make('fruit');
  const id = project(state, 'fruit').id, episodeId = project(state, 'fruit').episodes[0].id;
  state = updateCreatorEpisode(state, 'fruit', id, episodeId, { rawText: '原始', scriptText: '转换' });
  state = appendCreatorRecord(state, 'fruit', id, { id: 'append', target: { episodeId }, output: '补充' });
  state = adoptCreatorRecord(state, 'fruit', id, 'append', { mode: 'append', side: 'input' });
  assert.equal(project(state, 'fruit').episodes[0].rawText, '原始\n\n补充');
  assert.equal(project(state, 'fruit').episodes[0].scriptText, '转换');
});

test('upstream adopted edits mark existing confirmed final episodes stale without erasing them', () => {
  let state = make('framework');
  const id = project(state).id;
  state = addCreatorEpisode(state, 'script', id, { title: '第1集' });
  const episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '故事正文', result: '人工分场终稿', finalConfirmed: true });
  state = updateCreatorSection(state, 'script', id, 'detail', { output: '采用的新细纲', accepted: true });
  assert.equal(project(state).episodes[0].result, '人工分场终稿');
  assert.equal(project(state).episodes[0].finalConfirmed, true);
  assert.equal(project(state).episodes[0].stale, true);
  state = updateCreatorEpisode(state, 'script', id, episodeId, { stale: false, finalConfirmed: true });
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '修改对应故事正文' });
  assert.equal(project(state).episodes[0].stale, true);
});

test('pending section drafts do not mark confirmed episodes stale', () => {
  let state = make('framework');
  const id = project(state).id;
  state = addCreatorEpisode(state, 'script', id, { title: '第1集' });
  const episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '正式终稿', finalConfirmed: true });
  state = updateCreatorSection(state, 'script', id, 'simulation', { output: '未选择的模拟分支', accepted: false });
  assert.equal(project(state).episodes[0].stale, false);
});

test('free custom nodes export in order without becoming numbered episodes; framework final excludes process nodes', () => {
  let state = make();
  const id = project(state).id;
  state = addCreatorEpisode(state, 'script', id, { title: '世界规则', type: 'settings' });
  state = addCreatorEpisode(state, 'script', id, { title: '人物笔记', type: 'custom' });
  state = updateCreatorEpisode(state, 'script', id, project(state).episodes[1].id, { content: '规则正文', result: '规则成果' });
  state = updateCreatorEpisode(state, 'script', id, project(state).episodes[2].id, { content: '笔记正文', result: '笔记成果' });
  assert.equal(buildCreatorText(project(state), 'script', 'input'), '【世界规则】\n规则正文\n\n【人物笔记】\n笔记正文');
  let framework = make('framework');
  const fid = project(framework).id;
  framework = addCreatorEpisode(framework, 'script', fid, { title: '人物笔记', type: 'custom' });
  framework = updateCreatorEpisode(framework, 'script', fid, project(framework).episodes[0].id, { result: '不能导出笔记' });
  framework = addCreatorEpisode(framework, 'script', fid, { title: '第1集' });
  framework = updateCreatorEpisode(framework, 'script', fid, project(framework).episodes[1].id, { content: '故事草稿', result: '1-1 日 内 客厅\n△正式分场正文。' });
  framework = updateCreatorSection(framework, 'script', fid, 'settings', { output: '不能导出设定', accepted: true });
  assert.equal(buildCreatorText(project(framework), 'script', 'output', { includeSections: true }), '【第1集】\n1-1 日 内 客厅\n△正式分场正文。');
});

test('structured section appendices are opt-in and source text never enters new-work output', () => {
  let state = make('rewrite');
  const id = project(state).id;
  state = updateCreatorSection(state, 'script', id, 'settings', { input: '对标设定', output: '新作设定', accepted: true });
  assert.equal(buildCreatorText(project(state), 'script', 'output'), '');
  assert.equal(buildCreatorText(project(state), 'script', 'output', { includeSections: true }), '【设定】\n新作设定');
});

test('deleted custom nodes are retained as restorable records with their two sides', () => {
  let state = make();
  const id = project(state).id;
  state = addCreatorEpisode(state, 'script', id, { title: '人物', type: 'custom' });
  const episodeId = project(state).episodes[1].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '原人物', result: '新人物' });
  state = removeCreatorNode(state, 'script', id, episodeId);
  assert.equal(project(state).episodes.length, 1);
  const record = project(state).creator.records.find(r => r.type === 'deleted-node');
  assert.equal(record.node.result, '新人物');
  state = adoptCreatorRecord(state, 'script', id, record.id);
  assert.equal(project(state).episodes[1].id, episodeId);
  assert.equal(project(state).episodes[1].content, '原人物');
  assert.equal(project(state).episodes[1].result, '新人物');
});

test('archive keeps independently frozen versions grouped by source project and latest director-compatible content', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '第一版终稿' });
  state = archiveCreatorProject(state, id, { side: 'output' });
  const archived = state.scriptLibrary[0], v1 = archived.versions[0];
  assert.equal(archived.sourceMode, 'original');
  assert.equal(archived.creatorMode, 'free');
  assert.equal(v1.content, '【第1集】\n第一版终稿');
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '第二版终稿' });
  assert.equal(state.scriptLibrary[0].content, '【第1集】\n第一版终稿');
  state = archiveCreatorProject(state, id, { side: 'output' });
  assert.equal(state.scriptLibrary.length, 1);
  assert.equal(state.scriptLibrary[0].id, archived.id);
  assert.equal(state.scriptLibrary[0].versions.length, 2);
  assert.equal(state.scriptLibrary[0].versions[0].content, '【第1集】\n第一版终稿');
  assert.equal(state.scriptLibrary[0].content, '【第1集】\n第二版终稿');
  assert.equal(v1.episodes[0].result, '第一版终稿');
  state.scriptProjects[0].episodes[0].result = '外部对象后来被改';
  assert.equal(state.scriptLibrary[0].versions[1].episodes[0].result, '第二版终稿');
});

test('archive rejects blank selected sides and ignores a source project deletion', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '只有左侧' });
  assert.throws(() => archiveCreatorProject(state, id, { side: 'output' }), { code: 'CREATOR_EMPTY_ARCHIVE' });
  state = archiveCreatorProject(state, id, { side: 'input' });
  state = { ...state, scriptProjects: [] };
  assert.equal(state.scriptLibrary[0].content, '【第1集】\n只有左侧');
});

test('creator patches merge sections and preserve the surrounding project and immutable previous state', () => {
  const before = make();
  const id = project(before).id;
  const after = updateCreatorProject(before, 'script', id, { sections: { settings: { output: '规则', accepted: true } }, chat: [{ role: 'user', content: '继续' }] });
  assert.equal(project(after).name, '测试作品');
  assert.equal(project(after).groupId, 'group-1');
  assert.ok(project(after).creator.sections.outline);
  assert.equal(project(after).creator.sections.settings.input, '');
  assert.equal(project(before).creator.sections.settings.output, '');
  assert.deepEqual(project(before).creator.chat, []);
});

test('adoption rejects a removed target and cross-project records rather than writing another node', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = appendCreatorRecord(state, 'script', id, { id: 'lost', target: { episodeId }, output: '旧目标结果' });
  state = removeCreatorNode(state, 'script', id, episodeId);
  assert.throws(() => adoptCreatorRecord(state, 'script', id, 'lost'), { code: 'CREATOR_TARGET_MISSING' });
  assert.throws(() => appendCreatorRecord(state, 'script', id, { projectId: 'another', target: { section: 'settings' }, output: '错误项目' }), { code: 'CREATOR_PROJECT_MISMATCH' });
});

test('a later input edit marks an already returned candidate stale in stored project records', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = appendCreatorRecord(state, 'script', id, { id: 'returned', target: { episodeId }, output: '已返回候选' });
  assert.equal(project(state).creator.records[0].stale, false);
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '候选返回后改原文' });
  assert.equal(project(state).creator.records.find(r => r.id === 'returned').stale, true);
});

test('new source headings keep existing source IDs without producing duplicate IDs', () => {
  let state = make('rewrite');
  const id = project(state).id;
  state = importCreatorSource(state, id, { id: 'stable-source', name: '来源', content: '第2集\n二\n第3集\n三' });
  const before = project(state).creator.source.episodes;
  state = importCreatorSource(state, id, { id: 'stable-source', name: '来源', content: '第1集\n一\n第2集\n二\n第3集\n三' });
  const after = project(state).creator.source.episodes;
  assert.equal(after[1].id, before[0].id);
  assert.equal(after[2].id, before[1].id);
  assert.equal(new Set(after.map(e => e.id)).size, 3);
});

test('importing a frozen fruit compiled source preserves explicit episode boundaries', () => {
  let state = make('rewrite');
  const id = project(state).id;
  state = importCreatorSource(state, id, { name: '果子来源', content: '【第1集】\n转换第一集\n\n【第2集】\n转换第二集' });
  assert.deepEqual(project(state).creator.source.episodes.map(e => ({ title: e.title, content: e.content })), [
    { title: '第1集', content: '转换第一集' }, { title: '第2集', content: '转换第二集' },
  ]);
});

test('manual output edits retain prior text as an explicitly restorable history version', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '前一稿' });
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '新稿' });
  const record = project(state).creator.records.find(r => r.type === 'history' && r.output === '前一稿');
  assert.ok(record);
  state = adoptCreatorRecord(state, 'script', id, record.id);
  assert.equal(project(state).episodes[0].result, '前一稿');
  assert.ok(project(state).creator.records.some(r => r.output === '新稿' && r.status === 'replaced'));
});

test('adopting a source analysis never declares the new-work section accepted', () => {
  let state = make('rewrite');
  const id = project(state).id;
  state = appendCreatorRecord(state, 'script', id, { id: 'analysis', target: { section: 'settings', side: 'input' }, output: '来源设定分析' });
  state = adoptCreatorRecord(state, 'script', id, 'analysis');
  assert.equal(project(state).creator.sections.settings.input, '来源设定分析');
  assert.equal(project(state).creator.sections.settings.output, '');
  assert.equal(project(state).creator.sections.settings.accepted, false);
});

test('repeated record IDs update one run without auto-adopting the result', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = appendCreatorRecord(state, 'script', id, { id: 'run', target: { episodeId }, status: 'running' });
  const fingerprint = project(state).creator.records[0].inputFingerprint;
  state = appendCreatorRecord(state, 'script', id, { id: 'run', status: 'candidate', output: '完成的候选' });
  assert.equal(project(state).creator.records.length, 1);
  assert.equal(project(state).creator.records[0].inputFingerprint, fingerprint);
  assert.equal(project(state).episodes[0].result, '');
});

test('normalizing legacy and current projects never interrupts running tasks', () => {
  const legacy = normalizeCreatorProject({ id: 'old-running', mode: 'original', creator: { records: [{ id: 'old-run', status: 'running' }] }, episodes: [] }, 'script');
  assert.equal(legacy.creator.records[0].status, 'running');
  const current = { ...legacy, creator: { ...legacy.creator, records: [{ id: 'new-run', status: 'running' }] } };
  assert.equal(normalizeCreatorProject(current, 'script').creator.records[0].status, 'running');
});

test('multiple adopted generations receive independent versions and keep historical candidates', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  for (const [recordId, output] of [['v1', '初次结果'], ['v2', '二次结果']]) {
    state = appendCreatorRecord(state, 'script', id, { id: recordId, target: { episodeId }, output });
    state = adoptCreatorRecord(state, 'script', id, recordId);
  }
  const node = project(state).episodes[0];
  assert.equal(node.generationVersion, 2);
  assert.deepEqual(node.generationVersions.map(v => [v.version, v.output]), [[1, '初次结果'], [2, '二次结果']]);
  assert.equal(project(state).creator.records.find(r => r.id === 'v1').status, 'adopted');
});

test('pending candidates stored before a later edit are marked stale without being adopted', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = appendCreatorRecord(state, 'script', id, { id: 'pending', target: { episodeId }, status: 'pending', output: '等待选择的候选' });
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '新输入' });
  assert.equal(project(state).creator.records.find(r => r.id === 'pending').stale, true);
  assert.equal(project(state).episodes[0].result, '');
});

test('startup recovery interrupts fruit and script runs with a Chinese explanation while preserving all saved work', () => {
  let state = make('fruit');
  const fruit = project(state, 'fruit');
  state = appendCreatorRecord(state, 'fruit', fruit.id, { id: 'fruit-running', target: { episodeId: fruit.episodes[0].id }, output: '部分已保存结果', status: 'running' });
  state = createCreatorProject(state, { name: '恢复原创', mode: 'free' });
  const script = project(state);
  state = appendCreatorRecord(state, 'script', script.id, { id: 'script-running', target: { episodeId: script.episodes[0].id }, status: 'running' });
  state = appendCreatorRecord(state, 'script', script.id, { id: 'candidate', target: { episodeId: script.episodes[0].id }, status: 'pending', output: '原待选结果' });
  state = { ...state, directorProjects: [{ id: 'director', status: 'running' }] };
  const recovered = creatorDomain.recoverCreatorTasks(state);
  assert.equal(project(recovered, 'fruit').creator.records[0].status, 'interrupted');
  assert.match(project(recovered, 'fruit').creator.records[0].error, /中断/);
  assert.equal(project(recovered, 'fruit').creator.records[0].output, '部分已保存结果');
  assert.equal(project(recovered).creator.records.find(r => r.id === 'script-running').status, 'interrupted');
  assert.equal(project(recovered).creator.records.find(r => r.id === 'candidate').status, 'pending');
  assert.equal(project(state, 'fruit').creator.records[0].status, 'running');
  assert.equal(recovered.directorProjects, state.directorProjects);
  assert.equal(creatorDomain.recoverCreatorTasks(recovered), recovered);
});

test('manual section editing snapshots both sides once per session and can restore the old output', () => {
  let state = make('rewrite');
  const id = project(state).id;
  state = updateCreatorSection(state, 'script', id, 'settings', { input: '对标旧分析', output: '旧规则', accepted: true });
  state = updateCreatorSection(state, 'script', id, 'settings', { input: '对标新分析', output: '新规则' });
  state = updateCreatorSection(state, 'script', id, 'settings', { output: '继续改规则' });
  const history = project(state).creator.records.filter(r => r.type === 'history' && r.source === 'manual' && r.target?.section === 'settings');
  assert.deepEqual(history.map(r => [r.target.side, r.output]), [['input', '对标旧分析'], ['output', '旧规则']]);
  state = adoptCreatorRecord(state, 'script', id, history.find(r => r.target.side === 'output').id);
  assert.equal(project(state).creator.sections.settings.output, '旧规则');
  assert.equal(project(state).creator.sections.settings.input, '对标新分析');
});

test('section edits after thirty seconds create a new session snapshot and candidate adoption makes only its one history entry', () => {
  let state = make('framework');
  const id = project(state).id;
  state = updateCreatorSection(state, 'script', id, 'outline', { output: '首稿', accepted: true });
  state = updateCreatorSection(state, 'script', id, 'outline', { output: '二稿' });
  state = updateCreatorProject(state, 'script', id, { records: project(state).creator.records.map(r => ({ ...r, createdAt: '2000-01-01T00:00:00.000Z' })) });
  state = updateCreatorProject(state, 'script', id, { sections: { outline: { output: '三稿' } } });
  const manual = project(state).creator.records.filter(r => r.type === 'history' && r.source === 'manual' && r.target?.section === 'outline');
  assert.deepEqual(manual.map(r => r.output), ['首稿', '二稿']);
  state = appendCreatorRecord(state, 'script', id, { id: 'adopt-stage', target: { section: 'outline' }, output: '采用稿' });
  const before = project(state).creator.records.length;
  state = adoptCreatorRecord(state, 'script', id, 'adopt-stage');
  assert.equal(project(state).creator.records.length, before + 1);
  assert.equal(project(state).creator.records.filter(r => r.type === 'history' && r.output === '三稿').length, 1);
});

test('project-scope candidates become stale after an earlier episode fact changes and confirmed later text is retained for review', () => {
  let state = make();
  const id = project(state).id, firstId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, firstId, { content: '女主还不知道秘密' });
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  const secondId = project(state).episodes[1].id, target = { episodeId: secondId };
  state = updateCreatorEpisode(state, 'script', id, secondId, { content: '第二集正文', result: '人工确认的第二集', finalConfirmed: true });
  const fingerprint = creatorInputFingerprint(project(state), target);
  assert.equal(fingerprint, creatorInputFingerprint(project(state), { ...target, scope: 'project' }));
  state = appendCreatorRecord(state, 'script', id, { id: 'second-draft', target, status: 'pending', output: '依照旧知情状态生成的第二集' });
  state = updateCreatorEpisode(state, 'script', id, firstId, { content: '女主已经知道秘密' });
  assert.notEqual(creatorInputFingerprint(project(state), target), fingerprint);
  assert.equal(project(state).creator.records.find(r => r.id === 'second-draft').stale, true);
  assert.throws(() => adoptCreatorRecord(state, 'script', id, 'second-draft'), { code: 'CREATOR_STALE_RESULT' });
  assert.equal(project(state).episodes[1].result, '人工确认的第二集');
  assert.equal(project(state).episodes[1].finalConfirmed, true);
  assert.equal(project(state).episodes[1].stale, true);
});

test('current-scope candidates exclude unrelated episode edits while project-scoped section work includes them', () => {
  let state = make();
  const id = project(state).id, firstId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, firstId, { content: '前集事实' });
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  const secondId = project(state).episodes[1].id, target = { episodeId: secondId, scope: 'current' };
  const current = creatorInputFingerprint(project(state), target), outline = creatorInputFingerprint(project(state), { section: 'outline' });
  state = appendCreatorRecord(state, 'script', id, { id: 'current-only', target, status: 'pending', output: '仅依据当前内容生成' });
  state = updateCreatorEpisode(state, 'script', id, firstId, { content: '修改前集事实' });
  assert.equal(creatorInputFingerprint(project(state), target), current);
  assert.notEqual(creatorInputFingerprint(project(state), { section: 'outline' }), outline);
  assert.equal(project(state).creator.records.find(r => r.id === 'current-only').stale, false);
  state = adoptCreatorRecord(state, 'script', id, 'current-only');
  assert.equal(project(state).episodes[1].result, '仅依据当前内容生成');
});

test('project fingerprints cover both original and result fields of other script episodes', () => {
  let state = make();
  const id = project(state).id, firstId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, firstId, { content: '前集原稿', result: '前集成果' });
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  const target = { episodeId: project(state).episodes[1].id };
  const initial = creatorInputFingerprint(project(state), target);
  state = updateCreatorEpisode(state, 'script', id, firstId, { content: '修改前集原稿' });
  const changedInput = creatorInputFingerprint(project(state), target);
  assert.notEqual(changedInput, initial);
  state = updateCreatorEpisode(state, 'script', id, firstId, { result: '修改前集成果' });
  assert.notEqual(creatorInputFingerprint(project(state), target), changedInput);
});

test('fruit project context fingerprints use other converted episodes and exclude their unread raw material', () => {
  let state = make('fruit');
  const id = project(state, 'fruit').id, firstId = project(state, 'fruit').episodes[0].id;
  state = updateCreatorEpisode(state, 'fruit', id, firstId, { rawText: '前集原素材', scriptText: '前集转换结果' });
  state = addCreatorEpisode(state, 'fruit', id, { title: '第2集' });
  const secondId = project(state, 'fruit').episodes[1].id, target = { episodeId: secondId, scope: 'project' };
  state = updateCreatorEpisode(state, 'fruit', id, secondId, { scriptText: '确认的后集结果', finalConfirmed: true });
  const initial = creatorInputFingerprint(project(state, 'fruit'), target);
  state = updateCreatorEpisode(state, 'fruit', id, firstId, { rawText: '只修改未供上下文读取的原素材' });
  assert.equal(creatorInputFingerprint(project(state, 'fruit'), target), initial);
  state = updateCreatorEpisode(state, 'fruit', id, firstId, { scriptText: '修改转换事实' });
  assert.notEqual(creatorInputFingerprint(project(state, 'fruit'), target), initial);
  assert.equal(project(state, 'fruit').episodes[1].stale, true);
  assert.equal(project(state, 'fruit').episodes[1].scriptText, '确认的后集结果');
});

test('node reordering invalidates project context and retains both results marked for review', () => {
  let state = make();
  const id = project(state).id, firstId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, firstId, { content: '原一', result: '成果一', finalConfirmed: true });
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  const secondId = project(state).episodes[1].id;
  state = updateCreatorEpisode(state, 'script', id, secondId, { content: '原二', result: '成果二', finalConfirmed: true });
  const target = { episodeId: secondId }, fingerprint = creatorInputFingerprint(project(state), target);
  state = editCreatorMaster(state, 'script', id, 'input', '【第2集】\n原二\n【第1集】\n原一');
  assert.notEqual(creatorInputFingerprint(project(state), target), fingerprint);
  assert.deepEqual(project(state).episodes.map(e => [e.id, e.result, e.stale]), [[secondId, '成果二', true], [firstId, '成果一', true]]);
});

test('story normalization provides stable event and character identities without adopting unconfirmed material', () => {
  const old = { id: 'story-old', mode: 'original', episodes: [], creator: { story: { characters: [{ name: '阿青' }], events: [{ title: '相遇', content: '旧事件正文' }] } } };
  const p = normalizeCreatorProject(old, 'script');
  assert.ok(p.creator.story.characters[0].id);
  assert.ok(p.creator.story.events[0].id);
  assert.equal(p.creator.story.events[0].accepted, false);
  assert.equal(p.creator.story.characters[0].accepted, false);
  assert.deepEqual(p.creator.story.events[0].characterIds, []);
  assert.deepEqual(normalizeCreatorProject(p, 'script'), p);
  assert.deepEqual(normalizeCreatorProject(old, 'script').creator.story, p.creator.story);
  assert.deepEqual(project(make()).creator.story, { events: [], characters: [] });
});

test('story upsert keeps IDs and linked character episode data stable while preserving the previous state', () => {
  let state = make('framework');
  const id = project(state).id;
  state = addCreatorEpisode(state, 'script', id, { title: '第1集' });
  const episodeId = project(state).episodes[0].id;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'hero', name: '阿青', description: '守秘密的人', start: '第一集', end: '最后一集', accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'meeting', title: '相遇', content: '发现秘密', result: '决定隐瞒', characterIds: ['hero'], episodeIds: [episodeId], actualTime: '第一日', accepted: true });
  const before = state;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'meeting', title: '第一次相遇' });
  assert.equal(project(state).creator.story.events.length, 1);
  assert.equal(project(state).creator.story.events[0].id, 'meeting');
  assert.equal(project(state).creator.story.events[0].content, '发现秘密');
  assert.deepEqual(project(state).creator.story.events[0].characterIds, ['hero']);
  assert.equal(project(before).creator.story.events[0].title, '相遇');
});

test('story references reject missing characters events parents and episodes without changing the graph', () => {
  const state = make(), id = project(state).id;
  for (const patch of [
    { characterIds: ['missing-person'] }, { predecessorIds: ['missing-event'] },
    { parentEventId: 'missing-parent' }, { episodeIds: ['missing-episode'] },
  ]) assert.throws(() => creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { title: '坏引用', ...patch }), { code: 'CREATOR_STORY_REFERENCE_MISSING' });
  assert.deepEqual(project(state).creator.story.events, []);
});

test('causal and parent cycles are rejected atomically including direct self-reference', () => {
  let state = make();
  const id = project(state).id;
  assert.throws(() => creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'self', predecessorIds: ['self'] }), { code: 'CREATOR_CAUSAL_CYCLE' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'a', title: 'A' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'b', title: 'B', predecessorIds: ['a'] });
  assert.throws(() => creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'a', predecessorIds: ['b'] }), { code: 'CREATOR_CAUSAL_CYCLE' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'b', parentEventId: 'a' });
  assert.throws(() => creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'a', parentEventId: 'b' }), { code: 'CREATOR_PARENT_CYCLE' });
  assert.deepEqual(project(state).creator.story.events[0].predecessorIds, []);
});

test('only adopted story facts affect input fingerprints and mark saved final scripts for review', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id, target = { episodeId };
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '人工终稿', finalConfirmed: true });
  const before = creatorInputFingerprint(project(state), target);
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'candidate-person', name: '未选反派' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'candidate-event', title: '未选事件', characterIds: ['candidate-person'] });
  assert.equal(creatorInputFingerprint(project(state), target), before);
  assert.equal(project(state).episodes[0].stale, false);
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'candidate-person', accepted: true });
  assert.notEqual(creatorInputFingerprint(project(state), target), before);
  assert.equal(project(state).episodes[0].stale, true);
  assert.equal(project(state).episodes[0].result, '人工终稿');
  assert.equal(project(state).episodes[0].finalConfirmed, true);
});

test('deleting a character cleans event associations and retains a restorable story snapshot', () => {
  let state = make();
  const id = project(state).id;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'p', name: '人物甲', accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'e', title: '事件', characterIds: ['p'], accepted: true });
  state = creatorDomain.removeCreatorStoryItem(state, 'script', id, 'character', 'p');
  assert.deepEqual(project(state).creator.story.characters, []);
  assert.deepEqual(project(state).creator.story.events[0].characterIds, []);
  const history = project(state).creator.records.find(r => r.type === 'story-history' && r.operation === 'delete');
  assert.equal(history.storySnapshot.characters[0].name, '人物甲');
  state = adoptCreatorRecord(state, 'script', id, history.id);
  assert.equal(project(state).creator.story.characters[0].id, 'p');
  assert.deepEqual(project(state).creator.story.events[0].characterIds, ['p']);
});

test('deleting an event removes prerequisite and parent links and preserves deleted content in history', () => {
  let state = make();
  const id = project(state).id;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'a', title: '大事件', content: '保留的原正文', accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'b', title: '后续', predecessorIds: ['a'], parentEventId: 'a', accepted: true });
  state = creatorDomain.removeCreatorStoryItem(state, 'script', id, 'event', 'a');
  assert.equal(project(state).creator.story.events[0].id, 'b');
  assert.deepEqual(project(state).creator.story.events[0].predecessorIds, []);
  assert.equal(project(state).creator.story.events[0].parentEventId, null);
  assert.equal(project(state).creator.records.find(r => r.operation === 'delete').storySnapshot.events[0].content, '保留的原正文');
});

test('story reordering validates complete ID sets, keeps identity and ignores unadopted candidate placement in fingerprints', () => {
  let state = make();
  const id = project(state).id, target = { episodeId: project(state).episodes[0].id };
  for (const [eventId, accepted] of [['a', true], ['b', true], ['candidate', false]]) {
    state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: eventId, title: eventId, accepted });
  }
  const before = creatorInputFingerprint(project(state), target);
  state = creatorDomain.reorderCreatorStoryItems(state, 'script', id, 'event', ['candidate', 'a', 'b']);
  assert.equal(creatorInputFingerprint(project(state), target), before);
  state = creatorDomain.reorderCreatorStoryItems(state, 'script', id, 'event', ['b', 'candidate', 'a']);
  assert.notEqual(creatorInputFingerprint(project(state), target), before);
  assert.deepEqual(project(state).creator.story.events.map(e => e.id), ['b', 'candidate', 'a']);
  assert.throws(() => creatorDomain.reorderCreatorStoryItems(state, 'script', id, 'event', ['a', 'b']), { code: 'CREATOR_STORY_INVALID_ORDER' });
  assert.throws(() => creatorDomain.reorderCreatorStoryItems(state, 'script', id, 'event', ['a', 'a', 'candidate']), { code: 'CREATOR_STORY_INVALID_ORDER' });
});

test('splitting keeps the original major event and creates stable children with inherited characters and episode associations', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'hero', name: '女主', accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'major', title: '发现真相', content: '完整原大事件', characterIds: ['hero'], episodeIds: [episodeId], accepted: true });
  state = creatorDomain.splitCreatorEvent(state, 'script', id, 'major', [{ title: '拿到证据', content: '拿到信' }, { title: '确认身份', content: '比对字迹' }]);
  const [major, first, second] = project(state).creator.story.events;
  assert.equal(major.id, 'major');
  assert.equal(major.content, '完整原大事件');
  assert.equal(major.isMajor, true);
  assert.equal(first.parentEventId, 'major');
  assert.equal(second.parentEventId, 'major');
  assert.deepEqual(first.characterIds, ['hero']);
  assert.deepEqual(first.episodeIds, [episodeId]);
  assert.deepEqual(second.predecessorIds, [first.id]);
  assert.equal(new Set([major.id, first.id, second.id]).size, 3);
  assert.equal(project(state).creator.records.find(r => r.operation === 'split').storySnapshot.events[0].content, '完整原大事件');
});

test('merging creates a new event and redirects causal parent character and episode links while retaining old texts', () => {
  let state = make();
  const id = project(state).id, firstEpisode = project(state).episodes[0].id;
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  const secondEpisode = project(state).episodes[1].id;
  for (const characterId of ['hero', 'rival']) state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: characterId, name: characterId });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'start', title: '起点' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'a', title: '发现', content: '找到证据', result: '知道疑点', characterIds: ['hero'], episodeIds: [firstEpisode], predecessorIds: ['start'], accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'b', title: '对质', content: '拿证据询问', result: '确认秘密', characterIds: ['rival'], episodeIds: [secondEpisode], predecessorIds: ['a'], accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'after', title: '后续', predecessorIds: ['a', 'b'], parentEventId: 'b' });
  state = creatorDomain.mergeCreatorEvents(state, 'script', id, ['a', 'b'], { title: '发现并对质' });
  const merged = project(state).creator.story.events.find(e => e.title === '发现并对质'), after = project(state).creator.story.events.find(e => e.id === 'after');
  assert.ok(merged.id !== 'a' && merged.id !== 'b');
  assert.deepEqual(merged.characterIds, ['hero', 'rival']);
  assert.deepEqual(merged.episodeIds, [firstEpisode, secondEpisode]);
  assert.deepEqual(merged.predecessorIds, ['start']);
  assert.deepEqual(after.predecessorIds, [merged.id]);
  assert.equal(after.parentEventId, merged.id);
  assert.match(merged.content, /找到证据/);
  assert.match(merged.content, /拿证据询问/);
  const previous = project(state).creator.records.find(r => r.operation === 'merge').storySnapshot;
  assert.equal(previous.events.find(e => e.id === 'b').result, '确认秘密');
});

test('a merge that would introduce a causal cycle is rejected without removing source events', () => {
  let state = make();
  const id = project(state).id;
  for (const [eventId, predecessorIds] of [['a', []], ['b', ['a']], ['c', ['b']]]) {
    state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: eventId, title: eventId, predecessorIds });
  }
  assert.throws(() => creatorDomain.mergeCreatorEvents(state, 'script', id, ['a', 'c']), { code: 'CREATOR_CAUSAL_CYCLE' });
  assert.deepEqual(project(state).creator.story.events.map(e => e.id), ['a', 'b', 'c']);
});

test('deleting an episode removes its event assignment and keeps its node available for restore', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'e', title: '已排事件', episodeIds: [episodeId], accepted: true });
  state = removeCreatorNode(state, 'script', id, episodeId);
  assert.deepEqual(project(state).creator.story.events[0].episodeIds, []);
  const record = project(state).creator.records.find(r => r.type === 'deleted-node');
  assert.equal(record.node.id, episodeId);
  state = adoptCreatorRecord(state, 'script', id, record.id);
  assert.deepEqual(project(state).creator.story.events[0].episodeIds, [episodeId]);
});

test('unnumbered master replacement and clearing preserve restorable histories and never overwrite the opposite side', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { content: '无标题整部旧原稿', result: '右侧成果' });
  state = editCreatorMaster(state, 'script', id, 'input', '无标题整部新原稿');
  let history = project(state).creator.records.find(r => r.type === 'history' && r.output === '无标题整部旧原稿');
  assert.ok(history);
  assert.equal(project(state).episodes[0].result, '右侧成果');
  state = editCreatorMaster(state, 'script', id, 'input', '');
  assert.ok(project(state).creator.records.some(r => r.type === 'history' && r.output === '无标题整部新原稿'));
  state = adoptCreatorRecord(state, 'script', id, history.id);
  assert.equal(project(state).episodes[0].content, '无标题整部旧原稿');
  state = addCreatorEpisode(state, 'script', id, { title: '第2集' });
  state = updateCreatorEpisode(state, 'script', id, project(state).episodes[1].id, { content: '第二集旧原稿', result: '第二集右稿' });
  state = editCreatorMaster(state, 'script', id, 'input', '');
  assert.deepEqual(project(state).episodes.map(e => e.content), ['', '']);
  assert.deepEqual(project(state).episodes.map(e => e.result), ['右侧成果', '第二集右稿']);
  assert.ok(project(state).creator.records.some(r => r.type === 'history' && r.output === '第二集旧原稿'));
});

test('opt-in story export resolves accepted associations to readable names and event numbers without leaking candidate material or IDs', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'internal-person', name: '阿青', description: '守护真相', start: '起点', end: '归来', accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'candidate-person', name: '未选神秘人' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'internal-first', title: '得到线索', content: '捡到信', characterIds: ['internal-person'], episodeIds: [episodeId], accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { id: 'internal-second', title: '确认真相', result: '得知秘密', predecessorIds: ['internal-first'], parentEventId: 'internal-first', accepted: true });
  assert.equal(buildCreatorText(project(state), 'script', 'output'), '');
  const exported = buildCreatorText(project(state), 'script', 'output', { includeSections: true });
  assert.match(exported, /已采用人物/);
  assert.match(exported, /人物：阿青/);
  assert.match(exported, /前置事件：事件1/);
  assert.match(exported, /分集：第1集/);
  assert.doesNotMatch(exported, /internal-|candidate-person|未选神秘人/);
  const framework = { ...project(state), creator: { ...project(state).creator, mode: 'framework' } };
  assert.equal(buildCreatorText(framework, 'script', 'output', { includeSections: true }), '');
});

test('a locked adopted section cannot be removed from active facts without explicit unlock and empty or unadopted sections cannot be locked', () => {
  let state = make('framework');
  const id = project(state).id;
  assert.throws(() => updateCreatorSection(state, 'script', id, 'skeleton', { locked: true }), { code: 'CREATOR_LOCKED' });
  assert.throws(() => updateCreatorSection(state, 'script', id, 'skeleton', { output: '待选骨架', locked: true }), { code: 'CREATOR_LOCKED' });
  state = updateCreatorSection(state, 'script', id, 'skeleton', { output: '已定结局', accepted: true, locked: true });
  assert.throws(() => updateCreatorSection(state, 'script', id, 'skeleton', { accepted: false }), { code: 'CREATOR_LOCKED' });
  state = updateCreatorSection(state, 'script', id, 'skeleton', { accepted: false, locked: false });
  assert.equal(project(state).creator.sections.skeleton.accepted, false);
  assert.equal(project(state).creator.sections.skeleton.locked, false);
});

test('archived versions retain independent story snapshots and human-readable adopted appendices', () => {
  let state = make();
  const id = project(state).id, episodeId = project(state).episodes[0].id;
  state = updateCreatorEpisode(state, 'script', id, episodeId, { result: '正式正文' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'hero', name: '原主角名', accepted: true });
  state = archiveCreatorProject(state, id, { side: 'output', includeSections: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'hero', name: '新主角名' });
  assert.equal(state.scriptLibrary[0].versions[0].story.characters[0].name, '原主角名');
  assert.match(state.scriptLibrary[0].content, /原主角名/);
  assert.doesNotMatch(state.scriptLibrary[0].content, /新主角名/);
});

test('adopted story edits preserve old item text in one restorable snapshot per manual session', () => {
  let state = make();
  const id = project(state).id;
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'hero', name: '阿青', description: '原小传', accepted: true });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'hero', description: '改后小传' });
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'character', { id: 'hero', description: '继续改小传' });
  const records = project(state).creator.records.filter(r => r.type === 'story-history' && r.operation === 'edit');
  assert.equal(records.length, 1);
  assert.equal(records[0].storySnapshot.characters[0].description, '原小传');
  state = adoptCreatorRecord(state, 'script', id, records[0].id);
  assert.equal(project(state).creator.story.characters[0].description, '原小传');
});

test('adopted story changes mark derived section texts stale without clearing their text or locked constraints', () => {
  let state = make('framework');
  const id = project(state).id;
  for (const key of ['skeleton', 'timeline', 'detail', 'episodeOutline', 'simulation']) {
    state = updateCreatorSection(state, 'script', id, key, { output: `${key}旧成果`, accepted: true, ...(key === 'skeleton' ? { locked: true } : {}) });
  }
  state = creatorDomain.upsertCreatorStoryItem(state, 'script', id, 'event', { title: '已采用的新事件', accepted: true });
  for (const key of ['skeleton', 'timeline', 'detail', 'episodeOutline', 'simulation']) {
    assert.equal(project(state).creator.sections[key].output, `${key}旧成果`);
    assert.equal(project(state).creator.sections[key].stale, true);
  }
  assert.equal(project(state).creator.sections.skeleton.locked, true);
});

test('core section changes mark dependency texts stale while the edited target stays current and explicit readoption clears stale', () => {
  let state = make('framework');
  const id = project(state).id;
  state = updateCreatorSection(state, 'script', id, 'settings', { output: '原世界规则', accepted: true });
  for (const key of ['skeleton', 'detail', 'episodeOutline', 'simulation']) state = updateCreatorSection(state, 'script', id, key, { output: `${key}旧稿`, accepted: true });
  state = updateCreatorSection(state, 'script', id, 'settings', { output: '新世界规则', accepted: true });
  assert.equal(project(state).creator.sections.settings.stale, false);
  for (const key of ['skeleton', 'detail', 'episodeOutline', 'simulation']) assert.equal(project(state).creator.sections[key].stale, true);
  state = updateCreatorSection(state, 'script', id, 'detail', { accepted: true });
  assert.equal(project(state).creator.sections.detail.stale, false);
  assert.equal(project(state).creator.sections.detail.output, 'detail旧稿');
});

test('fingerprints exclude stale unlocked derived facts while stale locked skeleton remains an active constraint', () => {
  let state = make('framework');
  const id = project(state).id, target = { section: 'events' };
  state = updateCreatorSection(state, 'script', id, 'detail', { output: '旧细纲', accepted: true, stale: true });
  const staleDetail = creatorInputFingerprint(project(state), target);
  state = updateCreatorSection(state, 'script', id, 'detail', { output: '另一份待复核细纲', stale: true });
  assert.equal(creatorInputFingerprint(project(state), target), staleDetail);
  state = updateCreatorSection(state, 'script', id, 'skeleton', { output: '固定结局', accepted: true, locked: true });
  const locked = creatorInputFingerprint(project(state), target);
  state = updateCreatorSection(state, 'script', id, 'skeleton', { stale: true });
  assert.equal(creatorInputFingerprint(project(state), target), locked);
  state = updateCreatorSection(state, 'script', id, 'skeleton', { locked: false, stale: true });
  assert.notEqual(creatorInputFingerprint(project(state), target), locked);
});
test('necessary unadopted reference identity changes invalidate context but unrelated candidate material does not',()=>{
 let state=make('framework');const id=project(state).id,target={section:'simulation'};
 state=creatorDomain.upsertCreatorStoryItem(state,'script',id,'character',{id:'candidate',name:'尚未采用角色',description:'待定小传'});
 state=creatorDomain.upsertCreatorStoryItem(state,'script',id,'event',{id:'event',title:'当前事件',characterIds:['candidate'],accepted:true});
 const before=creatorInputFingerprint(project(state),target);
 state=creatorDomain.upsertCreatorStoryItem(state,'script',id,'character',{id:'candidate',description:'新待定小传'});
 assert.equal(creatorInputFingerprint(project(state),target),before);
 state=creatorDomain.upsertCreatorStoryItem(state,'script',id,'character',{id:'candidate',name:'改名后的引用角色'});
 assert.notEqual(creatorInputFingerprint(project(state),target),before);
});
test('master editing respects explicit node boundaries even when dialogue mentions an episode number',()=>{
 let state=make();const id=project(state).id;
 state=addCreatorEpisode(state,'script',id,{title:'第2集'});const ids=project(state).episodes.map(e=>e.id);
 state=editCreatorMaster(state,'script',id,'output','【第1集】\n第1集\n场景正文\n【第2集】\n第二集收录后修改');
 assert.deepEqual(project(state).episodes.map(e=>e.id),ids);
 assert.equal(project(state).episodes[1].result,'第二集收录后修改');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStoryboardEpisodes } = require('../src/storyboard-identity.cjs');
const { patchShot, mergeDirectorEpisodes } = require('../src/storyboard-merge.cjs');

const legacyEpisodes = () => Array.from({ length: 70 }, (_, index) => ({
  title: `第${index + 1}集`, content: `${index + 1}-1 场景\n本集剧本内容`, prompts: [],
}));

test('legacy 70-episode imports have distinct selectable identities; normalization does not mutate input', async () => {
  const source = legacyEpisodes(), before = structuredClone(source);
  source.unshift({ kind: 'setting', title: '设定和小传', content: '设定' });
  const normalized = normalizeStoryboardEpisodes(source);
  assert.equal(new Set(normalized.map(ep => ep.id)).size, 71);
  assert.deepEqual(source.slice(1), before);
  assert.deepEqual(normalizeStoryboardEpisodes(normalized), normalized);
  const client = await import('../../core/storyboardIdentity.js');
  assert.deepEqual(client.normalizeStoryboardEpisodes(source), normalized);
  const reversed = normalizeStoryboardEpisodes([...source].reverse());
  assert.equal(reversed.find(ep => ep.title === '第15集').id, normalized.find(ep => ep.title === '第15集').id);
});

test('creating in legacy episodes 15 and 70 persists independently and survives refresh from the unmodified director', () => {
  const source = legacyEpisodes();
  const selections = normalizeStoryboardEpisodes(source);
  let current = patchShot(source, { episodeId: selections[14].id, operation: 'create', scene: '15-1', shotId: 'first-15' });
  current = patchShot(current, { episodeId: selections[69].id, operation: 'create', scene: '70-1', shotId: 'first-70' });
  current = patchShot(current, { episodeId: selections[14].id, operation: 'create', scene: '15-1', shotId: 'second-15' });
  current = patchShot(current, { episodeId: selections[14].id, shotId: 'first-15', base: { content: '' }, updates: { content: '分镜内容', generationConfig: { references: [{ id: 'asset-15' }] } } });
  const refreshed = mergeDirectorEpisodes(current, source);
  assert.equal(refreshed[0].prompts.length, 0);
  assert.deepEqual(refreshed[14].prompts.map(p => p.label), ['15-1-1', '15-1-2']);
  assert.equal(refreshed[14].prompts[0].content, '分镜内容');
  assert.equal(refreshed[14].prompts[0].generationConfig.references[0].id, 'asset-15');
  assert.equal(refreshed[69].prompts[0].label, '70-1-1');
  assert.deepEqual(mergeDirectorEpisodes(refreshed, source), refreshed);
});

test('numeric and duplicated IDs select the intended episode after native select string conversion', () => {
  const source = legacyEpisodes().slice(0, 4);
  source[0].id = 1; source[1].id = 2; source[2].id = 'repeated'; source[3].id = 'repeated';
  const normalized = normalizeStoryboardEpisodes(source);
  assert.equal(normalized[0].id, '1');
  assert.equal(normalized[1].id, '2');
  assert.equal(new Set(normalized.map(ep => ep.id)).size, 4);
  for (let i = 0; i < 4; i++) {
    const updated = patchShot(source, { episodeId: normalized[i].id, operation: 'create', scene: `${i + 1}-1`, shotId: `shot-${i}` });
    assert.equal(updated[i].prompts[0].id, `shot-${i}`);
    assert.equal(updated.filter(ep => ep.prompts.length).length, 1);
  }
});

test('source prompts without IDs retain collaboration edits on refresh and preserve separate shot identities', () => {
  const incoming = legacyEpisodes().slice(0, 1);
  incoming[0].prompts = [{ label: '1-1-1', content: '初稿' }, { label: '1-1-2', content: '第二条' }];
  let current = mergeDirectorEpisodes([], incoming);
  const id = current[0].prompts[0].id;
  current = patchShot(current, { episodeId: current[0].id, shotId: id, base: { content: '初稿' }, updates: { content: '协作者修改' } });
  incoming[0].prompts[0].content = '导演修改';
  const merged = mergeDirectorEpisodes(current, incoming);
  assert.equal(merged[0].prompts.length, 2);
  assert.equal(merged[0].prompts[0].id, id);
  assert.equal(merged[0].prompts[0].content, '协作者修改');
  assert.equal(merged[0].prompts[0].sourceConflict, '导演修改');
});

test('director IDs and legacy collaboration copies reconcile without duplicated episodes or lost selection',()=>{
 const source=legacyEpisodes();source.forEach((ep,i)=>ep.id=`director-${i+1}`);
 const legacy=legacyEpisodes();legacy[14].prompts=[{label:'15-1-1',content:'导演初稿'}];source[14].prompts=[{id:'source-shot',label:'15-1-1',content:'导演初稿'}];
 let current=mergeDirectorEpisodes(legacy,source);assert.equal(current.length,70);
 const selected=current[14].id,shotId=current[14].prompts[0].id;
 current=patchShot(current,{episodeId:selected,shotId,base:{content:'导演初稿'},updates:{content:'协作修改'}});
 source[14].prompts[0].content='导演新稿';
 const refreshed=mergeDirectorEpisodes(current,source);
 assert.equal(refreshed.length,70);assert.equal(refreshed[14].id,selected);assert.equal(refreshed[14].prompts.length,1);assert.equal(refreshed[14].prompts[0].id,shotId);assert.equal(refreshed[14].prompts[0].content,'协作修改');assert.equal(refreshed[14].prompts[0].sourceConflict,'导演新稿');
 assert.deepEqual(mergeDirectorEpisodes(refreshed,source),refreshed);
});

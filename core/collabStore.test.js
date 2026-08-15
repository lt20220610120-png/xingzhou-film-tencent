import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAB_ROLES, sectionsForRole, canSee, parseAssetName, findBaseMates,
  parseArtAnalysis, buildAssetRows, assetsForEpisode, episodeNumbersFromAssets,
  buildImagePrompt, summarizeActivity,
} from './collabStore.js';

test('三种协作身份的功能区权限', () => {
  assert.deepEqual(sectionsForRole('producer'), ['info', 'art', 'assets', 'storyboard', 'invite', 'stats', 'group']);
  assert.deepEqual(sectionsForRole('artist'), ['info', 'art', 'assets', 'group']);
  assert.deepEqual(sectionsForRole('collaborator'), ['storyboard', 'group']);
  assert.equal(canSee('artist', 'storyboard'), false);
  assert.equal(canSee('artist', 'invite'), false);
  assert.equal(canSee('artist', 'stats'), false);
  assert.equal(canSee('collaborator', 'info'), false);
  assert.equal(canSee('collaborator', 'art'), false);
  assert.equal(canSee('collaborator', 'assets'), false);
  assert.equal(canSee('collaborator', 'invite'), false);
  assert.equal(canSee('collaborator', 'stats'), false);
  assert.equal(canSee('producer', 'stats'), true);
  assert.equal(COLLAB_ROLES.producer, '制片');
});

test('资产名解析：角色-服饰拆分', () => {
  assert.deepEqual(parseAssetName('【姜蓝-剑道服】'), { base: '姜蓝', variant: '剑道服' });
  assert.deepEqual(parseAssetName('【蜡烛】'), { base: '蜡烛', variant: '' });
  assert.deepEqual(parseAssetName('【梨园戏楼-日-内】'), { base: '梨园戏楼', variant: '日-内' });
});

test('同角色不同服饰可以互相作为参考（@引用）', () => {
  const assets = [
    { name: '【姜蓝-剑道服】', category: 'character' },
    { name: '【姜蓝-便服】', category: 'character' },
    { name: '【云锦瑟-戏服】', category: 'character' },
  ];
  const mates = findBaseMates(assets, '【姜蓝-便服】');
  assert.equal(mates.length, 1);
  assert.equal(mates[0].name, '【姜蓝-剑道服】');
});

const SAMPLE = `### 第1集
人物：
- 【姜蓝-剑道服】（首次）脸型五官：面容清俊，剑眉星目。
穿着：深蓝色立领剑道服。
- 【贼寇-军装】（群演，首次）土黄色军装。
场景：
- 【梨园戏楼-日-内】（首次）木质戏台，暖黄烛光。
道具：
- 【蜡烛】（首次）白蜡红芯。

### 第2集
人物：
- 【姜蓝-剑道服】（复用自第1集）
- 【姜蓝-便服】（首次，换装）灰色粗布便服。
场景：
- 【南家大厅-日-内】（首次）雕花木厅。
道具：
- 【婚书】（首次）红纸金字。

## 人物总览
- 【姜蓝】（主角）
  - 【姜蓝-剑道服】（首次：第1集）
`;

test('美术清单解析：按集/类别/复用识别', () => {
  const parsed = parseArtAnalysis(SAMPLE);
  assert.equal(parsed.episodes.length, 2);
  const ep1 = parsed.episodes[0];
  assert.equal(ep1.episode, 1);
  assert.equal(ep1.character.length, 2);
  assert.equal(ep1.scene.length, 1);
  assert.equal(ep1.prop.length, 1);
  assert.match(ep1.character[0].description, /剑眉星目/);
  assert.match(ep1.character[0].description, /深蓝色立领剑道服/);
  const ep2 = parsed.episodes[1];
  assert.equal(ep2.character[0].reuseOf, 1);
  assert.equal(ep2.character[0].description, '');
  assert.equal(ep2.character[1].name, '【姜蓝-便服】');
});

test('资产行构建：同名合并、集数聚合、复用指回首次集', () => {
  const rows = buildAssetRows(parseArtAnalysis(SAMPLE));
  const jl = rows.find((r) => r.name === '【姜蓝-剑道服】');
  assert.deepEqual(jl.episodes, [1, 2]);
  assert.equal(jl.first_episode, 1);
  assert.match(jl.description, /剑眉星目/);
  const bf = rows.find((r) => r.name === '【姜蓝-便服】');
  assert.deepEqual(bf.episodes, [2]);
  assert.equal(rows.filter((r) => r.category === 'prop').length, 2);
  assert.equal(rows.filter((r) => r.category === 'scene').length, 2);
});

test('按集查询资产：复用标记正确', () => {
  const rows = buildAssetRows(parseArtAnalysis(SAMPLE)).map((r, i) => ({ ...r, id: String(i) }));
  const ep2chars = assetsForEpisode(rows, 2, 'character');
  const reusedNames = ep2chars.filter((a) => a.reused).map((a) => a.name);
  assert.deepEqual(reusedNames, ['【姜蓝-剑道服】']);
  assert.deepEqual(episodeNumbersFromAssets(rows), [1, 2]);
});

test('生图提示词：换装时并入参考资产描述', () => {
  const asset = { name: '【姜蓝-便服】', description: '灰色粗布便服。' };
  const ref = { name: '【姜蓝-剑道服】', description: '剑眉星目，深蓝色剑道服。' };
  const prompt = buildImagePrompt(asset, ref, 'AI真人', '古代玄幻');
  assert.match(prompt, /画风：AI真人/);
  assert.match(prompt, /题材设定：古代玄幻/);
  assert.match(prompt, /保持脸型五官发型身材完全一致/);
  assert.match(prompt, /剑眉星目/);
  assert.match(prompt, /灰色粗布便服/);
  const solo = buildImagePrompt(asset, null, '', '');
  assert.equal(solo, '灰色粗布便服。');
});

test('数据统计：按成员聚合操作', () => {
  const members = [
    { user_id: 'u1', username: 'a', display_name: '小美', role: 'artist' },
    { user_id: 'u2', username: 'b', display_name: '', role: 'collaborator' },
  ];
  const activity = [
    { user_id: 'u1', username: '小美', action: 'generate-image', created_at: '2026-08-07T10:00:00Z' },
    { user_id: 'u1', username: '小美', action: 'generate-image', created_at: '2026-08-07T11:00:00Z' },
    { user_id: 'u2', username: 'b', action: 'generate-video', created_at: '2026-08-07T09:00:00Z' },
    { user_id: 'u2', username: 'b', action: 'message', created_at: '2026-08-07T09:10:00Z' },
  ];
  const rows = summarizeActivity(activity, members);
  const artist = rows.find((r) => r.userId === 'u1');
  assert.equal(artist.images, 2);
  assert.equal(artist.lastActive, '2026-08-07T11:00:00Z');
  const collab = rows.find((r) => r.userId === 'u2');
  assert.equal(collab.videos, 1);
  assert.equal(collab.messages, 1);
});

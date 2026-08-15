import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeCloudEpisodes } from './directorCloudProjects.js';
import { withAssetPrefix, buildImagePrompt, CHARACTER_PROMPT_PREFIX, SCENE_PROMPT_PREFIX } from './collabStore.js';

describe('云端提示词双向合并', () => {
  it('本地新生成的提示词在云端刷新后保留（闪跳修复核心）', () => {
    const local = [{ id: 'e1', title: '第一集', prompts: [
      { id: 'a', label: '1-1-1', content: '云端已有' },
      { id: 'b', label: '1-1-2', content: '本地新生成' },
    ] }];
    const cloud = [{ id: 'e1', title: '第一集', prompts: [
      { id: 'a', label: '1-1-1', content: '云端已有' },
    ] }];
    const merged = mergeCloudEpisodes(local, cloud);
    assert.equal(merged[0].prompts.length, 2);
    assert.ok(merged[0].prompts.some((p) => p.id === 'b'));
  });

  it('云端协作者生成的提示词合并进本地（同步修复核心）', () => {
    const local = [{ id: 'e1', prompts: [{ id: 'a', label: '1-1-1', content: 'A' }] }];
    const cloud = [{ id: 'e1', prompts: [
      { id: 'a', label: '1-1-1', content: 'A' },
      { id: 'c', label: '1-2-1', content: '对方生成的' },
    ] }];
    const merged = mergeCloudEpisodes(local, cloud);
    assert.equal(merged[0].prompts.length, 2);
    assert.ok(merged[0].prompts.some((p) => p.content === '对方生成的'));
  });

  it('墓碑防复活：本地删除过的提示词不会因云端还有而回来', () => {
    const local = [{ id: 'e1', prompts: [], deletedPromptIds: ['dead'] }];
    const cloud = [{ id: 'e1', prompts: [{ id: 'dead', label: '1-1-1', content: '已删除' }] }];
    const merged = mergeCloudEpisodes(local, cloud);
    assert.equal(merged[0].prompts.length, 0);
    assert.ok(merged[0].deletedPromptIds.includes('dead'));
  });

  it('同 id 提示词取较新的编辑版本', () => {
    const local = [{ id: 'e1', prompts: [{ id: 'a', content: '新', editedAt: '2026-08-13T10:00:00Z' }] }];
    const cloud = [{ id: 'e1', prompts: [{ id: 'a', content: '旧', editedAt: '2026-08-12T10:00:00Z' }] }];
    const merged = mergeCloudEpisodes(local, cloud);
    assert.equal(merged[0].prompts[0].content, '新');
  });

  it('本地独有的新分集保留', () => {
    const local = [{ id: 'e1', prompts: [] }, { id: 'e2-local', prompts: [{ id: 'x', content: 'X' }] }];
    const cloud = [{ id: 'e1', prompts: [] }];
    const merged = mergeCloudEpisodes(local, cloud);
    assert.equal(merged.length, 2);
  });
});

describe('资产描述固定前缀', () => {
  it('人物描述自动加上真人拍摄前缀', () => {
    const out = withAssetPrefix('character', '尖下巴，柳叶眉');
    assert.ok(out.startsWith(CHARACTER_PROMPT_PREFIX));
    assert.ok(out.includes('尖下巴'));
  });
  it('场景描述自动加上无人物前缀', () => {
    const out = withAssetPrefix('scene', '月银沙漠');
    assert.ok(out.startsWith(SCENE_PROMPT_PREFIX));
  });
  it('道具描述自动加纯白色背景前缀，已有前缀不重复', () => {
    const out = withAssetPrefix('prop', '一把剑');
    assert.equal(out, '纯白色背景。\n一把剑');
    const once = withAssetPrefix('prop', out);
    assert.equal(once, out);
  });
  it('生图提示词包含人物前缀', () => {
    const prompt = buildImagePrompt({ category: 'character', name: '【张三-便服】', description: '描述' }, null, 'AI真人', '现代');
    assert.ok(prompt.includes(CHARACTER_PROMPT_PREFIX));
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createInitialState,
  appendDirectorPromptHistory, collectDirectorPromptHistory,
  groupDirectorPromptHistory, deleteDirectorPromptsEverywhere,
  updateDirectorPromptEverywhere, buildPromptHistoryExport,
} from './projectStore.js';

const baseState = () => ({
  ...createInitialState(),
  directorProjects: [{
    id: 'p1',
    name: '测试项目',
    masterScript: '第 1 集\n内容',
    episodes: [
      { id: 'e1', title: '第一集', content: '内容', prompts: [
        { id: 'a', label: '1-1-1', content: '提示词A' },
        { id: 'b', label: '1-2-4', content: '提示词B' },
      ] },
      { id: 'e2', title: '第二集', content: '内容2', prompts: [
        { id: 'c', label: '2-1-1', content: '提示词C' },
      ] },
    ],
  }],
});

describe('导演历史提示词', () => {
  it('collect 汇总历史与分集提示词并去重', () => {
    const project = baseState().directorProjects[0];
    const all = collectDirectorPromptHistory(project);
    assert.equal(all.length, 3);
    const withHistory = { ...project, promptHistory: [{ id: 'a', label: '1-1-1', content: '历史版A' }] };
    const merged = collectDirectorPromptHistory(withHistory);
    assert.equal(merged.length, 3);
    assert.equal(merged.find((x) => x.id === 'a').content, '历史版A');
  });

  it('append 把新提示词写入历史，旧提示词自动回填', () => {
    let state = baseState();
    state = appendDirectorPromptHistory(state, 'p1', [{ id: 'd', label: '1-5-9', content: '新提示词' }]);
    const history = state.directorProjects[0].promptHistory;
    assert.equal(history.length, 4);
    assert.ok(history.some((x) => x.id === 'd'));
  });

  it('删除分集（改总剧本）后历史提示词仍在', () => {
    let state = baseState();
    state = appendDirectorPromptHistory(state, 'p1', []);
    state = {
      ...state,
      directorProjects: state.directorProjects.map((p) => ({ ...p, episodes: [] })),
    };
    assert.equal(collectDirectorPromptHistory(state.directorProjects[0]).length, 3);
  });

  it('手动删除同时从历史与分集移除', () => {
    let state = baseState();
    state = appendDirectorPromptHistory(state, 'p1', []);
    state = deleteDirectorPromptsEverywhere(state, 'p1', ['a', 'c']);
    const project = state.directorProjects[0];
    assert.equal(collectDirectorPromptHistory(project).length, 1);
    assert.equal(project.episodes[0].prompts.length, 1);
    assert.equal(project.episodes[1].prompts.length, 0);
  });

  it('编辑同步历史与分集', () => {
    let state = baseState();
    state = appendDirectorPromptHistory(state, 'p1', []);
    state = updateDirectorPromptEverywhere(state, 'p1', 'b', { content: '改过的B' });
    const project = state.directorProjects[0];
    assert.equal(project.promptHistory.find((x) => x.id === 'b').content, '改过的B');
    assert.equal(project.episodes[0].prompts.find((x) => x.id === 'b').content, '改过的B');
  });

  it('按集数首段分组：卡片 1 收纳 1-1-1、1-2-4、1-5-9', () => {
    const groups = groupDirectorPromptHistory([
      { id: 'a', label: '1-1-1', content: 'A' },
      { id: 'd', label: '1-5-9', content: 'D' },
      { id: 'b', label: '1-2-4', content: 'B' },
      { id: 'c', label: '2-1-1', content: 'C' },
      { id: 'x', label: '10-1-1', content: 'X' },
    ]);
    assert.deepEqual(groups.map((g) => g.key), ['1', '2', '10']);
    assert.deepEqual(groups[0].prompts.map((p) => p.label), ['1-1-1', '1-2-4', '1-5-9']);
  });

  it('导出文档带 x-x-x 标题且包含全部提示词', () => {
    const project = baseState().directorProjects[0];
    const text = buildPromptHistoryExport(project);
    assert.match(text, /《测试项目》提示词导出/);
    assert.match(text, /【1-1-1】\n提示词A/);
    assert.match(text, /【2-1-1】\n提示词C/);
  });
});

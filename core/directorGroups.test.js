import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  createDirectorGroup,
  renameDirectorGroup,
  updateDirectorProject,
  deleteDirectorGroup,
} from './projectStore.js';

const withProject = () => ({
  ...createInitialState(),
  directorProjects: [{ id: 'p1', name: '旧项目名', groupId: null, episodes: [], updatedAt: '' }],
});

test('导演分组自动按顺序命名', () => {
  let state = createDirectorGroup(withProject());
  state = createDirectorGroup(state);
  assert.deepEqual(state.directorGroups.map(group => group.name), ['分组 1', '分组 2']);
});

test('导演项目可以重命名并移动到分组', () => {
  let state = createDirectorGroup(withProject());
  const groupId = state.directorGroups[0].id;
  state = updateDirectorProject(state, 'p1', { name: '新项目名', groupId });
  assert.equal(state.directorProjects[0].name, '新项目名');
  assert.equal(state.directorProjects[0].groupId, groupId);
});

test('分组可以重命名，删除分组只把项目移回未分组', () => {
  let state = createDirectorGroup(withProject());
  const groupId = state.directorGroups[0].id;
  state = renameDirectorGroup(state, groupId, '古装短剧');
  state = updateDirectorProject(state, 'p1', { groupId });
  state = deleteDirectorGroup(state, groupId);
  assert.equal(state.directorGroups.length, 0);
  assert.equal(state.directorProjects[0].groupId, null);
});

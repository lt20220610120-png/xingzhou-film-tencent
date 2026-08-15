const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('受邀导演云项目会转换并加入导演工作台，而不是只更新已有本机项目', async () => {
  const { reconcileDirectorCloudProjects } = await import('../core/directorCloudProjects.js');
  const local = [{ id: 'local-owner', name: '本机项目', episodes: [] }];
  const cloud = [{ id: 'cloud-invited', name: '受邀项目', script: '总剧本', episodes: [{ id: 'ep1', title: '第一集' }], myRole: 'collaborator', locked: false, analysis_output: 'owner-local-id' }];
  const result = reconcileDirectorCloudProjects(local, cloud);
  const invited = result.find((project) => project.cloudProjectId === 'cloud-invited');
  assert.ok(invited, '受邀云项目必须出现在导演工作台');
  assert.equal(invited.sourceType, 'cloud');
  assert.equal(invited.cloudRole, 'collaborator');
  assert.equal(invited.masterScript, '总剧本');
});

test('只有当前项目的云角色为制片或制片自己的本机项目才显示协作管理按钮', async () => {
  const { canManageDirectorCollab } = await import('../core/directorCloudProjects.js');
  assert.equal(canManageDirectorCollab({ sourceType: 'cloud', cloudRole: 'collaborator' }, true), false);
  assert.equal(canManageDirectorCollab({ sourceType: 'cloud', cloudRole: 'producer' }, true), true);
  assert.equal(canManageDirectorCollab({ sourceType: 'upload' }, true), true);
  assert.equal(canManageDirectorCollab({ sourceType: 'upload' }, false), false);
  const hub = read('src/v06/ProjectCardHub.jsx');
  assert.match(hub, /canManageCollab\(project\)/);
});

test('快速模式提示词顶部提供数字定位器并滚动到对应提示词卡', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /prompt-locator/);
  assert.match(director, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(director, /ref=\{\(node\) =>/);
  assert.match(director, />\{index \+ 1\}<\/button>/);
});

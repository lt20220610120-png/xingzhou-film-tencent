const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演工作台提供独立云端管理页面入口和返回操作', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /云端管理/);
  assert.match(director, /DirectorCloudManager/);
  assert.match(director, /cloudManagerOpen/);
  assert.match(director, /返回导演工作台/);
});

test('云端管理页把仍被项目协作读取的导演项目虚化并禁用删除', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /collaborationLinked/);
  assert.match(director, /director-cloud-row\$\{collaborationLinked/);
  assert.match(director, /disabled=\{collaborationLinked\}/);
  assert.match(director, /请先到“项目协作”删除/);
});

test('服务端在协作活跃期和三天恢复期保护关联导演项目', () => {
  const server = read('cloud-backend/src/collab.cjs');
  const repository = read('cloud-backend/src/repository-extras.cjs');
  const list = server.match(/if \(action === 'director-project-list'\)[\s\S]*?(?=\n  if \()/)?.[0] || '';
  const remove = repository.match(/async deleteDirectorProject\([\s\S]*?(?=\n    async )/)?.[0] || '';
  assert.match(list, /referencesDirector/);
  assert.match(list, /collaborationLinked/);
  assert.match(list, /sourceProtection\(link\)/);
  assert.match(remove, /sourceProtection\(link\)!=='expired'\)\)throw statusError\(409/);
});

test('云端删除检查关联中的旧本地导演项目 ID', () => {
  const repository = read('cloud-backend/src/repository-extras.cjs');
  const remove = repository.match(/async deleteDirectorProject\([\s\S]*?(?=\n    async )/)?.[0] || '';
  assert.match(remove, /aliases=\[row\.id,'cloud-'\+row\.id,row\.analysis_output\]/);
  assert.match(remove, /directorRow\(row\)/);
  assert.match(remove, /collab_source_markers\(c\.genre\) && \$2::text\[\]/);
});

test('普通项目卡不直接删除任一云端关联导演项目，统一进入云端管理', async () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /canDeleteProject=\{isLocalRecyclableDirector\}/);
  const {isLocalRecyclableDirector}=await import('../core/projectRecycle.js');
  assert.equal(isLocalRecyclableDirector({id:'local'}),true);
  for(const marker of [{cloudProjectId:'cloud'},{collaborationProjectId:'collab'},{sourceType:'cloud'}])assert.equal(isLocalRecyclableDirector({id:'linked',...marker}),false);
  assert.match(director, /canDeleteProject, onOpenCloudManager/);
});

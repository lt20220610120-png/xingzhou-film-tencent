const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演提示词顶部支持选择、多选、全选和确认删除', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /selectedPromptIds/);
  assert.match(ui, /选择删除/);
  assert.match(ui, /全选/);
  assert.match(ui, /删除选中/);
  assert.match(ui, /DeleteConfirm/);
  assert.match(ui, /deleteDirectorPromptsEverywhere\(s, project\.id, \[\.\.\.selectedPromptIds\]\)/);
});

test('项目协作支持美术和协作者复合身份并合并权限', () => {
  const store = read('core/collabStore.js');
  const ui = read('src/v06/CollabWorkspace.jsx');
  const edge = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(store, /artist_collaborator/);
  assert.match(store, /artist_collaborator:[^\n]*info[^\n]*art[^\n]*assets[^\n]*storyboard[^\n]*group/);
  assert.match(ui, /美术 \+ 协作者/);
  assert.match(edge, /artist_collaborator/);
  assert.match(edge, /existing/);
});

test('制片邀请页面展示成员并可踢出，移出后成员记录消失', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const edge = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(ui, /成员<\/span><span>账号<\/span><span>身份<\/span><span>加入时间<\/span><span>操作/);
  assert.match(ui, /移出后对方将立即看不到这个项目/);
  assert.match(edge, /member-remove/);
  assert.match(edge, /delete\(\)\.eq\('id',body\.memberId\)\.eq\('project_id',projectId\)/);
});

test('项目协作分镜提示词可编辑并只写入协作项目副本', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /saveStoryboardPrompt/);
  assert.match(ui, /collabUpdateProject/);
  assert.match(ui, /保存提示词/);
  assert.doesNotMatch(ui, /saveStoryboardPrompt[\s\S]{0,700}directorCollabUpdateProject/);
});

test('同步导演提示词只有制片可见且只替换剧本和分集提示词', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /isProducer/);
  assert.match(ui, /isProducer &&[^\n]*同步导演提示词/);
  assert.match(ui, /scope:\s*'director-sync'[\s\S]*updates:\s*\{\s*script:\s*sourceScript,\s*episodes:\s*nextEpisodes\s*\}/);
  assert.doesNotMatch(ui, /updates:\s*\{[^}]*assets/);
  assert.match(read('supabase/functions/xingzhou-api/index.ts'), /scope==='director-sync'&&m\.role!=='producer'/);
});

test('导演协作与项目协作列表使用严格类型过滤，项目协作不会逆向生成导演卡片', () => {
  const edge = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(edge, /isDirectorProject/);
  assert.match(edge, /director-project-list[\s\S]*filter\(isDirectorProject\)/);
  assert.match(edge, /project-list[\s\S]*filter\(isCollabProject\)/);
});

test('项目协作踢出后打开的项目遇到访问拒绝会退出并刷新列表', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /project_access_denied/);
  assert.match(ui, /setProject\(null\)/);
  assert.match(ui, /loadProjects\(\)/);
});

test('导演域管理动作拒绝项目协作项目，项目关联只能由制片执行', () => {
  const edge = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(edge, /project-link-director'[\s\S]*m\.role!=='producer'/);
  assert.match(edge, /director-project-get'[\s\S]*isDirectorProject\(data\)/);
  assert.match(edge, /director-members-list'[\s\S]*isDirectorProject/);
});

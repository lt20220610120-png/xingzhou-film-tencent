// 项目协作（v1.6.0）接线回归测试：IPC / preload / UI / 权限
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('main.cjs 注册了全部协作 IPC 通道并初始化服务', () => {
  const main = read('electron/main.cjs');
  for (const channel of [
    'collab-is-producer', 'collab-admin-set-producer', 'collab-create-project', 'collab-list-projects',
    'collab-get-project', 'collab-update-project', 'collab-delete-project', 'collab-restore-project', 'collab-replace-assets', 'collab-list-assets',
    'collab-update-asset', 'collab-generate-asset-image', 'collab-upload-asset-image', 'collab-attach-generated-asset-image',
    'collab-list-members', 'collab-add-member', 'collab-update-member-role', 'collab-remove-member',
    'collab-list-tasks', 'collab-assign-task', 'collab-update-task',
    'collab-list-media', 'collab-generate-video', 'collab-upload-media', 'collab-record-generated-media', 'collab-delete-media',
    'collab-list-messages', 'collab-send-message', 'collab-send-image', 'collab-get-stats',
  ]) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel}'`), `缺少 IPC：${channel}`);
  }
  assert.match(main, /collabService=createCollabService\(readCloudSession\)/);
});

test('preload.cjs 暴露协作 API', () => {
  const preload = read('electron/preload.cjs');
  for (const fn of ['collabIsProducer', 'collabCreateProject', 'collabListProjects', 'collabGetProject', 'collabReplaceAssets', 'collabGenerateAssetImage', 'collabAttachGeneratedAssetImage', 'collabAddMember', 'collabAssignTask', 'collabGenerateVideo', 'collabRecordGeneratedMedia', 'collabListMessages', 'collabSendMessage', 'collabSendImage', 'collabGetStats', 'collabAdminSetProducer']) {
    assert.match(preload, new RegExp(`${fn}:`), `preload 缺少 ${fn}`);
  }
});

test('App.jsx：项目协作位于导演工作台与画布之间，且有浏览器 fallback', () => {
  const app = read('src/App.jsx');
  const idxDirector = app.indexOf("['director', Film, '导演工作台']");
  const idxCollab = app.indexOf("['collab', Users, '项目协作']");
  const idxCanvas = app.indexOf("['canvas', Palette, '画布']");
  assert.ok(idxDirector > -1 && idxCollab > -1 && idxCanvas > -1, '导航项缺失');
  assert.ok(idxDirector < idxCollab && idxCollab < idxCanvas, '项目协作必须在导演工作台与画布之间');
  assert.match(app, /nav === 'collab' && <CollabWorkspace/);
  assert.match(app, /collabIsProducer: \(\) => Promise\.resolve\(false\)/);
});

test('CollabWorkspace：身份权限过滤与七个功能区', () => {
  const ws = read('src/v06/CollabWorkspace.jsx');
  assert.match(ws, /sectionsForRole\(myRole\)/);
  assert.match(ws, /section === 'invite' && myRole === 'producer'/);
  assert.match(ws, /section === 'stats' && myRole === 'producer'/);
  for (const section of ['InfoSection', 'ArtSection', 'AssetsSection', 'StoryboardSection', 'InviteSection', 'StatsSection', 'GroupSection']) {
    assert.match(ws, new RegExp(`function ${section}`), `缺少功能区组件 ${section}`);
  }
  // 信息读取：画风选择 / 题材填写 / 分析模型 / 锁定 Skill
  assert.match(ws, /COLLAB_STYLES\.map/);
  assert.match(ws, /COLLAB_ART_SKILL_NAME/);
  assert.match(ws, /buildCollabAnalysisMessages/);
  // 美术：复用与 @参考
  assert.match(ws, /findBaseMates/);
  assert.match(ws, /buildImagePrompt/);
  // 实时刷新轮询
  assert.match(ws, /setInterval\(refreshProject/);
});

test('collabStore：权限矩阵符合产品设定', async () => {
  const store = await import('../core/collabStore.js');
  assert.deepEqual(store.sectionsForRole('artist'), ['info', 'art', 'assets', 'group']);
  assert.deepEqual(store.sectionsForRole('collaborator'), ['storyboard', 'group']);
});

test('项目删除采用三天恢复窗口字段', () => {
  const sql = read('scripts/supabase-collab-setup.sql');
  assert.match(sql, /deleted_at timestamptz/);
  assert.match(sql, /purge_after timestamptz/);
  const service = read('electron/collab-service.cjs');
  assert.match(service, /project-restore/);
  assert.match(service, /project-delete/);
});

test('collab-service：制片专属操作有权限守卫', () => {
  const service = read('electron/collab-service.cjs');
  assert.match(service, /gateway/);
  // 腾讯云版改为服务端签名 + COS 直传，不再把整个文件 base64 塞进 JSON。
  assert.match(service, /media-upload-url/);
  assert.doesNotMatch(service, /SECRET_KEY|sb_secret_|\/rest\/v1\//i);
  assert.doesNotMatch(service, /COS_SECRET|secretKey/);
});

test('管理后台可设定制片身份', () => {
  const admin = read('src/v06/AdminPanel.jsx');
  assert.match(admin, /collabAdminSetProducer/);
  assert.match(admin, /制片/);
});

test('Edge Function 支持开启协作项目及项目读取动作', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  for (const action of ['project-create', 'project-list', 'project-get', 'assets-list', 'asset-create']) {
    assert.ok(fn.includes(`'${action}'`) || fn.includes(`action==='${action}'`), `Edge Function 缺少 ${action}`);
  }
  assert.match(fn, /collab_projects/);
  assert.match(fn, /collab_members/);
});

test('Edge Function 支持管理后台、信息读取保存和数据统计动作', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  for (const action of ['admin-list-users', 'admin-list-invites', 'admin-create-invite', 'admin-set-banned', 'admin-delete-user', 'admin-disable-invite', 'admin-set-producer', 'project-update', 'asset-create', 'stats-get', 'members-list', 'member-add', 'member-role', 'member-remove', 'tasks-list', 'task-assign', 'task-update', 'media-list', 'media-record', 'media-delete', 'messages-list', 'message-send', 'upload-media']) {
    assert.ok(fn.includes(`'${action}'`) || fn.includes(`action==='${action}'`), `Edge Function 缺少 ${action}`);
  }
});

test('内置美术 Skill 锁死且包含分级输出规则', async () => {
  const mod = await import('../core/collabArtSkill.js');
  assert.match(mod.COLLAB_ART_SKILL, /第一级：集/);
  assert.match(mod.COLLAB_ART_SKILL, /人物：\/ 场景：\/ 道具：/);
  assert.match(mod.COLLAB_ART_SKILL, /复用免描/);
  const messages = mod.buildCollabAnalysisMessages({ style: 'AI真人', genre: '现代都市', script: '第1集……' });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /画风：AI真人/);
  assert.match(messages[0].content, /题材与时代：现代都市/);
  const ws = read('src/v06/CollabWorkspace.jsx');
  assert.doesNotMatch(ws, /selectSkill.*COLLAB_ART_SKILL/, 'Skill 必须锁定不可选择');
});

test('collab.css 已挂载且生成按钮防换行', () => {
  const mainEntry = read('src/main.jsx');
  assert.match(mainEntry, /import '\.\/collab\.css'/);
  const css = read('src/collab.css');
  assert.match(css, /\.collab-analyze-btn\{white-space:nowrap/);
  assert.match(css, /\.collab-stage\{flex:1;min-width:0;overflow-y:auto/);
});

test('行舟 AI 浮动按钮可在窗口内拖动且拖动不会误打开会话', () => {
  const app = read('src/App.jsx');
  const css = read('src/v100-exact.css');
  assert.match(app, /DraggableAIButton/);
  assert.match(app, /onPointerMove=\{moveDrag\}/);
  assert.match(app, /suppressClick/);
  assert.match(css, /global-ai-launch\.draggable/);
});

test('分镜复用画布媒体入口、按场景展示剧本并提供视频历史删除', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const service = read('electron/collab-service.cjs');
  const preload = read('electron/preload.cjs');
  assert.match(ui, /parseDirectorScenes\(episode\.content/);
  assert.match(ui, /collab-shot-video/);
  assert.match(ui, /collabDeleteMedia/);
  assert.match(ui, /mediaGenerateImage/);
  assert.match(service, /attachGeneratedAssetImage/);
  assert.match(preload, /collabAttachGeneratedAssetImage/);
});

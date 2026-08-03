import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  uid, now,
  createInitialState, normalizeState,
  createProject, addEpisode, updateEpisode, setRating, deleteFruitProject,
  createScriptProject, deleteScriptProject, updateScriptProject,
  addScriptEpisode, updateScriptEpisode,
  compileFruitProject, compileScriptProject,
  archiveScript, deleteScriptLibraryItem,
  runSkillTransform, buildAiContext,
  exportFruitTxt, exportScriptTxt,
  addSkill, updateSkill, removeSkill,
  addApiProfile, updateApiProfile, setActiveApi, removeApiProfile,
  importDirectorProject, deleteDirectorProject, updateDirectorEpisode,
  addDirectorPrompt, updateDirectorPrompt, deleteDirectorPrompt,
  countTextChars,
  createChatSession, addChatMessage, toggleChatPin,
  deleteChatSession, cleanupChatSessions, setActiveChat,
} from './projectStore.js';

// ============ 工具函数测试 ============
describe('工具函数', () => {
  it('uid() 返回字符串且每次不同', () => {
    const a = uid();
    const b = uid();
    assert.strictEqual(typeof a, 'string');
    assert.ok(a.length > 0);
    assert.notStrictEqual(a, b);
  });

  it('now() 返回ISO时间字符串', () => {
    const t = now();
    assert.strictEqual(typeof t, 'string');
    assert.ok(t.includes('T'));
  });

  it('createInitialState() 返回完整初始状态', () => {
    const s = createInitialState();
    assert.ok(Array.isArray(s.fruitProjects));
    assert.ok(Array.isArray(s.scriptProjects));
    assert.ok(Array.isArray(s.scriptLibrary));
    assert.ok(Array.isArray(s.directorProjects));
    assert.ok(Array.isArray(s.skills));
    assert.ok(Array.isArray(s.apiProfiles));
    assert.ok(Array.isArray(s.chatSessions));
    assert.strictEqual(s.activeApiId, null);
    assert.strictEqual(s.activeChatId, null);
  });

  it('normalizeState() 补全缺失字段', () => {
    const partial = { fruitProjects: [] };
    const s = normalizeState(partial);
    assert.ok(Array.isArray(s.scriptProjects));
    assert.ok(Array.isArray(s.directorProjects));
  });
});

// ============ 果子库（FruitProject）CRUD ============
describe('果子库 CRUD', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('createProject() 创建果子项目', () => {
    const s = createProject(state, '测试项目');
    assert.strictEqual(s.fruitProjects.length, 1);
    assert.strictEqual(s.fruitProjects[0].name, '测试项目');
    assert.ok(s.fruitProjects[0].episodes.length === 0);
    assert.strictEqual(s.fruitProjects[0].rating, 0);
  });

  it('addEpisode() 添加剧集', () => {
    let s = createProject(state, 'P1');
    s = addEpisode(s, s.fruitProjects[0].id, { title: '第1集', inputType: 'txt' });
    assert.strictEqual(s.fruitProjects[0].episodes.length, 1);
    assert.strictEqual(s.fruitProjects[0].episodes[0].title, '第1集');
  });

  it('addEpisode() 对不存在的项目返回原状态', () => {
    const s = addEpisode(state, 'bad-id', { title: 'x' });
    assert.deepStrictEqual(s, state);
  });

  it('updateEpisode() 更新剧集字段', () => {
    let s = createProject(state, 'P1');
    s = addEpisode(s, s.fruitProjects[0].id, { title: '旧标题' });
    s = updateEpisode(s, s.fruitProjects[0].id, s.fruitProjects[0].episodes[0].id, { title: '新标题', status: 'completed' });
    assert.strictEqual(s.fruitProjects[0].episodes[0].title, '新标题');
    assert.strictEqual(s.fruitProjects[0].episodes[0].status, 'completed');
  });

  it('setRating() 设置评分', () => {
    let s = createProject(state, 'P1');
    s = setRating(s, s.fruitProjects[0].id, 4);
    assert.strictEqual(s.fruitProjects[0].rating, 4);
  });

  it('deleteFruitProject() 删除果子项目', () => {
    let s = createProject(state, 'P1');
    s = deleteFruitProject(s, s.fruitProjects[0].id);
    assert.strictEqual(s.fruitProjects.length, 0);
  });

  it('compileFruitProject() 编译合并剧本', () => {
    let s = createProject(state, 'P1');
    s = addEpisode(s, s.fruitProjects[0].id, { title: 'E1', scriptText: '内容1' });
    s = addEpisode(s, s.fruitProjects[0].id, { title: 'E2', scriptText: '内容2' });
    s = compileFruitProject(s, s.fruitProjects[0].id);
    assert.ok(s.fruitProjects[0].masterScript.includes('内容1'));
    assert.ok(s.fruitProjects[0].masterScript.includes('内容2'));
  });

  it('exportFruitTxt() 导出TXT', () => {
    let s = createProject(state, 'P1');
    s = addEpisode(s, s.fruitProjects[0].id, { title: 'E1', scriptText: '文本' });
    s = compileFruitProject(s, s.fruitProjects[0].id);
    const txt = exportFruitTxt(s, s.fruitProjects[0].id);
    assert.ok(txt.includes('P1'));
    assert.ok(txt.includes('文本'));
  });
});

// ============ 剧本创作 CRUD ============
describe('剧本创作 CRUD', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('createScriptProject() 创建剧本项目', () => {
    const s = createScriptProject(state, '新剧本', 'rewrite');
    assert.strictEqual(s.scriptProjects.length, 1);
    assert.strictEqual(s.scriptProjects[0].mode, 'rewrite');
  });

  it('deleteScriptProject() 删除剧本项目', () => {
    let s = createScriptProject(state, 'SP1', 'original');
    s = deleteScriptProject(s, s.scriptProjects[0].id);
    assert.strictEqual(s.scriptProjects.length, 0);
  });

  it('updateScriptProject() 更新剧本项目', () => {
    let s = createScriptProject(state, 'SP1', 'rewrite');
    s = updateScriptProject(s, s.scriptProjects[0].id, { name: '改名', mode: 'original' });
    assert.strictEqual(s.scriptProjects[0].name, '改名');
    assert.strictEqual(s.scriptProjects[0].mode, 'original');
  });

  it('addScriptEpisode() 添加剧本分集', () => {
    let s = createScriptProject(state, 'SP1', 'original');
    s = addScriptEpisode(s, s.scriptProjects[0].id, { title: '第一集', content: '...' });
    assert.strictEqual(s.scriptProjects[0].episodes.length, 1);
  });

  it('updateScriptEpisode() 更新剧本分集', () => {
    let s = createScriptProject(state, 'SP1', 'original');
    s = addScriptEpisode(s, s.scriptProjects[0].id, { title: 'E1', content: '旧' });
    s = updateScriptEpisode(s, s.scriptProjects[0].id, s.scriptProjects[0].episodes[0].id, { content: '新', result: 'ok' });
    assert.strictEqual(s.scriptProjects[0].episodes[0].content, '新');
    assert.strictEqual(s.scriptProjects[0].episodes[0].result, 'ok');
  });

  it('compileScriptProject() 编译最终剧本', () => {
    let s = createScriptProject(state, 'SP1', 'original');
    s = addScriptEpisode(s, s.scriptProjects[0].id, { title: 'E1', result: 'AI输出1' });
    s = addScriptEpisode(s, s.scriptProjects[0].id, { title: 'E2', result: 'AI输出2' });
    s = compileScriptProject(s, s.scriptProjects[0].id);
    assert.ok(s.scriptProjects[0].finalScript.includes('AI输出1'));
  });

  it('exportScriptTxt() 导出剧本TXT', () => {
    let s = createScriptProject(state, 'SP1', 'original');
    s = addScriptEpisode(s, s.scriptProjects[0].id, { title: 'E1', result: '结果' });
    s = compileScriptProject(s, s.scriptProjects[0].id);
    const txt = exportScriptTxt(s, s.scriptProjects[0].id);
    assert.ok(txt.includes('SP1'));
  });
});

// ============ 剧本库 ============
describe('剧本库', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('archiveScript() 归档到剧本库', () => {
    const s = archiveScript(state, '归档剧本', 'rewrite', '脚本内容...');
    assert.strictEqual(s.scriptLibrary.length, 1);
    assert.strictEqual(s.scriptLibrary[0].name, '归档剧本');
  });

  it('deleteScriptLibraryItem() 删除剧本库条目', () => {
    let s = archiveScript(state, 'S1', 'original', '内容');
    s = deleteScriptLibraryItem(s, s.scriptLibrary[0].id);
    assert.strictEqual(s.scriptLibrary.length, 0);
  });
});

// ============ Skills CRUD ============
describe('Skills CRUD', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('addSkill() 添加技能', () => {
    const s = addSkill(state, '翻译技能', 'translate', '翻译内容...');
    assert.strictEqual(s.skills.length, 1);
    assert.strictEqual(s.skills[0].type, 'translate');
  });

  it('addSkill() 保留完整 Skill 目录元数据和引用文件', () => {
    const s = addSkill(state, {
      name: 'leader',
      description: '帮你定义目标',
      type: 'custom',
      content: '---\nname: leader\n---\n正文',
      files: [{ path: 'references/anatomy.md', content: '# 结构' }],
      importMethod: 'skill-folder',
      sourceName: 'leader',
    });
    assert.strictEqual(s.skills[0].description, '帮你定义目标');
    assert.strictEqual(s.skills[0].files[0].path, 'references/anatomy.md');
    assert.strictEqual(s.skills[0].importMethod, 'skill-folder');
  });

  it('updateSkill() 更新技能', () => {
    let s = addSkill(state, 'S1', 'type-a', 'content');
    s = updateSkill(s, s.skills[0].id, { name: '改名技能', content: '新内容' });
    assert.strictEqual(s.skills[0].name, '改名技能');
  });

  it('removeSkill() 删除技能', () => {
    let s = addSkill(state, 'S1', 't', 'c');
    s = removeSkill(s, s.skills[0].id);
    assert.strictEqual(s.skills.length, 0);
  });

  it('runSkillTransform() 执行技能变换', () => {
    let s = addSkill(state, '大写', 'transform', '将内容转为大写');
    const result = runSkillTransform(s, s.skills[0].id, 'hello');
    // 无实际AI时返回占位说明
    assert.strictEqual(typeof result, 'object');
    assert.ok(result.output.includes('hello'));
  });
});

// ============ API Profiles CRUD ============
describe('API Profiles CRUD', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('addApiProfile() 添加API配置', () => {
    const s = addApiProfile(state, 'DeepSeek', 'deepseek', 'https://api.deepseek.com', 'deepseek-chat', 'sk-xxx');
    assert.strictEqual(s.apiProfiles.length, 1);
    assert.strictEqual(s.apiProfiles[0].provider, 'deepseek');
  });

  it('updateApiProfile() 更新API配置', () => {
    let s = addApiProfile(state, 'DS', 'openai', 'url', 'm', 'key');
    s = updateApiProfile(s, s.apiProfiles[0].id, { endpoint: 'https://new.url', model: 'gpt-4' });
    assert.strictEqual(s.apiProfiles[0].endpoint, 'https://new.url');
  });

  it('setActiveApi() 设置活跃API', () => {
    let s = addApiProfile(state, 'DS', 'deepseek', 'url', 'm', 'key');
    s = setActiveApi(s, s.apiProfiles[0].id);
    assert.strictEqual(s.activeApiId, s.apiProfiles[0].id);
  });

  it('removeApiProfile() 删除API配置', () => {
    let s = addApiProfile(state, 'DS', 'x', 'u', 'm', 'k');
    s = removeApiProfile(s, s.apiProfiles[0].id);
    assert.strictEqual(s.apiProfiles.length, 0);
  });
});

// ============ 导演模式 CRUD ============
describe('导演模式 CRUD', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('importDirectorProject() 导入导演项目', () => {
    let s = createProject(state, 'FP1');
    s = importDirectorProject(s, s.fruitProjects[0].id, 'fruit', '完整剧本');
    assert.strictEqual(s.directorProjects.length, 1);
    assert.strictEqual(s.directorProjects[0].sourceType, 'fruit');
    assert.ok(s.directorProjects[0].episodes.length > 0);
  });

  it('deleteDirectorProject() 删除导演项目', () => {
    let s = createProject(state, 'FP1');
    s = importDirectorProject(s, s.fruitProjects[0].id, 'fruit', '剧本');
    s = deleteDirectorProject(s, s.directorProjects[0].id);
    assert.strictEqual(s.directorProjects.length, 0);
  });

  it('updateDirectorEpisode() 更新导演分集', () => {
    let s = createProject(state, 'FP1');
    s = importDirectorProject(s, s.fruitProjects[0].id, 'fruit', '剧本');
    const epId = s.directorProjects[0].episodes[0].id;
    s = updateDirectorEpisode(s, s.directorProjects[0].id, epId, { status: 'done' });
    assert.strictEqual(s.directorProjects[0].episodes[0].status, 'done');
  });

  it('addDirectorPrompt() 添加导演提示词', () => {
    let s = createProject(state, 'FP1');
    s = importDirectorProject(s, s.fruitProjects[0].id, 'fruit', '剧本');
    const epId = s.directorProjects[0].episodes[0].id;
    s = addDirectorPrompt(s, s.directorProjects[0].id, epId, { label: '测试提示' });
    assert.strictEqual(s.directorProjects[0].episodes[0].prompts.length, 1);
  });

  it('updateDirectorPrompt() 更新导演提示词', () => {
    let s = createProject(state, 'FP1');
    s = importDirectorProject(s, s.fruitProjects[0].id, 'fruit', '剧本');
    const epId = s.directorProjects[0].episodes[0].id;
    s = addDirectorPrompt(s, s.directorProjects[0].id, epId, { label: '旧标签' });
    const pId = s.directorProjects[0].episodes[0].prompts[0].id;
    s = updateDirectorPrompt(s, s.directorProjects[0].id, epId, pId, { output: '生成结果' });
    assert.strictEqual(s.directorProjects[0].episodes[0].prompts[0].output, '生成结果');
  });

  it('deleteDirectorPrompt() 删除导演提示词', () => {
    let s = createProject(state, 'FP1');
    s = importDirectorProject(s, s.fruitProjects[0].id, 'fruit', '剧本');
    const epId = s.directorProjects[0].episodes[0].id;
    s = addDirectorPrompt(s, s.directorProjects[0].id, epId, { label: 'T' });
    const pId = s.directorProjects[0].episodes[0].prompts[0].id;
    s = deleteDirectorPrompt(s, s.directorProjects[0].id, epId, pId);
    assert.strictEqual(s.directorProjects[0].episodes[0].prompts.length, 0);
  });
});

// ============ 聊天会话 CRUD ============
describe('聊天会话 CRUD', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('createChatSession() 创建会话', () => {
    const s = createChatSession(state, '新会话');
    assert.strictEqual(s.chatSessions.length, 1);
    assert.strictEqual(s.chatSessions[0].title, '新会话');
  });

  it('addChatMessage() 添加消息', () => {
    let s = createChatSession(state, 'C1');
    s = addChatMessage(s, s.chatSessions[0].id, 'user', '你好');
    assert.strictEqual(s.chatSessions[0].messages.length, 1);
    assert.strictEqual(s.chatSessions[0].messages[0].role, 'user');
  });

  it('toggleChatPin() 切换置顶', () => {
    let s = createChatSession(state, 'C1');
    s = toggleChatPin(s, s.chatSessions[0].id);
    assert.strictEqual(s.chatSessions[0].pinned, true);
    s = toggleChatPin(s, s.chatSessions[0].id);
    assert.strictEqual(s.chatSessions[0].pinned, false);
  });

  it('deleteChatSession() 删除会话', () => {
    let s = createChatSession(state, 'C1');
    s = deleteChatSession(s, s.chatSessions[0].id);
    assert.strictEqual(s.chatSessions.length, 0);
  });

  it('setActiveChat() 设置活跃会话', () => {
    let s = createChatSession(state, 'C1');
    s = setActiveChat(s, s.chatSessions[0].id);
    assert.strictEqual(s.activeChatId, s.chatSessions[0].id);
  });

  it('cleanupChatSessions() 清理空会话', () => {
    let s = createChatSession(state, 'C1');
    s = addChatMessage(s, s.chatSessions[0].id, 'user', '有消息');
    s = createChatSession(s, '空会话');
    assert.strictEqual(s.chatSessions.length, 2);
    s = cleanupChatSessions(s);
    assert.strictEqual(s.chatSessions.length, 1);
    assert.strictEqual(s.chatSessions[0].title, 'C1');
  });
});

// ============ 字符统计 ============
describe('字符统计', () => {
  it('countTextChars() 统计文本字符数', () => {
    assert.strictEqual(countTextChars('你好世界'), 4);
    assert.strictEqual(countTextChars('hello'), 5);
    assert.strictEqual(countTextChars(''), 0);
  });

  it('countTextChars() 处理null/undefined', () => {
    assert.strictEqual(countTextChars(null), 0);
    assert.strictEqual(countTextChars(undefined), 0);
  });
});

// ============ AI上下文构建 ============
describe('AI上下文构建', () => {
  let state;
  beforeEach(() => { state = createInitialState(); });

  it('buildAiContext() 构建AI上下文', () => {
    let s = createProject(state, 'P1');
    s = addEpisode(s, s.fruitProjects[0].id, { title: 'E1', scriptText: '脚本' });
    const ctx = buildAiContext(s, s.fruitProjects[0].id);
    assert.ok(ctx.includes('P1'));
    assert.ok(ctx.includes('E1'));
  });
});

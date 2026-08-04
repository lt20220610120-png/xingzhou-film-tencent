import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSkillWithAi } from './skillExecution.js';

test('执行 Skill 时通过当前 API 把完整 Skill 目录发送给模型', async () => {
  let request;
  const state = {
    activeApiId: 'api-1',
    apiProfiles: [{ id: 'api-1', endpoint: 'https://example.test/v1', model: 'model-x', apiKey: 'secret' }],
    skills: [{
      id: 'skill-1', name: 'video-prompt', content: 'SKILL 主规则', importMethod: 'skill-folder',
      files: [{ path: 'references/rules.md', content: '附属规则全文' }],
    }],
  };
  const api = { aiChat: async (payload) => { request = payload; return '模型真实返回'; } };
  const result = await executeSkillWithAi({ api, state, skillId: 'skill-1', input: '场景输入' });
  assert.equal(result.output, '模型真实返回');
  assert.equal(request.model, 'model-x');
  assert.deepEqual(request.messages[0], { role: 'system', content: '请读取Skill文档，严格按照Skill文档输出' });
  assert.match(request.messages[1].content, /SKILL 主规则/);
  assert.match(request.messages[1].content, /references\/rules\.md/);
  assert.match(request.messages[1].content, /附属规则全文/);
  assert.deepEqual(request.messages.at(-1), { role: 'user', content: '场景输入' });
});

test('根 SKILL.md 为空时拒绝生成，不能只读取 references 后继续运行', async () => {
  const state = {
    activeApiId: 'api-1',
    apiProfiles: [{ id: 'api-1', endpoint: 'https://example.test/v1', model: 'model-x', apiKey: 'key' }],
    skills: [{ id: 'broken', name: 'video-prompt', content: '', importMethod: 'skill-folder', files: [{ path: 'references/rules.md', content: '附属规则' }] }],
  };
  await assert.rejects(
    () => executeSkillWithAi({ api: { aiChat: async () => '不应调用' }, state, skillId: 'broken', input: '场景输入' }),
    /SKILL\.md 内容为空/,
  );
});

test('没有可用 API 或 Skill 时给出可读错误，不能返回伪生成结果', async () => {
  await assert.rejects(() => executeSkillWithAi({ api: {}, state: { skills: [], apiProfiles: [] }, skillId: 'missing', input: 'x' }), /Skill 不存在/);
  await assert.rejects(() => executeSkillWithAi({ api: {}, state: { skills: [{ id: 's' }], apiProfiles: [] }, skillId: 's', input: 'x' }), /API 接口/);
});

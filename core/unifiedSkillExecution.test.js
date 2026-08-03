import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkillExecution } from './skillExecution.js';

const state = {
  activeApiId: 'api',
  apiProfiles: [{ id: 'api', endpoint: 'https://example.test/v1', model: 'x', apiKey: 'k' }],
  skills: [{ id: 'skill', name: 'video-prompt', content: 'ROOT', importMethod: 'skill-folder', files: [{ path: 'references/a.md', content: 'REF-A' }, { path: 'assets/b.txt', content: 'ASSET-B' }] }],
};

test('统一Skill执行器可在用户输入前后附加业务消息且不丢任何文件', async () => {
  let payload;
  const api = { aiChat: async (value) => { payload = value; return 'ok'; } };
  await createSkillExecution({
    api, state, skillId: 'skill', input: '用户正文', assistantRole: '测试助手',
    beforeUserMessages: [{ role: 'assistant', content: '历史回复' }],
    afterUserMessages: [{ role: 'user', content: '附件正文' }],
  });
  const joined = payload.messages.map(item => item.content).join('\n');
  assert.match(joined, /ROOT/);
  assert.match(joined, /REF-A/);
  assert.match(joined, /ASSET-B/);
  assert.deepEqual(payload.messages.slice(-3), [
    { role: 'assistant', content: '历史回复' },
    { role: 'user', content: '用户正文' },
    { role: 'user', content: '附件正文' },
  ]);
});

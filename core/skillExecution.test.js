import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillMessages } from './skillContext.js';

test('Skill 执行消息把完整目录上下文放入 system，用户输入独立传递', () => {
  const skill = {
    name: 'video-prompt',
    content: '主规则',
    importMethod: 'skill-folder',
    files: [{ path: 'references/rules.md', content: '附属规则' }],
  };
  const messages = buildSkillMessages(skill, '场景正文');
  assert.equal(messages.length, 3);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /主规则/);
  assert.match(messages[0].content, /references\/rules\.md/);
  assert.match(messages[0].content, /附属规则/);
  assert.match(messages[1].content, /执行前再次确认/);
  assert.deepEqual(messages[2], { role: 'user', content: '场景正文' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillMessages } from './skillContext.js';

test('Skill 执行消息严格按“强制读取指令 → 完整 Skill → 文本框内容”排列', () => {
  const skill = {
    name: 'video-prompt',
    content: '主规则',
    importMethod: 'skill-folder',
    files: [{ path: 'references/rules.md', content: '附属规则' }],
  };
  const messages = buildSkillMessages(skill, '场景正文');
  assert.equal(messages.length, 3);
  assert.deepEqual(messages[0], { role: 'system', content: '请读取Skill文档，严格按照Skill文档输出' });
  assert.equal(messages[1].role, 'system');
  assert.match(messages[1].content, /主规则/);
  assert.match(messages[1].content, /references\/rules\.md/);
  assert.match(messages[1].content, /附属规则/);
  assert.match(messages[1].content, /完整 Skill 文件清单/);
  assert.deepEqual(messages[2], { role: 'user', content: '场景正文' });
});

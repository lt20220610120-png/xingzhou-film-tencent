import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillMessages, buildSkillManifest } from './skillContext.js';

const completeSkill = {
  name: 'video-prompt',
  content: 'ROOT-SKILL-CONTENT\n批量必须输出（1）（2）',
  importMethod: 'skill-folder',
  files: [
    { path: 'references/a.md', content: 'REFERENCE-A-UNIQUE' },
    { path: 'assets/b.txt', content: 'ASSET-B-UNIQUE' },
  ],
};

test('完整Skill清单把SKILL.md计入总文件数', () => {
  assert.deepEqual(buildSkillManifest(completeSkill), {
    totalFiles: 3,
    paths: ['SKILL.md', 'references/a.md', 'assets/b.txt'],
  });
});

test('模型消息明确附上每个完整文件并在末尾再次强制执行根规则', () => {
  const messages = buildSkillMessages(completeSkill, 'USER-INPUT', '测试助手');
  assert.equal(messages.at(-1).role, 'user');
  assert.equal(messages.at(-1).content, 'USER-INPUT');
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  assert.match(system, /共 3 个文件/);
  for (const path of ['SKILL.md', 'references/a.md', 'assets/b.txt']) assert.match(system, new RegExp(path.replace('.', '\\.')));
  assert.match(system, /ROOT-SKILL-CONTENT/);
  assert.match(system, /REFERENCE-A-UNIQUE/);
  assert.match(system, /ASSET-B-UNIQUE/);
  assert.match(messages.at(-2).content, /执行前再次确认/);
  assert.match(messages.at(-2).content, /批量必须输出（1）（2）/);
});

test('普通手写Skill仍按一个完整文件发送', () => {
  const skill = { name: '临时规则', content: '临时正文', files: [], importMethod: 'manual' };
  assert.equal(buildSkillManifest(skill).totalFiles, 1);
  const messages = buildSkillMessages(skill, '输入');
  assert.match(messages[0].content, /共 1 个文件/);
  assert.match(messages[0].content, /临时正文/);
});

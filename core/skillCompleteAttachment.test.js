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

test('模型消息先强制读取，再完整附上每个文件，最后才发送输入', () => {
  const messages = buildSkillMessages(completeSkill, 'USER-INPUT', '测试助手');
  assert.deepEqual(messages[0], { role: 'system', content: '请读取Skill文档，严格按照Skill文档输出' });
  assert.equal(messages.at(-1).role, 'user');
  assert.equal(messages.at(-1).content, 'USER-INPUT');
  const skillDocument = messages[1].content;
  assert.match(skillDocument, /共 3 个文件/);
  for (const path of ['SKILL.md', 'references/a.md', 'assets/b.txt']) assert.match(skillDocument, new RegExp(path.replace('.', '\\.')));
  assert.match(skillDocument, /ROOT-SKILL-CONTENT/);
  assert.match(skillDocument, /REFERENCE-A-UNIQUE/);
  assert.match(skillDocument, /ASSET-B-UNIQUE/);
  assert.match(skillDocument, /批量必须输出（1）（2）/);
  assert.match(skillDocument, /完整 Skill 文档结束/);
});

test('普通手写Skill仍按一个完整文件发送', () => {
  const skill = { name: '临时规则', content: '临时正文', files: [], importMethod: 'manual' };
  assert.equal(buildSkillManifest(skill).totalFiles, 1);
  const messages = buildSkillMessages(skill, '输入');
  assert.match(messages[1].content, /共 1 个文件/);
  assert.match(messages[1].content, /临时正文/);
});

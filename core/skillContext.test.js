import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillContext } from './skillContext.js';

test('手写或文档 Skill 只读取提示词正文', () => {
  const result = buildSkillContext({ name: '临时', content: '只按正文执行', files: [], importMethod: 'manual' });
  assert.match(result, /【SKILL\.md／提示词正文】\n只按正文执行/);
  assert.doesNotMatch(result, /目录附属文件/);
});

test('完整 Skill 会把 SKILL.md 和目录中每个文件完整注入', () => {
  const result = buildSkillContext({
    name: 'video-prompt',
    content: '主规则：先读取参考文件。',
    importMethod: 'skill-folder',
    files: [
      { path: 'references/anti_patterns.md', content: '禁止模式全文' },
      { path: 'assets/template.txt', content: '模板全文' },
    ],
  });
  assert.match(result, /主规则：先读取参考文件。/);
  assert.match(result, /【目录附属文件：references\/anti_patterns\.md】\n禁止模式全文/);
  assert.match(result, /【目录附属文件：assets\/template\.txt】\n模板全文/);
  assert.match(result, /所有上述文件均属于同一个 Skill/);
});

test('目录文件内容为空时仍保留路径，防止模型误以为文件不存在', () => {
  const result = buildSkillContext({ name: 'x', content: 'root', importMethod: 'skill-folder', files: [{ path: 'references/empty.md', content: '' }] });
  assert.match(result, /【目录附属文件：references\/empty\.md】\n（空文件）/);
});

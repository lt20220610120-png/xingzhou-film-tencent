import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillContext } from './skillContext.js';

test('手写或文档 Skill 作为一个完整 SKILL.md 读取', () => {
  const result = buildSkillContext({ name: '临时', content: '只按正文执行', files: [], importMethod: 'manual' });
  assert.match(result, /完整 Skill 文件清单：共 1 个文件/);
  assert.match(result, /【文件 1\/1：SKILL\.md】\n只按正文执行/);
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
  assert.match(result, /完整 Skill 文件清单：共 3 个文件/);
  assert.match(result, /【文件 1\/3：SKILL\.md】\n主规则：先读取参考文件。/);
  assert.match(result, /【文件 2\/3：references\/anti_patterns\.md】\n禁止模式全文/);
  assert.match(result, /【文件 3\/3：assets\/template\.txt】\n模板全文/);
});

test('目录文件内容为空时仍保留路径，防止模型误以为文件不存在', () => {
  const result = buildSkillContext({ name: 'x', content: 'root', importMethod: 'skill-folder', files: [{ path: 'references/empty.md', content: '' }] });
  assert.match(result, /【文件 2\/2：references\/empty\.md】\n（空文件）/);
});

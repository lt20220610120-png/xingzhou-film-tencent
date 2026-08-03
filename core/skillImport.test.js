import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillMarkdown, buildSkillFromDirectory, buildSkillFromDocument } from './skillImport.js';

test('解析标准 SKILL.md 的 YAML frontmatter 并保留完整正文', () => {
  const markdown = `---\nname: leader\ndescription: 帮你定义目标\n---\n\n# 领导\n\n详见 [结构](references/anatomy.md)。`;
  const skill = parseSkillMarkdown(markdown, { files: [{ path: 'references/anatomy.md', content: '# 结构' }] });
  assert.equal(skill.name, 'leader');
  assert.equal(skill.description, '帮你定义目标');
  assert.equal(skill.content, markdown);
  assert.equal(skill.files[0].path, 'references/anatomy.md');
  assert.equal(skill.importMethod, 'skill-folder');
});

test('完整 Skill 目录必须包含根目录 SKILL.md 并保留引用文件层级', () => {
  const imported = buildSkillFromDirectory({
    rootName: 'leader',
    files: [
      { path: 'references/style.md', content: '# 风格' },
      { path: 'SKILL.md', content: '---\nname: leader\ndescription: 目标管理\n---\n正文' },
      { path: 'assets/example.txt', content: '例子' },
    ],
  });
  assert.equal(imported.name, 'leader');
  assert.equal(imported.files.length, 2);
  assert.deepEqual(imported.files.map(file => file.path), ['assets/example.txt', 'references/style.md']);
  assert.throws(() => buildSkillFromDirectory({ rootName: 'bad', files: [{ path: 'README.md', content: 'x' }] }), /SKILL\.md/);
});

test('普通文档导入会成为可编辑 Skill，而不是冒充完整目录 Skill', () => {
  const skill = buildSkillFromDocument({ fileName: '镜头语言.md', content: '# 镜头语言\n规则正文' });
  assert.equal(skill.name, '镜头语言');
  assert.equal(skill.type, 'custom');
  assert.equal(skill.content, '# 镜头语言\n规则正文');
  assert.equal(skill.importMethod, 'document');
  assert.deepEqual(skill.files, []);
});

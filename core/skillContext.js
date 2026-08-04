const cleanText = (value) => String(value ?? '').replace(/^\uFEFF/, '');
const cleanPath = (value) => cleanText(value).replaceAll('\\', '/').trim();

const skillFiles = (skill) => (Array.isArray(skill?.files) ? skill.files : [])
  .map((file) => ({ path: cleanPath(file?.path), content: cleanText(file?.content) }))
  .filter((file) => file.path && file.path.toLowerCase() !== 'skill.md');

export const buildSkillManifest = (skill) => {
  if (!skill) return { totalFiles: 0, paths: [] };
  const paths = ['SKILL.md', ...skillFiles(skill).map((file) => file.path)];
  return { totalFiles: paths.length, paths };
};

/** Serialize every file of an imported Skill into one lossless context. */
export const buildSkillContext = (skill) => {
  if (!skill) return '';
  const files = skillFiles(skill);
  const manifest = buildSkillManifest(skill);
  const sections = [
    `【完整 Skill 文件清单：共 ${manifest.totalFiles} 个文件】\n${manifest.paths.map((path, index) => `${index + 1}. ${path}`).join('\n')}`,
    `【文件 1/${manifest.totalFiles}：SKILL.md】\n${cleanText(skill.content) || '（空文件）'}`,
  ];
  files.forEach((file, index) => {
    sections.push(`【文件 ${index + 2}/${manifest.totalFiles}：${file.path}】\n${file.content || '（空文件）'}`);
  });
  return sections.join('\n\n');
};

export const buildSkillMessages = (skill, userContent, assistantRole = '行舟影视 AI 助手') => {
  if (!skill) return [{ role: 'user', content: String(userContent ?? '') }];
  const manifest = buildSkillManifest(skill);
  const fullContext = buildSkillContext(skill);
  return [
    {
      role: 'system',
      content: '请读取Skill文档，严格按照Skill文档输出',
    },
    {
      role: 'system',
      content: `你是${assistantRole}。下面是当前选中 Skill「${skill.name || '未命名'}」的完整原始文档，共 ${manifest.totalFiles} 个文件。请先从头到尾读取 SKILL.md，再逐个读取文件清单中的全部附属文件，把它们作为同一个不可分割的 Skill 严格执行。禁止只按名称、简介、description、历史印象或部分文件猜测规则；禁止自行改写 Skill 规定的输出结构。\n\n${fullContext}\n\n【完整 Skill 文档结束】以上 ${manifest.totalFiles} 个文件就是本次生成的唯一 Skill 规则。下一条用户消息才是要处理的文本框内容。请严格按照刚刚读完的 Skill 文档输出。`,
    },
    { role: 'user', content: String(userContent ?? '') },
  ];
};

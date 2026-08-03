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
  const rootRules = cleanText(skill.content) || '（空文件）';
  return [
    {
      role: 'system',
      content: `你是${assistantRole}。当前选中 Skill「${skill.name || '未命名'}」，已完整附上共 ${manifest.totalFiles} 个文件。你必须逐个读取文件清单中的每个文件，并把 SKILL.md 与全部附属文件作为同一个不可分割的 Skill 共同执行；禁止只按名称、简介、description 或部分文件猜测规则。\n\n${buildSkillContext(skill)}`,
    },
    {
      role: 'system',
      content: `【执行前再次确认】你已收到并必须执行 Skill 的全部 ${manifest.totalFiles} 个文件：${manifest.paths.join('、')}。SKILL.md 是最高优先级操作规则；以下根规则再次附上，防止长上下文中被忽略：\n\n${rootRules}`,
    },
    { role: 'user', content: String(userContent ?? '') },
  ];
};

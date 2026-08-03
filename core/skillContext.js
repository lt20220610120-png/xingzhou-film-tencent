const cleanText = (value) => String(value ?? '').replace(/^\uFEFF/, '');

/**
 * Serialize the complete Skill into one model-readable system context.
 * Manual/document Skills contain only the editable prompt body. Imported
 * directory Skills contain SKILL.md plus every stored directory file.
 */
export const buildSkillContext = (skill) => {
  if (!skill) return '';
  const sections = [`【SKILL.md／提示词正文】\n${cleanText(skill.content)}`];
  const files = Array.isArray(skill.files) ? skill.files : [];
  if (skill.importMethod === 'skill-folder' || files.length > 0) {
    for (const file of files) {
      const path = cleanText(file?.path).replaceAll('\\', '/').trim();
      if (!path || path.toLowerCase() === 'skill.md') continue;
      const content = cleanText(file?.content);
      sections.push(`【目录附属文件：${path}】\n${content || '（空文件）'}`);
    }
    sections.unshift('以下是一个完整 Skill。所有上述文件均属于同一个 Skill，执行时必须完整读取并共同遵循；不得只读取 SKILL.md／提示词正文。');
  }
  return sections.join('\n\n');
};

export const buildSkillMessages = (skill, userContent, assistantRole = '行舟影视 AI 助手') => {
  if (!skill) return [{ role: 'user', content: String(userContent ?? '') }];
  return [
    {
      role: 'system',
      content: `你是${assistantRole}。请严格执行 Skill「${skill.name || '未命名'}」。\n\n${buildSkillContext(skill)}`,
    },
    { role: 'user', content: String(userContent ?? '') },
  ];
};

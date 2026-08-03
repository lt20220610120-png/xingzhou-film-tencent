const normalizePath = (value = '') => value.replaceAll('\\', '/').replace(/^\.\//, '');

const parseFrontmatter = (markdown) => {
  const match = String(markdown || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  if (!match) return {};
  const metadata = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }
  return metadata;
};

export const parseSkillMarkdown = (markdown, options = {}) => {
  const content = String(markdown || '').replace(/^\uFEFF/, '');
  const metadata = parseFrontmatter(content);
  if (!metadata.name?.trim()) throw new Error('SKILL.md 缺少 frontmatter 中的 name');
  return {
    name: metadata.name.trim(),
    description: metadata.description?.trim() || '',
    type: options.type || 'custom',
    content,
    files: [...(options.files || [])]
      .map(file => ({ path: normalizePath(file.path), content: String(file.content ?? '') }))
      .filter(file => file.path && file.path.toLowerCase() !== 'skill.md')
      .sort((a, b) => a.path.localeCompare(b.path)),
    importMethod: options.importMethod || 'skill-folder',
    sourceName: options.sourceName || '',
  };
};

export const buildSkillFromDirectory = ({ rootName = '', files = [] } = {}) => {
  const normalized = files.map(file => ({ ...file, path: normalizePath(file.path) }));
  const skillFile = normalized.find(file => file.path.toLowerCase() === 'skill.md');
  if (!skillFile) throw new Error('所选目录根部缺少 SKILL.md');
  return parseSkillMarkdown(skillFile.content, {
    files: normalized.filter(file => file !== skillFile),
    importMethod: 'skill-folder',
    sourceName: rootName,
  });
};

export const buildSkillFromDocument = ({ fileName = '', content = '' } = {}) => {
  const cleanName = fileName.replace(/\.(md|markdown|txt|text)$/i, '').trim() || '导入的 Skill';
  return {
    name: cleanName,
    description: `由文档 ${fileName || cleanName} 导入`,
    type: 'custom',
    content: String(content || '').replace(/^\uFEFF/, ''),
    files: [],
    importMethod: 'document',
    sourceName: fileName,
  };
};

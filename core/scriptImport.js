// ============================================================
// scriptImport.js — 剧本分集导入
// ============================================================

/**
 * splitFullScript(text)
 * 将完整剧本按照分集标记拆分为多个剧集片段。
 * 支持多种常见的分集标记格式。
 * 返回: { title: string, content: string }[]
 */
export const parseDirectorScenes = (text, episodeNumber = 1) => {
  const source = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];
  const lines = source.split('\n');
  const heading = /^\s*(?:场景\s*)?(\d+)\s*[-—－]\s*(\d+)\s*[：:]?\s*(.*)$/;
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(heading);
    if (match) starts.push({ index, sourceSceneNumber: Number(match[2]) });
  });
  if (!starts.length) return [{ label: `${episodeNumber}-1`, content: source }];

  const preface = lines.slice(0, starts[0].index).join('\n').trim();
  const scenes = [];
  if (preface && starts[0].sourceSceneNumber > 1) scenes.push({ content: preface });
  starts.forEach((start, sourceIndex) => {
    const body = lines.slice(start.index, starts[sourceIndex + 1]?.index ?? lines.length).join('\n').trim();
    scenes.push({ content: sourceIndex === 0 && preface && start.sourceSceneNumber === 1 ? `${preface}\n\n${body}` : body });
  });
  return scenes.filter(scene => scene.content).map((scene, sceneIndex) => ({
    label: `${Number(episodeNumber)}-${sceneIndex + 1}`,
    content: scene.content.replace(
      /^(\s*(?:场景\s*)?)\d+\s*([-—－])\s*\d+/m,
      `$1${Number(episodeNumber)}$2${sceneIndex + 1}`,
    ),
  }));
};

export const splitFullScript = (text) => {
  if (!text || typeof text !== 'string') return [];

  // 支持的集数标记模式（按优先级排序）
  const patterns = [
    // 第X集 / 第X章 / Episode X
    /^第[一二三四五六七八九十百千\d]+[集章节幕部回]/,
    // Episode X / EP X
    /^Episode\s+\d+[:：]?\s*/i,
    // 数字标题: 1. / 一、 / 1)
    /^\d+[\.、．，,）\)]\s*/,
    // 中文数字标题: 一、
    /^[一二三四五六七八九十百千]+[、．\.]\s*/,
  ];

  const lines = text.split('\n');
  const episodes = [];
  let currentTitle = '';
  let currentContent = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentContent.length > 0) currentContent.push('');
      continue;
    }

    // 检查是否匹配分集标记
    let matched = false;
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        // 保存上一个剧集
        if (currentContent.length > 0) {
          episodes.push({
            title: currentTitle || `分集 ${episodes.length + 1}`,
            content: currentContent.join('\n').trim(),
          });
        }
        currentTitle = trimmed;
        currentContent = [];
        matched = true;
        break;
      }
    }

    if (!matched) {
      currentContent.push(trimmed);
    }
  }

  // 保存最后一个剧集
  if (currentContent.length > 0) {
    episodes.push({
      title: currentTitle || `分集 ${episodes.length + 1}`,
      content: currentContent.join('\n').trim(),
    });
  }

  // 如果没有任何分集标记，则整个文本作为一个剧集
  if (episodes.length === 0 && text.trim()) {
    episodes.push({
      title: '完整剧本',
      content: text.trim(),
    });
  }

  return {
    masterScript: text.trim(),
    detected: episodes.length > 1 || episodes.some(ep => /^第[一二三四五六七八九十百千\d]+[集章节幕部回]/.test(ep.title)),
    episodes,
  };
};

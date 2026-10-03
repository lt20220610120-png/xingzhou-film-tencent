export const getSceneVision = (episode, sceneLabel) => episode?.sceneVisions?.[sceneLabel] || '';

export const updateSceneVision = (episode, sceneLabel, content) => ({
  ...episode,
  sceneVisions: { ...(episode?.sceneVisions || {}), [sceneLabel]: content },
});

export const promptsForScene = (prompts, sceneLabel) => (prompts || []).filter((item) =>
  item.sceneLabel === sceneLabel || (!item.sceneLabel && item.label?.startsWith(`${sceneLabel}-`))
);

// Older creative records have no mode field, but keep the original input heading.
// Never infer mode from generated/edited output or the episode's current tab.
export const directorPromptMode = (prompt) => {
  if (['creative', 'quick'].includes(prompt?.generationMode)) return prompt.generationMode;
  if (/^\s*【导演构想】\s*$/m.test(String(prompt?.sourceText || ''))) return 'creative';
  return prompt?.sourceText ? 'quick' : 'unknown';
};

export const creativePromptsForScene = (prompts, sceneLabel) => promptsForScene(prompts, sceneLabel)
  .filter((prompt) => directorPromptMode(prompt) === 'creative');

const NUMBERED_PROMPT_MARKER = /^\s*[（(](\d+)[）)]\s*(.*)$/;
const INPUT_SEGMENT_MARKER = /^\s*[（(](\d+)[）)]\s*$/;
const SCENE_PROMPT_ID_MARKER = /^\s*(?:(?:#{1,6})\s*)?(?:\*\*|__)?(\d+-\d+-\d+)(?:\*\*|__)?\s*$/;

const trimOuterBlankLines = (value) => value
  .replace(/^(?:[\t ]*(?:\r\n|\n|\r))+/, '')
  .replace(/(?:(?:\r\n|\n|\r)[\t ]*)+$/, '');

const splitSceneIdPromptOutput = (source) => {
  const linePattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  const markers = [];
  let match;
  while ((match = linePattern.exec(source)) !== null) {
    if (!match[0]) break;
    const line = match[0].replace(/(?:\r\n|\n|\r)$/, '');
    const marker = line.match(SCENE_PROMPT_ID_MARKER);
    if (marker) markers.push({ label: marker[1], start: match.index });
  }
  if (!markers.length) return [];

  return markers.map((marker, index) => {
    const start = index === 0 ? 0 : marker.start;
    const end = markers[index + 1]?.start ?? source.length;
    return {
      label: marker.label,
      content: trimOuterBlankLines(source.slice(start, end)),
    };
  }).filter((part) => part.content);
};

export const buildNumberedSceneTasks = (text, sceneLabel) => {
  const source = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!source) return [];
  const lines = source.split(/\r?\n/);
  const markers = [];
  lines.forEach((line, index) => {
    const marker = line.match(INPUT_SEGMENT_MARKER);
    if (marker) markers.push({ number: marker[1], index });
  });
  if (!markers.length) return [{ label: `${sceneLabel}-1`, input: source }];
  const shared = lines.slice(0, markers[0].index).join('\n').trim();
  return markers.map((marker, index) => {
    const body = lines.slice(marker.index, markers[index + 1]?.index ?? lines.length).join('\n').trim();
    return {
      label: `${sceneLabel}-${marker.number}`,
      input: [shared, body].filter(Boolean).join('\n'),
    };
  });
};

/** Manual and automatic cuts use the same whole-scene submission. The selected
 * original Skill owns all directing, dialogue interpretation and output fields. */
export const buildWholeSceneSubmission = ({ sourceText, expectedLabels }) => `${sourceText}\n\n【整场提交说明】\n请先通读以上整场戏并完成覆盖所有括号的导演预演，再按所选原始完整 Skill 一次输出全部 ${expectedLabels.length} 条提示词。括号是提交边界，不是重新构想场景的起点；没有括号时整场只输出一条。规范编号按原括号对应：${expectedLabels.join('、')}。保持原文、原话与声源；同场光影基调逐字复用，人物、道具、声音和末首镜连续。不拆增条数，直接输出完整提示词。`;

export const splitNumberedPromptOutput = (text) => {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  if (!source.trim()) return [];

  // 新版 Skill 以“集-场景-序号”（如 2-1-3）作为每条提示词的独立行标题。
  // 必须先识别这种格式，并把标题同时保留在可编辑正文第一行。
  const sceneIdParts = splitSceneIdPromptOutput(source);
  if (sceneIdParts.length) return sceneIdParts;

  // 兼容旧版 Skill 的（1）（2）（3）输出格式。
  const lines = source.split(/\r?\n/);
  const parts = [];
  let preface = [];
  let current = null;
  for (const line of lines) {
    const marker = line.match(NUMBERED_PROMPT_MARKER);
    if (marker) {
      if (current) parts.push({ label: current.label, content: current.lines.join('\n').trim() });
      current = { label: marker[1], lines: parts.length === 0 ? preface : [] };
      if (marker[2]?.trim()) current.lines.push(marker[2].trim());
      preface = [];
    } else if (current) {
      current.lines.push(line);
    } else {
      preface.push(line);
    }
  }
  if (current) parts.push({ label: current.label, content: current.lines.join('\n').trim() });
  const clean = parts.filter((part) => part.content);
  return clean.length ? clean : [{ label: '1', content: source }];
};

const usedSceneNumbers = (existing, sceneLabel) => promptsForScene(existing, sceneLabel)
  .map((item) => Number(String(item.label || '').split('-').at(-1)))
  .filter(Number.isFinite);

export const buildScenePromptRecords = ({ sceneLabel, parts, existing = [], skill = '', sourceText = '', generationMode, now = Date.now() }) => {
  const start = Math.max(0, ...usedSceneNumbers(existing, sceneLabel)) + 1;
  return (parts || []).map((part, index) => {
    const completeLabel = /^\d+-\d+-\d+$/.test(String(part.label || '').trim())
      ? String(part.label).trim()
      : `${sceneLabel}-${start + index}`;
    return {
      id: `${now}-${completeLabel}-${Math.random().toString(36).slice(2, 6)}`,
      label: completeLabel,
      sceneLabel,
      content: part.content || '',
      skill,
      sourceText,
      ...(['creative', 'quick'].includes(generationMode) ? { generationMode } : {}),
      createdAt: new Date(now).toISOString(),
    };
  });
};

export const getSceneVision = (episode, sceneLabel) => episode?.sceneVisions?.[sceneLabel] || '';

export const updateSceneVision = (episode, sceneLabel, content) => ({
  ...episode,
  sceneVisions: { ...(episode?.sceneVisions || {}), [sceneLabel]: content },
});

export const promptsForScene = (prompts, sceneLabel) => (prompts || []).filter((item) =>
  item.sceneLabel === sceneLabel || (!item.sceneLabel && item.label?.startsWith(`${sceneLabel}-`))
);

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

export const buildScenePromptRecords = ({ sceneLabel, parts, existing = [], skill = '', sourceText = '', now = Date.now() }) => {
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
      createdAt: new Date(now).toISOString(),
    };
  });
};

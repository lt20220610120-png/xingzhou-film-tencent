export const getSceneVision = (episode, sceneLabel) => episode?.sceneVisions?.[sceneLabel] || '';

export const updateSceneVision = (episode, sceneLabel, content) => ({
  ...episode,
  sceneVisions: { ...(episode?.sceneVisions || {}), [sceneLabel]: content },
});

export const promptsForScene = (prompts, sceneLabel) => (prompts || []).filter((item) =>
  item.sceneLabel === sceneLabel || (!item.sceneLabel && item.label?.startsWith(`${sceneLabel}-`))
);

const NUMBERED_PROMPT_MARKER = /^\s*[（(](\d+)[）)]\s*(.*)$/;

export const splitNumberedPromptOutput = (text) => {
  const source = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!source) return [];
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
  return (parts || []).map((part, index) => ({
    id: `${now}-${sceneLabel}-${start + index}-${Math.random().toString(36).slice(2, 6)}`,
    label: `${sceneLabel}-${start + index}`,
    sceneLabel,
    content: part.content || '',
    skill,
    sourceText,
    createdAt: new Date(now).toISOString(),
  }));
};

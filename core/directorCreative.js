export const getSceneVision = (episode, sceneLabel) => episode?.sceneVisions?.[sceneLabel] || '';

export const updateSceneVision = (episode, sceneLabel, content) => ({
  ...episode,
  sceneVisions: { ...(episode?.sceneVisions || {}), [sceneLabel]: content },
});

export const promptsForScene = (prompts, sceneLabel) => (prompts || []).filter((item) =>
  item.sceneLabel === sceneLabel || (!item.sceneLabel && item.label?.startsWith(`${sceneLabel}-`))
);

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

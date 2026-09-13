// Legacy director imports did not always assign IDs. Use the same deterministic
// identities in the renderer and cloud so selecting and patching a row agree.
const idText = value => value == null ? '' : String(value).trim();
const counts = rows => rows.reduce((map, row) => {
  const id = idText(row.id);
  if (id) map.set(id, (map.get(id) || 0) + 1);
  return map;
}, new Map());

function episodeAnchor(episode, index) {
  if (episode.kind === 'setting' || episode.title === '设定和小传') return 'setting';
  const contentNumber = String(episode.content || '').match(/^\s*(?:场景\s*)?(\d+)\s*[-—－]\s*\d+/m)?.[1];
  const titleNumber = String(episode.title || '').match(/(?:第\s*|Episode\s*|EP\s*)(\d+)/i)?.[1];
  return contentNumber || titleNumber || idText(episode.title) || `row-${index + 1}`;
}

function normalizeIds(rows, prefix, anchor) {
  const occurrences = counts(rows);
  const used = new Set([...occurrences].filter(([, count]) => count === 1).map(([id]) => id));
  return rows.map((row, index) => {
    const current = idText(row.id);
    if (current && occurrences.get(current) === 1) return { ...row, id: current };
    const stem = `${prefix}:${encodeURIComponent(anchor(row, index))}`;
    let id = stem, suffix = 1;
    while (used.has(id)) id = `${stem}:${++suffix}`;
    used.add(id);
    return { ...row, id };
  });
}

export function normalizeStoryboardEpisodes(episodes = []) {
  const rows = Array.isArray(episodes) ? episodes.filter(row => row && typeof row === 'object') : [];
  return normalizeIds(rows, 'legacy-episode', episodeAnchor).map(episode => ({
    ...episode,
    prompts: normalizeIds(Array.isArray(episode.prompts) ? episode.prompts : [], `legacy-shot:${episode.id}`,
      (prompt, index) => idText(prompt.label) || `row-${index + 1}`),
  }));
}

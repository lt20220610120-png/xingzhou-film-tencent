const validSeconds = (value) => Number.isInteger(value) && value >= 1 && value <= 30;
const validTiming = (prompt) => validSeconds(prompt?.recommendedDurationSeconds)
  && validSeconds(prompt?.maxDurationSeconds)
  && prompt.recommendedDurationSeconds <= prompt.maxDurationSeconds
  && ['estimated', 'needs-review'].includes(prompt.durationStatus);

export const markPromptTimingStale = (prompt) => prompt?.segmentationMode === 'auto' && validTiming(prompt)
  ? { ...prompt, durationStatus: 'needs-review' } : prompt;

export function formatPromptTimingMetadata(prompt) {
  if (prompt?.segmentationMode !== 'auto' || !validTiming(prompt)) return '';
  return `行舟影视时长：建议=${prompt.recommendedDurationSeconds}秒；上限=${prompt.maxDurationSeconds}秒；状态=${prompt.durationStatus === 'needs-review' ? '待复核' : '估算'}`;
}

// Only an application's first standalone row is structural. Identical prose later
// in a Skill output must remain prose, and malformed metadata must remain visible.
export function extractPromptTimingMetadata(value) {
  const text = String(value ?? '');
  const match = text.match(/^(?:[ \t]*(?:\r\n|\n|\r))*行舟影视时长：建议=(\d+)秒；上限=(\d+)秒；状态=(估算|待复核)(?=\r\n|\n|\r|$)/);
  if (!match) return { text };
  const timing = {
    segmentationMode: 'auto', recommendedDurationSeconds: Number(match[1]),
    maxDurationSeconds: Number(match[2]), durationStatus: match[3] === '待复核' ? 'needs-review' : 'estimated',
    timingRulesVersion: 1,
  };
  if (!validTiming(timing)) return { text };
  const rowStart = match[0].lastIndexOf('行舟影视时长：');
  const suffix = text.slice(match[0].length).replace(/^(?:\r\n|\n|\r)/, '');
  return { text: text.slice(0, rowStart) + suffix, timing };
}

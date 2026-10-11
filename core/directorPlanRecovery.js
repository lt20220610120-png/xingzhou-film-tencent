import { parseStructuredJson, validateScenePlan } from './directorSegmentation.js';
import { getDirectorSegmentTimingFacts } from './directorTiming.js';
import { packScenePlan } from './directorPlanPacking.js';

// Accept a complete JSON object surrounded by commentary/fences, never guess
// missing braces or rewrite quoted source anchors in a truncated response.
export function parseScenePlanningJson(output) {
  try { return parseStructuredJson(output); } catch (original) {
    if (typeof output !== 'string') throw original;
    let start = -1, depth = 0, quoted = false, escaped = false;
    const objects = [];
    for (let i = 0; i < output.length; i++) {
      const char = output[i];
      if (start < 0) { if (char === '{') { start = i; depth = 1; } continue; }
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try {
          const candidate = parseStructuredJson(output.slice(start, i + 1));
          if (Array.isArray(candidate.segments) || candidate.capacityIssue) objects.push(candidate);
        } catch {}
        start = -1;
      }
    }
    if (objects.length === 1) return objects[0];
    throw original;
  }
}

/** Last bounded recovery after model planning fails. Derive the source ranges
 * from the immutable tape, then use the normal packer and full validator.
 * Unknown actions get a transparent editorial estimate; explicit durations
 * are never shortened. An indivisible over-limit sentence still needs review.
 */
export function recoverScenePlan({ tape, maxDurationSeconds }) {
  if (!tape?.sourceText?.trim()) return { ok: false, issues: [{ code: 'EMPTY_SOURCE', message: '当前场景没有可分段正文' }] };
  const facts = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText, maxDurationSeconds });
  const unknown = facts.actionCues.filter(cue => !cue.bounded);
  const unknownSeconds = unknown.reduce((n, cue) => n + Math.max(3, cue.minimumSeconds || 0), 0);
  const actionSeconds = facts.actionTimeline.actionSeconds + unknownSeconds;
  const timing = { speechSeconds: facts.speechSecondsAt4, actionSeconds, overlapSeconds: facts.actionTimeline.overlapSeconds, transitionSeconds: 0 };
  // A static/source-only shot still has a visible performance, not zero time.
  if (timing.speechSeconds + timing.actionSeconds - timing.overlapSeconds <= 0) timing.actionSeconds = Math.min(2, maxDurationSeconds || 35);
  const candidate = { segments: [{
    end: { unitId: tape.units.at(-1).id }, timing,
    startState: '以本场原文起始的人物、道具、光源和位置为准。',
    endState: '保留本场原文已经发生的状态变化；不增加后续事件。',
    boundary: 'scene-end', visualNotes: [],
  }] };
  const packed = packScenePlan(candidate, { tape, maxDurationSeconds });
  const result = validateScenePlan(packed.candidate, { tape, maxDurationSeconds, groundedTiming: true });
  return { ...result, candidate: packed.candidate, method: 'source-timing-recovery', estimatedUnknownActions: unknown.length };
}

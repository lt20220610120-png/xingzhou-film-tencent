// Explicit user-authorized editorial exception, not a general higher cap.
// Keep natural timing intact so a 33-second rehearsal is never represented as
// a natural 30-second performance. The requested video target remains 30.
export const WHOLE_SCENE_COMPRESSION_KIND = 'whole-scene-30-second-fast-pace';
export function wholeSceneCompression({ naturalEstimatedSeconds, maxDurationSeconds, sourceStart = 0, sourceEnd, sourceLength, segmentCount } = {}) {
  if (maxDurationSeconds !== 30 || segmentCount !== 1 || sourceStart !== 0 || sourceEnd !== sourceLength
    || !(naturalEstimatedSeconds > 30 && naturalEstimatedSeconds <= 35) || !Number.isFinite(naturalEstimatedSeconds)) return null;
  return { version: 1, kind: WHOLE_SCENE_COMPRESSION_KIND, targetDurationSeconds: 30, naturalEstimatedSeconds,
    paceFactor: Math.round(naturalEstimatedSeconds / 30 * 10000) / 10000 };
}
export function validWholeSceneCompression(segment, { maxDurationSeconds, sourceLength, segmentCount, naturalEstimatedSeconds } = {}) {
  const expected = wholeSceneCompression({ naturalEstimatedSeconds, maxDurationSeconds, sourceStart: segment.sourceStart, sourceEnd: segment.sourceEnd, sourceLength, segmentCount });
  if (!expected) return false;
  const actual = segment.durationCompression;
  return actual?.version === expected.version && actual.kind === expected.kind && actual.targetDurationSeconds === 30
    && actual.naturalEstimatedSeconds === naturalEstimatedSeconds && segment.naturalEstimatedSeconds === naturalEstimatedSeconds
    && actual.paceFactor === expected.paceFactor
    && segment.estimatedSeconds === 30 && segment.recommendedDurationSeconds === 30;
}

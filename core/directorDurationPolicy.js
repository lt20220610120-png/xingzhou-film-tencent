export const assertDirectorDurationSelection = value => {
  if (!Number.isInteger(value) || value < 0 || value > 35) throw new Error('最高视频时长必须为 0～35 的整数秒，0 表示自动估算（单条最高35秒）');
  return value;
};

export const effectiveDirectorDurationLimit = value => assertDirectorDurationSelection(value) === 0 ? 35 : value;

export const normalizeDirectorDurationSelection = (value, fallback = 30) => Number.isInteger(value) && value >= 0 && value <= 35 ? value : fallback;

export const DEFAULT_DIRECTOR_PACE = 100;
export const MIN_DIRECTOR_PACE = -200;
export function assertDirectorTimingScale(value) {
  if(value===undefined||value===null)return undefined;
  if(!Number.isFinite(value)||value<=0||value>1)throw new Error('场景划分基准无效');
  return value;
}
export const normalizeDirectorPace = (value, fallback = DEFAULT_DIRECTOR_PACE) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(MIN_DIRECTOR_PACE, Math.min(DEFAULT_DIRECTOR_PACE, Math.round(n))) : fallback;
};
export const assertDirectorPace = value => {
  if (value === undefined) return DEFAULT_DIRECTOR_PACE;
  if (!Number.isInteger(value) || value < MIN_DIRECTOR_PACE || value > DEFAULT_DIRECTOR_PACE) throw new Error('节奏刻度无效');
  return value;
};
export function resolveDirectorPaceProfile(value = DEFAULT_DIRECTOR_PACE) {
  const pace = normalizeDirectorPace(value);
  if(pace<-100)return {...resolveDirectorPaceProfile(-100),pace,tier:'calibrated',tierLabel:'场景校准'};
  // Extend the compact side without reinterpreting saved 0–100 settings.
  if (pace < 0) {
    const compact=resolveDirectorPaceProfile(0), f=pace/-100;
    const lerp=(key,end)=>Math.round((compact[key]+(end-compact[key])*f)*1000)/1000;
    return {...compact,pace,tier:pace<=-50?'extra-compact':'compact',tierLabel:pace<=-50?'极紧凑':'紧凑',
      cjkCharsPerSec:lerp('cjkCharsPerSec',8.4),latinWordsPerSec:lerp('latinWordsPerSec',4.25),
      utteranceBaseSec:lerp('utteranceBaseSec',0.08),punctPauseSec:lerp('punctPauseSec',0.015),
      visualBeatScale:lerp('visualBeatScale',0.34),unclassifiedBeatSec:lerp('unclassifiedBeatSec',0.42),
      entranceBeatSec:lerp('entranceBeatSec',0.9),instantVisualSec:lerp('instantVisualSec',0.15),
      scaleFromNormal:lerp('scaleFromNormal',0.54)};
  }
  const f = pace / 100;
  const tier = pace <= 33 ? 'compact' : pace <= 66 ? 'balanced' : 'normal';
  const tierLabel = tier === 'compact' ? '紧凑' : tier === 'balanced' ? '适中' : '正常';
  return {
    pace,
    tier,
    tierLabel,
    cjkCharsPerSec: Math.round((6.0 - 0.9 * f) * 1000) / 1000,       // 紧凑 6.0 -> 适中 5.55 -> 正常 5.1 字/秒
    latinWordsPerSec: Math.round((3.1 - 0.7 * f) * 1000) / 1000,     // 紧凑 3.1 -> 适中 2.75 -> 正常 2.4 词/秒
    utteranceBaseSec: Math.round((0.18 + 0.20 * f) * 1000) / 1000,   // 紧凑 0.18s -> 适中 0.28s -> 正常 0.38s
    punctPauseSec: Math.round((0.04 + 0.07 * f) * 1000) / 1000,      // 紧凑 0.04s -> 适中 0.075s -> 正常 0.11s
    visualBeatScale: Math.round((0.58 + 0.42 * f) * 1000) / 1000,    // 紧凑 0.58x -> 适中 0.79x -> 正常 1.00x
    unclassifiedBeatSec: Math.round((0.68 + 0.52 * f) * 1000) / 1000,// 紧凑 0.68s -> 适中 0.94s -> 正常 1.20s
    entranceBeatSec: Math.round((1.35 + 1.05 * f) * 1000) / 1000,    // 紧凑 1.35s -> 适中 1.88s -> 正常 2.40s
    instantVisualSec: Math.round((0.20 + 0.30 * f) * 1000) / 1000,   // 紧凑 0.20s -> 适中 0.35s -> 正常 0.50s
    maxModelMultiplier: Math.round((1.05 + 0.10 * f) * 1000) / 1000, // 紧凑 1.05x -> 适中 1.10x -> 正常 1.15x
    scaleFromNormal: Math.round((0.77 + 0.23 * f) * 1000) / 1000,    // 实时预览与梯度缩放系数
  };
}

export function directorPaceLabel(pace) {
  return `${resolveDirectorPaceProfile(pace).tierLabel} · 刻度 ${normalizeDirectorPace(pace)-MIN_DIRECTOR_PACE}`;
}

export function directorPaceDescription(value) {
  const {tierLabel,cjkCharsPerSec,latinWordsPerSec}=resolveDirectorPaceProfile(value);
  return `${tierLabel}（中文参考约 ${cjkCharsPerSec}字/秒，英文参考约 ${latinWordsPerSec}词/秒）`;
}

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

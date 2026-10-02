import { parseDirectorDialogues, countDialogueCharacters } from './directorDialogue.js';
import { describeDirectorActionTiming, estimateDirectorActionTimeline, DIRECTOR_ACTION_TIMING_REFERENCE } from './directorActionTiming.js';
import { wholeSceneCompression } from './directorDurationPolicy.js';

export const DIRECTOR_SPEECH_CHARACTERS_PER_SECOND = 4;
const slowRate = 3;
const round = value => Math.round(value * 100) / 100;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// These are candidate visible beats, not a script-reading word count and not
// proof of their running time. Staging may combine beats or overlap speech.
export const extractDirectorVisualBeats = sourceText => {
  const source = String(sourceText || '');
  const beats = [];
  for (const match of source.matchAll(/[△Δ]([^\n△Δ]+)/g)) {
    const contentStart = match.index + 1;
    const content = match[1];
    for (const sentence of content.matchAll(/[^。！？!?；;]+[。！？!?；;]*/g)) {
      const sourceQuote = sentence[0].trim();
      if (!sourceQuote) continue;
      const leading = sentence[0].indexOf(sourceQuote);
      const estimate = describeDirectorActionTiming(sourceQuote);
      beats.push({ sourceStart: contentStart + sentence.index + leading, sourceEnd: contentStart + sentence.index + leading + sourceQuote.length, sourceQuote, ...estimate });
    }
  }
  return beats;
};

const dialogueRanges = dialogue => Array.isArray(dialogue.ranges) ? dialogue.ranges : Number.isInteger(dialogue.speechStart) && Number.isInteger(dialogue.speechEnd) ? [{ start: dialogue.speechStart, end: dialogue.speechEnd }] : Number.isInteger(dialogue.sourceStart) && Number.isInteger(dialogue.sourceEnd) ? [{ start: dialogue.sourceStart, end: dialogue.sourceEnd }] : [];

const hasOnlySpokenContent = (source, start, end, records) => {
  const ranges = records.flatMap(record => dialogueRanges(record).map((range, index) => {
    const lineStart = source.lastIndexOf('\n', range.start - 1) + 1;
    const prefix = source.slice(lineStart, range.start);
    const headerOnly = index === 0 && /^[\t ]*[\p{L}][\p{L}\p{N}·.]*(?:[\t ]+(?:O\.?S\.?|V\.?O\.?))?(?:[\t ]*[（(][^）)\n]*[）)])*[\t ]*[：:][\t ]*[“『「‘"]?$/u.test(prefix);
    return { start: Math.max(start, headerOnly ? lineStart : range.start), end: Math.min(end, range.end) };
  })).filter(range => range.end > range.start).sort((a, b) => a.start - b.start);
  if (!ranges.length) return false;
  let cursor = start, remainder = '';
  for (const range of ranges) { remainder += source.slice(cursor, Math.max(cursor, range.start)); cursor = Math.max(cursor, range.end); }
  remainder += source.slice(cursor, end);
  return !remainder.replace(/^[\t ]*(?:人|人物|角色|出场人物|出场角色)[\t ]*[：:][^\n]*$/gm, '').replace(/[”』」’"]/g, '').trim();
};

export const getDirectorSegmentTimingFacts = ({ sourceText, sourceStart = 0, sourceEnd, dialogues, visualBeats, maxDurationSeconds } = {}) => {
  const source = String(sourceText || '');
  const end = sourceEnd ?? source.length;
  const records = dialogues || parseDirectorDialogues(source);
  const speech = records.map(dialogue => {
    const ranges = dialogueRanges(dialogue).map(range => ({ start: Math.max(sourceStart, range.start), end: Math.min(end, range.end) })).filter(range => range.end > range.start);
    const text = ranges.map(range => source.slice(range.start, range.end)).join('\n');
    return { speaker: dialogue.speaker, mode: dialogue.mode, characterCount: countDialogueCharacters(text), ranges };
  }).filter(dialogue => dialogue.characterCount > 0);
  const speechCharacterCount = speech.reduce((total, dialogue) => total + dialogue.characterCount, 0);
  const allBeats = visualBeats || extractDirectorVisualBeats(source);
  const onlyEstablishing = records.length === 0 && allBeats.length > 0 && allBeats.every(beat => beat.category === 'environment');
  const establishingSeconds = Number.isInteger(maxDurationSeconds) && maxDurationSeconds > 0 ? Math.min(2, maxDurationSeconds) : 2;
  const actionCues = allBeats.filter(beat => beat.sourceEnd > sourceStart && beat.sourceStart < end).map(beat => ({ ...beat, sourceStart: Math.max(sourceStart, beat.sourceStart), sourceEnd: Math.min(end, beat.sourceEnd), sourceQuote: source.slice(Math.max(sourceStart, beat.sourceStart), Math.min(end, beat.sourceEnd)), ...(onlyEstablishing && beat === allBeats[0] ? { category: 'establishing-only', seconds: establishingSeconds, typicalSeconds: [1, 2], bounded: true } : {}) }));
  const actionTimeline = estimateDirectorActionTimeline({ sourceText: source, actionCues, dialogues: speech });
  return {
    sourceStart, sourceEnd: end, speechCharacterCount,
    speechSecondsAt4: round(speechCharacterCount / DIRECTOR_SPEECH_CHARACTERS_PER_SECOND),
    speechSecondsAt3: round(speechCharacterCount / slowRate),
    dialogues: speech, actionCues: actionTimeline.cues, actionTimeline,
    onlySpokenContent: hasOnlySpokenContent(source, sourceStart, end, records),
    quickPerformanceSeconds: round(speechCharacterCount / 4 + actionTimeline.actionSeconds - actionTimeline.overlapSeconds),
  };
};

export const buildSceneTimingFacts = tape => {
  const sourceText = String(tape?.sourceText || '');
  const dialogues = parseDirectorDialogues(sourceText);
  const visualBeats = extractDirectorVisualBeats(sourceText);
  const scene = getDirectorSegmentTimingFacts({ sourceText, dialogues, visualBeats });
  return {
    version: 2,
    rules: { normalSpeechCharactersPerSecond: 4, slowerSpeechCharactersPerSecond: 3, typicalIndependentVisualBeatSeconds: [2, 3], actionTextCharacterCountIsNotDuration: true, shotCountIsNotDuration: true, staticDescriptionAddsSeconds: false, automaticEmptyOpeningShot: false, cutsAddSeconds: false, actionReference: DIRECTOR_ACTION_TIMING_REFERENCE.map(({ pattern, ...rule }) => rule) },
    scene,
    units: (tape?.units || []).map(unit => ({ unitId: unit.id, ...getDirectorSegmentTimingFacts({ sourceText, sourceStart: unit.start, sourceEnd: unit.end, dialogues, visualBeats }) })),
  };
};

export const validateDirectorSegmentTiming = ({ sourceText, sourceStart, sourceEnd, timing, maxDurationSeconds, segmentIndex, wholeSceneCompression = false } = {}) => {
  const facts = getDirectorSegmentTimingFacts({ sourceText, sourceStart, sourceEnd });
  const issues = [];
  const issue = (code, message, evidence) => issues.push({ code, message, segmentIndex, evidence });
  // Allow only arithmetic/rounding variation, never an assumed speed of 6–8
  // Chinese characters per second to fit long original dialogue into a clip.
  const minimum = facts.speechSecondsAt4;
  const capacitySeconds = wholeSceneCompression && maxDurationSeconds === 30 && sourceStart === 0 && sourceEnd === sourceText.length ? 35 : maxDurationSeconds;
  if (minimum > capacitySeconds + 0.25) issue('SPEECH_CAPACITY_EXCEEDED', '原文可听台词按4字/秒已超过最高时长，需要在完整句子的边界继续细分，不能吞字或删除台词', { speechCharacterCount: facts.speechCharacterCount, speechSecondsAt4: minimum, maxDurationSeconds });
  if (finite(timing?.speechSeconds) && timing.speechSeconds + 0.5 < minimum) issue('SPEECH_TIMING_UNDERESTIMATED', '对白、内心OS及可听VO必须按原文口播字数计时；当前计划少计了语音时长', { claimedSpeechSeconds: timing.speechSeconds, speechCharacterCount: facts.speechCharacterCount, speechSecondsAt4: minimum });
  if (finite(timing?.speechSeconds) && timing.speechSeconds > facts.speechSecondsAt3 + 2) issue('SPEECH_TIMING_INFLATED', '不能把少量台词虚报为整条语音时长来凑满上限；按3~4字/秒重估，真实独立动作另计', { claimedSpeechSeconds: timing.speechSeconds, speechCharacterCount: facts.speechCharacterCount, speechSecondsAt3: facts.speechSecondsAt3 });
  return { ok: !issues.length, issues, facts };
};

// Rehearse quick-mode timing against immutable source evidence. Unknown or
// prolonged actions retain the planner's estimate; known compact performances
// use the editorial reference rather than arbitrary holds/empty shots.
export const recalibrateScenePlanTimings = (candidate, { tape, maxDurationSeconds } = {}) => {
  let parsed;
  try {
    parsed = typeof candidate === 'string' ? JSON.parse(candidate.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')) : structuredClone(candidate);
  } catch { return { candidate, changed: false, changes: [] }; }
  if (!Array.isArray(parsed?.segments) || !tape?.sourceText || !Array.isArray(tape.units)) return { candidate: parsed, changed: false, changes: [] };
  const units = new Map(tape.units.map(unit => [unit.id, unit]));
  const changes = [];
  let sourceStart = 0;
  for (const [arrayIndex, segment] of parsed.segments.entries()) {
    delete segment.durationCompression; delete segment.naturalEstimatedSeconds;
    const unit = units.get(segment?.end?.unitId);
    if (!unit) return { candidate: parsed, changed: Boolean(changes.length), changes };
    const prefix = segment.end.prefix;
    if (prefix !== undefined && (typeof prefix !== 'string' || !prefix || !unit.text.startsWith(prefix))) return { candidate: parsed, changed: Boolean(changes.length), changes };
    const sourceEnd = prefix === undefined ? unit.end : unit.start + prefix.length;
    if (sourceEnd <= sourceStart) return { candidate: parsed, changed: Boolean(changes.length), changes };
    const timing = segment.timing;
    if (finite(timing?.speechSeconds)) {
      const facts = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText, sourceStart, sourceEnd, maxDurationSeconds });
      const previousTiming = { ...timing };
      timing.speechSeconds = facts.speechSecondsAt4;
      if (finite(timing.actionSeconds) && finite(timing.overlapSeconds) && finite(timing.transitionSeconds)) {
        const timeline = facts.actionTimeline;
        const realCues = facts.actionCues.filter(cue => cue.category !== 'environment');
        const minimumUnknown = realCues.filter(cue => !cue.bounded).reduce((sum, cue) => sum + (cue.minimumSeconds || 0), 0);
        const unknownShare = realCues.length ? Math.max(minimumUnknown, previousTiming.actionSeconds * timeline.unknownBeatCount / realCues.length) : 0;
        // No △ evidence: retain genuine in-dialogue staging estimates, except
        // a scene made entirely of spoken text does not imply extra gestures.
        const action = realCues.length ? timeline.actionSeconds + unknownShare : facts.actionCues.length || facts.onlySpokenContent ? 0 : previousTiming.actionSeconds;
        timing.actionSeconds = round(action);
        timing.overlapSeconds = round(Math.min(timing.speechSeconds, action, timeline.overlapSeconds + Math.min(unknownShare, previousTiming.overlapSeconds)));
        if (!realCues.length && !facts.actionCues.length) timing.overlapSeconds = Math.min(timing.speechSeconds, action, previousTiming.overlapSeconds);
        if (!/(?:淡入|淡出|叠化|空镜).{0,12}\d+(?:\.\d+)?秒/.test(tape.sourceText.slice(sourceStart, sourceEnd))) timing.transitionSeconds = 0;
      }
      if (Object.keys(previousTiming).some(key => previousTiming[key] !== timing[key])) changes.push({ segmentIndex: arrayIndex + 1, previousTiming, timing: { ...timing }, previousSpeechSeconds: previousTiming.speechSeconds, speechSeconds: timing.speechSeconds, speechCharacterCount: facts.speechCharacterCount });
      segment.timingFacts = facts;
    }
    sourceStart = sourceEnd;
  }
  // Model boundaries must not destroy simultaneous action/voiceover and turn
  // one compact scene into a thirty-second clip plus a sliver.
  if (parsed.segments.length > 1 && sourceStart === tape.sourceText.length && Number.isInteger(maxDurationSeconds)) {
    const whole = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText, maxDurationSeconds });
    const mergeLimit = maxDurationSeconds === 30 ? 35 : maxDurationSeconds;
    if (!whole.actionTimeline.unknownBeatCount && whole.quickPerformanceSeconds > 0 && whole.quickPerformanceSeconds <= mergeLimit) {
      const first = parsed.segments[0], last = parsed.segments.at(-1);
      parsed.segments = [{ ...last, startState: first.startState, timing: { speechSeconds: whole.speechSecondsAt4, actionSeconds: whole.actionTimeline.actionSeconds, overlapSeconds: whole.actionTimeline.overlapSeconds, transitionSeconds: 0 }, visualNotes: parsed.segments.flatMap(segment => segment.visualNotes || []), timingFacts: whole }];
      changes.push({ wholeSceneMerged: true, estimatedSeconds: whole.quickPerformanceSeconds });
    }
  }
  if (parsed.segments.length === 1 && sourceStart === tape.sourceText.length) {
    const segment = parsed.segments[0], timing = segment.timing;
    const naturalEstimatedSeconds = finite(timing?.speechSeconds) && finite(timing?.actionSeconds) && finite(timing?.overlapSeconds) && finite(timing?.transitionSeconds)
      ? round(timing.speechSeconds + timing.actionSeconds - timing.overlapSeconds + timing.transitionSeconds) : NaN;
    const compression = wholeSceneCompression({ naturalEstimatedSeconds, maxDurationSeconds, sourceEnd: sourceStart, sourceLength: tape.sourceText.length, segmentCount: 1 });
    if (compression) {
      segment.durationCompression = compression; segment.naturalEstimatedSeconds = naturalEstimatedSeconds;
      segment.estimatedSeconds = 30; segment.recommendedDurationSeconds = 30;
      changes.push({ wholeSceneCompressed: true, naturalEstimatedSeconds, targetDurationSeconds: 30 });
    }
  }
  return { candidate: parsed, changed: Boolean(changes.length), changes };
};

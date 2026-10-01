import { parseDirectorDialogues, countDialogueCharacters } from './directorDialogue.js';

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
      beats.push({ sourceStart: contentStart + sentence.index + leading, sourceEnd: contentStart + sentence.index + leading + sourceQuote.length, sourceQuote, typicalSeconds: [2, 3] });
    }
  }
  return beats;
};

const dialogueRanges = dialogue => Array.isArray(dialogue.ranges) ? dialogue.ranges : Number.isInteger(dialogue.speechStart) && Number.isInteger(dialogue.speechEnd) ? [{ start: dialogue.speechStart, end: dialogue.speechEnd }] : Number.isInteger(dialogue.sourceStart) && Number.isInteger(dialogue.sourceEnd) ? [{ start: dialogue.sourceStart, end: dialogue.sourceEnd }] : [];

export const getDirectorSegmentTimingFacts = ({ sourceText, sourceStart = 0, sourceEnd, dialogues, visualBeats } = {}) => {
  const source = String(sourceText || '');
  const end = sourceEnd ?? source.length;
  const records = dialogues || parseDirectorDialogues(source);
  const speech = records.map(dialogue => {
    const ranges = dialogueRanges(dialogue).map(range => ({ start: Math.max(sourceStart, range.start), end: Math.min(end, range.end) })).filter(range => range.end > range.start);
    const text = ranges.map(range => source.slice(range.start, range.end)).join('\n');
    return { speaker: dialogue.speaker, mode: dialogue.mode, characterCount: countDialogueCharacters(text), ranges };
  }).filter(dialogue => dialogue.characterCount > 0);
  const speechCharacterCount = speech.reduce((total, dialogue) => total + dialogue.characterCount, 0);
  const actionCues = (visualBeats || extractDirectorVisualBeats(source)).filter(beat => beat.sourceEnd > sourceStart && beat.sourceStart < end).map(beat => ({ ...beat, sourceStart: Math.max(sourceStart, beat.sourceStart), sourceEnd: Math.min(end, beat.sourceEnd), sourceQuote: source.slice(Math.max(sourceStart, beat.sourceStart), Math.min(end, beat.sourceEnd)) }));
  return {
    sourceStart, sourceEnd: end, speechCharacterCount,
    speechSecondsAt4: round(speechCharacterCount / DIRECTOR_SPEECH_CHARACTERS_PER_SECOND),
    speechSecondsAt3: round(speechCharacterCount / slowRate),
    dialogues: speech, actionCues,
  };
};

export const buildSceneTimingFacts = tape => {
  const sourceText = String(tape?.sourceText || '');
  const dialogues = parseDirectorDialogues(sourceText);
  const visualBeats = extractDirectorVisualBeats(sourceText);
  const scene = getDirectorSegmentTimingFacts({ sourceText, dialogues, visualBeats });
  return {
    version: 1,
    rules: { normalSpeechCharactersPerSecond: 4, slowerSpeechCharactersPerSecond: 3, typicalIndependentVisualBeatSeconds: [2, 3], actionTextCharacterCountIsNotDuration: true, shotCountIsNotDuration: true },
    scene,
    units: (tape?.units || []).map(unit => ({ unitId: unit.id, ...getDirectorSegmentTimingFacts({ sourceText, sourceStart: unit.start, sourceEnd: unit.end, dialogues, visualBeats }) })),
  };
};

export const validateDirectorSegmentTiming = ({ sourceText, sourceStart, sourceEnd, timing, maxDurationSeconds, segmentIndex } = {}) => {
  const facts = getDirectorSegmentTimingFacts({ sourceText, sourceStart, sourceEnd });
  const issues = [];
  const issue = (code, message, evidence) => issues.push({ code, message, segmentIndex, evidence });
  // Allow only arithmetic/rounding variation, never an assumed speed of 6–8
  // Chinese characters per second to fit long original dialogue into a clip.
  const minimum = facts.speechSecondsAt4;
  if (minimum > maxDurationSeconds + 0.25) issue('SPEECH_CAPACITY_EXCEEDED', '原文可听台词按4字/秒已超过最高时长，需要在语义边界继续细分，不能加速吞字或删除台词', { speechCharacterCount: facts.speechCharacterCount, speechSecondsAt4: minimum, maxDurationSeconds });
  if (finite(timing?.speechSeconds) && timing.speechSeconds + 0.5 < minimum) issue('SPEECH_TIMING_UNDERESTIMATED', '对白、内心OS及可听VO必须按原文口播字数计时；当前计划少计了语音时长', { claimedSpeechSeconds: timing.speechSeconds, speechCharacterCount: facts.speechCharacterCount, speechSecondsAt4: minimum });
  if (finite(timing?.speechSeconds) && timing.speechSeconds > facts.speechSecondsAt3 + 2) issue('SPEECH_TIMING_INFLATED', '不能把少量台词虚报为整条语音时长来凑满上限；按3~4字/秒重估，真实独立动作另计', { claimedSpeechSeconds: timing.speechSeconds, speechCharacterCount: facts.speechCharacterCount, speechSecondsAt3: facts.speechSecondsAt3 });
  return { ok: !issues.length, issues, facts };
};

// Only recalibrate known spoken text. Never invent action duration, alter a
// source anchor, shorten dialogue or silently clip a recommendation to a cap.
// A corrected total may require another planning pass at different anchors.
export const recalibrateScenePlanTimings = (candidate, { tape } = {}) => {
  let parsed;
  try {
    parsed = typeof candidate === 'string' ? JSON.parse(candidate.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')) : structuredClone(candidate);
  } catch { return { candidate, changed: false, changes: [] }; }
  if (!Array.isArray(parsed?.segments) || !tape?.sourceText || !Array.isArray(tape.units)) return { candidate: parsed, changed: false, changes: [] };
  const units = new Map(tape.units.map(unit => [unit.id, unit]));
  const changes = [];
  let sourceStart = 0;
  for (const [arrayIndex, segment] of parsed.segments.entries()) {
    const unit = units.get(segment?.end?.unitId);
    if (!unit) return { candidate: parsed, changed: Boolean(changes.length), changes };
    const prefix = segment.end.prefix;
    if (prefix !== undefined && (typeof prefix !== 'string' || !prefix || !unit.text.startsWith(prefix))) return { candidate: parsed, changed: Boolean(changes.length), changes };
    const sourceEnd = prefix === undefined ? unit.end : unit.start + prefix.length;
    if (sourceEnd <= sourceStart) return { candidate: parsed, changed: Boolean(changes.length), changes };
    const timing = segment.timing;
    if (finite(timing?.speechSeconds)) {
      const facts = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText, sourceStart, sourceEnd });
      if (timing.speechSeconds + 0.5 < facts.speechSecondsAt4 || timing.speechSeconds > facts.speechSecondsAt3 + 2) {
        const previousSpeechSeconds = timing.speechSeconds;
        timing.speechSeconds = facts.speechSecondsAt4;
        if (finite(timing.overlapSeconds) && finite(timing.actionSeconds)) timing.overlapSeconds = Math.min(timing.overlapSeconds, timing.speechSeconds, timing.actionSeconds);
        changes.push({ segmentIndex: arrayIndex + 1, previousSpeechSeconds, speechSeconds: timing.speechSeconds, speechCharacterCount: facts.speechCharacterCount });
      }
      segment.timingFacts = facts;
    }
    sourceStart = sourceEnd;
  }
  return { candidate: parsed, changed: Boolean(changes.length), changes };
};

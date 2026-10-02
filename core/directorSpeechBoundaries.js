import { parseDirectorDialogues, countDialogueCharacters } from './directorDialogue.js';

/** A short turn is atomic. Only a turn longer than a clip may cross clips,
 * and then only after a complete sentence, never a comma or a spoken word.
 * All positions remain UTF-16 offsets in the immutable source tape. */
export function directorSpeechBoundary({ sourceText, sourceEnd, maxDurationSeconds, dialogues } = {}) {
  const source = String(sourceText || '');
  const records = dialogues || parseDirectorDialogues(source);
  for (const record of records) {
    const speechStart = record.ranges?.[0]?.start;
    if (!Number.isInteger(speechStart)) continue;
    const lineStart = source.lastIndexOf('\n', speechStart - 1) + 1;
    const escapedSpeaker = String(record.speaker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const header = source.slice(lineStart, speechStart).match(new RegExp(`${escapedSpeaker}(?:[\\t ]*(?:O\\.?S\\.?|V\\.?O\\.?))?(?:[\\t ]*[（(][^）)\\n]*[）)])*[\\t ]*[：:][\\t ]*[“『「‘"]?$`, 'u'));
    const headerStart = Number.isInteger(record.headerStart) ? record.headerStart : header ? lineStart + header.index : speechStart;
    if (sourceEnd > headerStart && sourceEnd <= speechStart) return { ok: false, speaker: record.speaker, headerInterrupted: true };
  }
  const row = records.find(record => record.ranges?.some(range => sourceEnd > range.start && sourceEnd < range.end)
    || (record.ranges?.length > 1 && sourceEnd > record.ranges[0].start && sourceEnd < record.ranges.at(-1).end));
  if (!row) return { ok: true };
  const seconds = countDialogueCharacters(row.speech) / 4;
  const before = source.slice(row.ranges[0].start, sourceEnd).trimEnd();
  const completeSentence = /[。！？!?](?:[”』」’"）)]*)$/u.test(before);
  return { ok: seconds > maxDurationSeconds && completeSentence, speaker: row.speaker, speechSeconds: seconds, completeSentence };
}

/** A full turn cannot be moved forward merely to satisfy the fill ratio.
 * The exception is source-derived: the next entire turn (or first complete
 * sentence of a long turn) does not fit in the remaining clip time. */
export function completeDialogueNeedsNextClip({ sourceText, sourceEnd, estimatedSeconds, maxDurationSeconds } = {}) {
  const source = String(sourceText || '');
  if (!directorSpeechBoundary({ sourceText: source, sourceEnd, maxDurationSeconds }).ok) return false;
  const records = parseDirectorDialogues(source);
  const next = records.find(record => record.ranges.at(-1).end > sourceEnd);
  if (!next) return false;
  let speech = next.ranges.filter(range => range.end > sourceEnd).map(range => source.slice(Math.max(sourceEnd, range.start), range.end)).join('\n');
  if (countDialogueCharacters(next.speech) / 4 > maxDurationSeconds) {
    const firstSentence = speech.match(/^[\s\S]*?[。！？!?](?:[”』」’"）)]*)/u);
    if (firstSentence) speech = firstSentence[0];
  }
  const nextSeconds = countDialogueCharacters(speech) / 4;
  return nextSeconds > 0 && estimatedSeconds + nextSeconds > maxDurationSeconds;
}

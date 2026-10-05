import { isIPModelRefusal } from '../../core/ipWorkspace.js';
import { readingBoundary } from '../../core/ipReading.js';

// Reading caches retain old results for inspection. Only usable notes from
// the current source count toward progress; overlapping retries count once.
export function countIPReadingCharacters(records, source) {
  if (!source?.id || typeof source.content !== 'string') return 0;
  const ranges = (records || []).filter(record =>
    record?.sourceId === source.id &&
    Number.isInteger(record.start) && Number.isInteger(record.end) &&
    record.start >= 0 && record.end > record.start && record.end <= source.content.length &&
    readingBoundary(source.content, record.start) === record.start &&
    readingBoundary(source.content, record.end) === record.end &&
    typeof record.note === 'string' && record.note.trim() && !isIPModelRefusal(record.note)
  ).sort((a, b) => a.start - b.start || b.end - a.end);
  let count = 0, end = 0;
  for (const range of ranges) {
    if (range.end > end) count += range.end - Math.max(end, range.start);
    end = Math.max(end, range.end);
  }
  return count;
}

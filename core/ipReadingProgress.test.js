import test from 'node:test';
import assert from 'node:assert/strict';
import { countIPReadingCharacters } from '../src/creator/ipReadingProgress.js';

const source = { id: 'current', content: '0123456789abcdef' };
const record = (start, end, note = '角色出发并归还失物。', sourceId = source.id) => ({ start, end, note, sourceId });

test('reading progress excludes retained model refusals, empty notes and other source versions', () => {
  const records = [
    record(0, 16, '身为一个语言模型，我没办法提供这方面的帮助。'),
    record(0, 16, '   '), record(0, 16, '已有阅读', 'old'), record(4, 8),
  ];
  assert.equal(countIPReadingCharacters(records, source), 4);
  assert.equal(countIPReadingCharacters([records[0]], source), 0);
});

test('reading progress counts the union of overlapping retries and leaves cache ordering intact', () => {
  const records = [record(10, 14), record(3, 7), record(0, 5), record(1, 3), record(5, 10), record(0, 5)];
  const before = structuredClone(records);
  assert.equal(countIPReadingCharacters(records, source), 14);
  assert.deepEqual(records, before);
  assert.equal(countIPReadingCharacters([record(0, 3), record(6, 9)], source), 6);
});

test('reading progress rejects malformed ranges and ranges inside a UTF-16 surrogate pair', () => {
  const unicode = { id: source.id, content: '😀甲乙' };
  assert.equal(countIPReadingCharacters([
    null, record(-1, 2), record(0, 20), record(1, 2), record(0, 1), record(2.5, 4), record(2, 2), record(2, 4),
  ], unicode), 2);
  assert.equal(countIPReadingCharacters([record(0, 2), record(2, 4)], unicode), 4);
  assert.equal(countIPReadingCharacters(undefined, source), 0);
  assert.equal(countIPReadingCharacters([], undefined), 0);
});

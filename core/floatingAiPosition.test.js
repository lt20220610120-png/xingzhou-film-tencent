import test from 'node:test';
import assert from 'node:assert/strict';
import { clampAiPosition, readAiPosition, isAiDrag } from './floatingAiPosition.js';

test('launcher can move to top, center and bottom while excluding the navigation rail', () => {
  const viewport = { width: 1440, height: 900, sidebarRight: 176 };
  assert.deepEqual(clampAiPosition({ left: 700, top: 300 }, viewport), { left: 700, top: 300 });
  assert.deepEqual(clampAiPosition({ left: -20, top: -30 }, viewport), { left: 188, top: 12 });
  assert.deepEqual(clampAiPosition({ left: 2000, top: 1400 }, viewport), { left: 1376, top: 836 });
});

test('a position from a larger window is brought into a resized window', () => {
  assert.deepEqual(clampAiPosition({ left: 1800, top: 1000 }, { width: 800, height: 600, sidebarRight: 64 }), { left: 736, top: 536 });
  assert.deepEqual(clampAiPosition({ left: 80, top: 80 }, { width: 1440, height: 900, sidebarRight: 176 }), { left: 188, top: 80 });
  const tiny = clampAiPosition(null, { width: 100, height: 80, sidebarRight: 176 });
  assert.ok(tiny.left >= 0 && tiny.left + 52 <= 100 && tiny.top + 52 <= 80);
});

test('old x/y positions migrate and invalid persisted data falls back safely', () => {
  assert.deepEqual(readAiPosition({ x: 200, y: 150, width: 180 }), { left: 200, top: 150 });
  assert.deepEqual(readAiPosition({ left: 220, top: 160 }), { left: 220, top: 160 });
  assert.equal(readAiPosition({ x: '40px', y: null }), null);
  assert.equal(readAiPosition(null), null);
});

test('minor pointer jitter remains a click, intentional movement starts a drag', () => {
  assert.equal(isAiDrag({ x: 100, y: 100 }, { x: 102, y: 102 }), false);
  assert.equal(isAiDrag({ x: 100, y: 100 }, { x: 106, y: 100 }), true);
  assert.equal(isAiDrag({ x: 100, y: 100 }, { x: 100, y: 90 }), true);
});

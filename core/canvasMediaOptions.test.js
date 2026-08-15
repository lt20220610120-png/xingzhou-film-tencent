import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_FORMATS, videoModelCapabilities } from './canvasStore.js';

test('图片生成提供标准画幅选项并映射到兼容尺寸', () => {
  assert.deepEqual(IMAGE_FORMATS.map((item) => item.value), ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);
  assert.ok(IMAGE_FORMATS.every((item) => item.size));
});

test('Seedance 2.0 提供 1 到 15 秒和完整分辨率', () => {
  const caps = videoModelCapabilities('seedance2.0');
  assert.deepEqual(caps.durations, Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual(caps.resolutions, ['480p', '720p', '1080p', '4K']);
  assert.ok(caps.ratios.includes('16:9') && caps.ratios.includes('9:16'));
});

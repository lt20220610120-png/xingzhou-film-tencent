const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVideoContent } = require('./media-service.cjs');

test('视频生成会把用户选择的上传图片作为首帧参考', () => {
  const content = buildVideoContent({ prompt: '人物向前走', ratio: '16:9', duration: 5, firstFrameUrl: 'https://example.com/ref.png' });
  assert.deepEqual(content[1], { type: 'image_url', image_url: { url: 'https://example.com/ref.png' }, role: 'first_frame' });
});

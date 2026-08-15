const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVideoContent } = require('./media-service.cjs');

test('视频生成请求保留分辨率和音频开关', () => {
  const content = buildVideoContent({ prompt: '镜头推进', ratio: '16:9', duration: 8, resolution: '4K', audioEnabled: true });
  assert.match(content[0].text, /--resolution 4K/);
  assert.match(content[0].text, /--audio on/);
  const silent = buildVideoContent({ prompt: '镜头推进', audioEnabled: false });
  assert.match(silent[0].text, /--audio off/);
});

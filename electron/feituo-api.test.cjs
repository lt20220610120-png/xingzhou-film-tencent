const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFeituoVideoPayload, parseFeituoStatus } = require('./media-service.cjs');

test('飞拓视频请求使用公开 API 协议和素材数组', () => {
  const payload = buildFeituoVideoPayload({ model: 'ft-video-v1-test', prompt: '镜头推进', ratio: '16:9', duration: 10, resolution: '720p', imageUrls: ['https://img.test/a.png'] });
  assert.equal(payload.model, 'ft-video-v1-test');
  assert.deepEqual(payload.imageUrls, ['https://img.test/a.png']);
  assert.equal(payload.duration, 10);
  assert.equal(payload.resolution, '720p');
});

test('飞拓 submitted 必须继续轮询，success 才返回视频地址', () => {
  assert.equal(parseFeituoStatus({ status: 'submitted', jobId: 'j1' }).state, 'pending');
  assert.equal(parseFeituoStatus({ status: 'success', videoUrl: 'https://feituokuajing.com/api/video/cache/j1' }).url, 'https://feituokuajing.com/api/video/cache/j1');
  assert.throws(() => parseFeituoStatus({ status: 'failed', errorMessage: '余额不足' }), /余额不足/);
  assert.equal(parseFeituoStatus({ status: 'COMPLETED', videoUrl: 'https://video.test/a.mp4' }).state, 'success');
  assert.throws(() => parseFeituoStatus({ status: 'SUCCESS' }), /没有返回视频地址/);
});

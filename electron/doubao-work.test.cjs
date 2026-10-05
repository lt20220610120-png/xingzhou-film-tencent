const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDoubaoWorkService, BACKGROUND_CODE } = require('./doubao-work.cjs');

function fixture(extra = {}) {
  const launches = [];
  const service = createDoubaoWorkService({ platform: 'win32', findExecutable: () => 'C:/installed/DoubaoWork.exe',
    spawn(executable, args, options) { launches.push({ executable, args, options }); const child = new EventEmitter(); child.unref = () => {}; return child; }, ...extra });
  return { service, launches };
}

test('installed client is not reported as a verified background account', async () => {
  const { service, launches } = fixture();
  for (let i = 0; i < 5; i++) {
    const status = await service.status();
    assert.equal(status.installed, true); assert.equal(status.loginVerified, false);
    assert.equal(status.ready, false); assert.equal(status.available, false); assert.equal(status.background, false);
    assert.equal(status.code, BACKGROUND_CODE); assert.deepEqual(status.models, []);
  }
  assert.deepEqual(launches, []);
});

test('generation and model refresh cannot start a UI worker, open a client or create any conversation', async () => {
  const { service, launches } = fixture();
  for (const model of ['auto', 'lite', 'turbo', 'pro']) {
    await assert.rejects(service.request({ model, messages: [{ role: 'user', content: '保留原有工作' }] }), error => error.code === BACKGROUND_CODE);
  }
  await assert.rejects(service.listModels(), error => error.code === BACKGROUND_CODE);
  assert.deepEqual(launches, []);
  await service.close(); assert.deepEqual(launches, []);
});

test('only the explicit manual-open action launches the ordinary client', async () => {
  const { service, launches } = fixture();
  const status = await service.openLogin();
  assert.equal(launches.length, 1); assert.match(launches[0].executable, /DoubaoWork\.exe$/);
  assert.deepEqual(launches[0].args, []); assert.equal(launches[0].options.shell, false);
  assert.equal(status.ready, false); assert.equal(status.available, false); assert.match(status.message, /手动|后台调用暂不可用/);
  await service.close(); assert.equal(launches.length, 1);
});

test('cancellation and shutdown do not affect the user desktop client', async () => {
  const { service, launches } = fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(service.request({}, { signal: controller.signal }), error => error.name === 'AbortError');
  await service.close();
  await assert.rejects(service.request({}), /连接已关闭/);
  await assert.rejects(service.openLogin(), /连接已关闭/);
  assert.deepEqual(launches, []);
});

test('missing installation and other operating systems cannot claim readiness', async () => {
  const missing = fixture({ findExecutable: () => null });
  assert.equal((await missing.service.status()).installed, false);
  await assert.rejects(missing.service.openLogin(), /未找到/);
  const unsupported = fixture({ platform: 'linux' });
  assert.equal((await unsupported.service.status()).installed, false);
  await assert.rejects(unsupported.service.request({}), /Windows/);
  assert.deepEqual([...missing.launches, ...unsupported.launches], []);
});

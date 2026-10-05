const test = require('node:test');
const assert = require('node:assert/strict');
const { createDoubaoWorkService, BACKGROUND_CODE } = require('./doubao-work.cjs');
const { requestText, testTextConnection } = require('./text-provider.cjs');

test('old saved Doubao profiles fail clearly without foreground operations or a paid API fallback', async () => {
  let spawned = 0, paid = 0;
  const service = createDoubaoWorkService({ platform: 'win32', findExecutable: () => 'C:/installed/DoubaoWork.exe', spawn: () => { spawned++; throw new Error('must not launch'); } });
  const options = { doubaoRun: (config, supplied) => service.request(config, supplied), apiRun: () => { paid++; throw new Error('must not charge'); }, apiTest: () => { paid++; throw new Error('must not charge'); } };
  const profile = { provider: 'doubaoWork', model: 'turbo', messages: [{ role: 'user', content: '同项目下一章' }] };
  await assert.rejects(requestText(profile, options), error => error.code === BACKGROUND_CODE && /前台自动操作已停用/.test(error.message));
  await assert.rejects(testTextConnection(profile, options), error => error.code === BACKGROUND_CODE);
  await Promise.all(Array.from({ length: 6 }, () => service.status()));
  await service.close();
  assert.equal(spawned, 0); assert.equal(paid, 0);
});

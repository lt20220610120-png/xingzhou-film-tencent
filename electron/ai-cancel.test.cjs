const test = require('node:test');
const assert = require('node:assert/strict');
const { requestChat } = require('./ai-service.cjs');

test('requestChat 支持外部 AbortSignal 取消长请求', async () => {
  const controller = new AbortController();
  let seenSignal;
  const fetchFn = async (_url, options) => {
    seenSignal = options.signal;
    await new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) };
  };
  const pending = requestChat({ endpoint: 'https://example.test/v1', apiKey: 'k', model: 'm', messages: [], signal: controller.signal }, { fetchFn });
  controller.abort();
  await assert.rejects(pending, /aborted/);
  assert.equal(seenSignal, controller.signal);
});

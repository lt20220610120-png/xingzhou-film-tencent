const test = require('node:test');
const assert = require('node:assert/strict');
const { createDoubaoWorkService, normalizeModels, buildPrompt, extractResult } = require('./doubao-work.cjs');
const options = { platform: 'win32', findExecutable: () => 'C:/installed/DoubaoWork.exe' };
const models = [{ name: '自动' }, { name: '豆包 2.1 Lite 0921 新版' }, { name: '豆包 2.1 Turbo' }, { name: '豆包 2.1 Pro' }];

test('account model discovery includes actual enabled choices and excludes unavailable models', () => {
  assert.deepEqual(normalizeModels([...models, { name: '未知模型' }, { name: '豆包 2.1 Pro', enabled: false }]).map(m => m.id), ['auto', 'lite', 'turbo', 'pro']);
});

test('desktop prompt preserves ordered roles and escaped source text without silently clipping', () => {
  const messages = [{ role: 'system', content: '规划要求' }, { role: 'assistant', content: '此前设定' }, { role: 'user', content: '第1章\n甲说："你好"。\n\n乙😀 #话题' }];
  const envelope = buildPrompt(messages, 'request1');
  assert.deepEqual(JSON.parse(envelope.prompt.split('消息：\n')[1]), messages);
  assert.match(envelope.prompt, /不要读取本机文件/);
  assert.throws(() => buildPrompt([{ role: 'user', content: '甲'.repeat(120000) }], 'large'), /文本过长/);
});

test('only exact matching complete response markers are adopted', () => {
  assert.equal(extractResult('响应说明\nXZ_BEGIN_own\n第1集\n场景1-1\n甲😀\nXZ_END_own\n', 'own'), '第1集\n场景1-1\n甲😀');
  for (const response of ['XZ_BEGIN_old\n其他任务正文\nXZ_END_old', 'XZ_BEGIN_own\n截断正文', '引用 XZ_BEGIN_own\n正文\n引用 XZ_END_own']) {
    assert.throws(() => extractResult(response, 'own'), error => error.code === 'OUTPUT_TRUNCATED');
  }
});

test('request uses high reasoning by default and validates its own task and response', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const service = createDoubaoWorkService({ ...options, runAdapter: async (payload, supplied) => {
    calls.push(payload.action); assert.equal(supplied.signal, signal);
    if (payload.action === 'models') return { models };
    assert.equal(payload.modelName, '豆包 2.1 Turbo'); assert.equal(payload.effort, '高');
    return { ok: true, requestId: payload.requestId, taskId: '123456', text: `${payload.start}\n{"scene":"1-1","text":"甲😀"}\n${payload.end}` };
  } });
  assert.deepEqual(JSON.parse(await service.request({ model: 'turbo', signal, messages: [{ role: 'user', content: '正文' }] })), { scene: '1-1', text: '甲😀' });
  assert.deepEqual(calls, ['models', 'request']); await service.close();
});

test('another task identity is rejected even if it supplies matching text markers', async () => {
  const service = createDoubaoWorkService({ ...options, runAdapter: async payload => payload.action === 'models' ? { models } : { requestId: 'other', taskId: '999', text: `${payload.start}\n不应采用\n${payload.end}` } });
  await assert.rejects(service.request({ model: 'pro', messages: [{ role: 'user', content: '正文' }] }), /任务不匹配/);
  await service.close();
});

test('missing model does not silently fall back to automatic or submit a task', async () => {
  const calls = [];
  const service = createDoubaoWorkService({ ...options, runAdapter: async payload => { calls.push(payload.action); return { models: models.slice(0, 1) }; } });
  await assert.rejects(service.request({ model: 'pro', messages: [{ role: 'user', content: '正文' }] }), /没有该模型/);
  assert.deepEqual(calls, ['models']); await service.close();
});

test('busy first-time discovery does not claim that login is already verified', async () => {
  let complete;
  const service = createDoubaoWorkService({ ...options, runAdapter: () => new Promise(resolve => { complete = resolve; }) });
  const pending = service.listModels();
  const status = await service.status(); assert.equal(status.busy, true); assert.equal(status.loggedIn, false); assert.equal(status.ready, false);
  complete({ models }); await pending;
  const busyRequest = service.request({ model: 'pro', messages: [{ role: 'user', content: '正文' }] });
  const rejected = assert.rejects(busyRequest, /连接已关闭/);
  await service.close(); complete({ models }); await rejected;
});

test('unsupported platforms and missing installations return clear account status', async () => {
  const unsupported = createDoubaoWorkService({ platform: 'linux' });
  assert.equal((await unsupported.status()).installed, false);
  await assert.rejects(unsupported.request({}), /Windows/);
  const missing = createDoubaoWorkService({ ...options, findExecutable: () => null });
  assert.equal((await missing.status()).ready, false);
  await assert.rejects(missing.request({ messages: [{ role: 'user', content: '正文' }] }), /未找到/);
});

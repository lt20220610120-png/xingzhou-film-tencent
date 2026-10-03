const test = require('node:test');
const assert = require('node:assert/strict');
const { requestText } = require('./text-provider.cjs');
const { requestChat } = require('./ai-service.cjs');
const { createTextRequestScheduler } = require('./text-request-rate.cjs');

const gateway = { provider: 'custom', endpoint: 'http://127.0.0.1:7864/v1', apiKey: 'test-key', model: 'cn:demo' };
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function clock() {
  let time = 0, id = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (fn, delay) => { const next = ++id; timers.set(next, { fn, at: time + delay }); return next; },
    clearTimer: id => timers.delete(id),
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        await tick();
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      time = end; await tick();
    },
  };
}
function scheduler(clock) {
  return createTextRequestScheduler(clock);
}
function gateRejection(extra = {}) {
  return Object.assign(new Error('请求过于频繁（60s 内超过 120 次）'), {
    httpStatus: 429, providerCode: 'rate_limit_exceeded', providerType: 'rate_limit_error', ...extra,
  });
}

test('212 simultaneous scene requests stay within the gateway window while model requests overlap', async () => {
  const time = clock(), rate = scheduler(time), starts = [], finish = [];
  const pending = Array.from({ length: 212 }, (_, i) => requestText({ ...gateway, model: `cn:model-${i % 2}` }, {
    requestScheduler: rate,
    apiRun: () => { starts.push(time.now()); return new Promise(resolve => finish.push(resolve)); },
  }));
  await tick();
  assert.equal(starts.length, 1, 'the whole batch must not hit the gateway at once');
  await time.advance(1200);
  assert.equal(starts.length, 3, 'admission must not wait for the preceding model response');
  await time.advance(130000);
  assert.equal(starts.length, 212);
  for (const start of starts) assert.ok(starts.filter(t => t <= start && start - t < 60000).length <= 100);
  finish.forEach(resolve => resolve('complete'));
  assert.ok((await Promise.all(pending)).every(value => value === 'complete'));
});

test('models and URL suffixes share one key window; separate keys and other endpoints do not block each other', async () => {
  const time = clock(), rate = scheduler(time), started = [];
  const run = (config, label) => requestText(config, { requestScheduler: rate, apiRun: async () => { started.push(label); return label; } });
  const pending = [
    run(gateway, 'first'),
    run({ ...gateway, endpoint: 'http://localhost:7864/v1/chat/completions', model: 'cn:other' }, 'same-key'),
    run({ ...gateway, apiKey: 'another-key' }, 'other-key'),
    run({ ...gateway, endpoint: 'http://127.0.0.1:11434/v1' }, 'ollama'),
    run({ ...gateway, endpoint: 'https://example.test/v1' }, 'remote'),
  ];
  await tick();
  assert.deepEqual(started.sort(), ['first', 'ollama', 'other-key', 'remote']);
  await time.advance(600);
  assert.ok((await Promise.all(pending)).includes('same-key'));
});

test('the known pre-forward 429 cools down shared admissions and retries once its full window expires', async () => {
  const time = clock(), rate = scheduler(time), calls = [];
  const pending = requestText(gateway, {
    requestScheduler: rate,
    apiRun: async () => { calls.push(time.now()); if (calls.length === 1) throw gateRejection(); return 'recovered'; },
  });
  await tick();
  const other = requestText(gateway, { requestScheduler: rate, apiRun: async () => { calls.push(time.now()); return 'other'; } });
  await time.advance(59999);
  assert.deepEqual(calls, [0]);
  await time.advance(601);
  assert.equal(await pending, 'recovered');
  assert.equal(await other, 'other');
  assert.deepEqual(calls, [0, 60000, 60600]);
});

test('a longer Retry-After is respected and repeated known rejections stop after two retries', async () => {
  const time = clock(), rate = scheduler(time), starts = [];
  const pending = requestText(gateway, { requestScheduler: rate, apiRun: async () => { starts.push(time.now()); throw gateRejection({ retryAfterMs: 90000 }); } });
  const rejected = assert.rejects(pending, error => error.code === 'RATE_LIMITED' && error.rateLimitRetriesExhausted === true);
  await time.advance(89999);
  assert.deepEqual(starts, [0]);
  await time.advance(90001);
  await rejected;
  assert.deepEqual(starts, [0, 90000, 180000]);
});

test('stopping a queued or cooling task sends no additional model request', async () => {
  const time = clock(), rate = scheduler(time), controller = new AbortController();
  let sends = 0;
  await requestText(gateway, { requestScheduler: rate, apiRun: async () => 'first' });
  const queued = requestText({ ...gateway, signal: controller.signal }, { requestScheduler: rate, apiRun: async () => { sends++; return 'unexpected'; } });
  const cancelled = assert.rejects(queued, error => error.name === 'AbortError');
  controller.abort(); await cancelled;
  await time.advance(60000);
  assert.equal(sends, 0);
  const coolingController = new AbortController();
  const cooling = requestText({ ...gateway, signal: coolingController.signal }, {
    requestScheduler: rate, apiRun: async () => { sends++; throw gateRejection(); },
  });
  const stopped = assert.rejects(cooling, error => error.name === 'AbortError');
  await tick(); coolingController.abort(); await stopped;
  await time.advance(60000);
  assert.equal(sends, 1);
});

test('timeouts, interrupted billed streams, generic 429 and quota errors are never automatically repeated', async () => {
  for (const error of [
    new Error('等待模型响应超时。服务商可能已计费'),
    Object.assign(new Error('接口传输中断'), { partialText: '已付费的正文' }),
    Object.assign(new Error('接口请求失败（HTTP 429）'), { httpStatus: 429 }),
    gateRejection({ partialText: '已经转发产生正文' }),
    gateRejection({ providerCode: 'insufficient_quota' }),
  ]) {
    let sends = 0;
    const rate = scheduler(clock());
    await assert.rejects(requestText(gateway, { requestScheduler: rate, apiRun: async () => { sends++; throw error; } }), e => e === error);
    assert.equal(sends, 1);
  }
});

test('the real HTTP error path waits outside the request timeout then returns recovered model text', async () => {
  const time = clock(), rate = scheduler(time), sent = [], progress = [];
  const pending = requestText({ ...gateway, timeout: 10 }, {
    requestScheduler: rate,
    onProgress: value => progress.push(value.phase),
    fetchFn: async () => {
      sent.push(time.now());
      if (sent.length === 1) return new Response(JSON.stringify({ error: {
        message: '请求过于频繁（60s 内超过 120 次）', type: 'rate_limit_error', code: 'rate_limit_exceeded',
      } }), { status: 429, headers: { 'retry-after': '1' } });
      return new Response(JSON.stringify({ choices: [{ message: { content: '恢复后的正文' }, finish_reason: 'stop' }] }));
    },
  });
  // Response stream parsing uses more microtask turns than the pure scheduler
  // tests. No wall-clock sleep or external requests are involved.
  for (let i = 0; i < 6; i++) await tick();
  await time.advance(60000);
  assert.equal(await pending, '恢复后的正文');
  assert.deepEqual(sent, [0, 60000]);
  assert.ok(progress.includes('rate-wait'));
});

test('an unrelated remote provider never inherits the local gateway retry policy', async () => {
  let sent = 0;
  await assert.rejects(requestText({ ...gateway, endpoint: 'https://example.test/v1' }, {
    requestScheduler: scheduler(clock()), apiRun: async () => { sent++; throw gateRejection(); },
  }), /请求过于频繁/);
  assert.equal(sent, 1);
});

test('known rejection keeps its HTTP status, provider classification and Retry-After duration', async () => {
  const fetchFn = async () => new Response(JSON.stringify({ error: {
    message: '请求过于频繁（60s 内超过 120 次）', type: 'rate_limit_error', code: 'rate_limit_exceeded',
  } }), { status: 429, headers: { 'retry-after': '90' } });
  await assert.rejects(requestChat(gateway, { fetchFn }), error => {
    assert.equal(error.httpStatus, 429);
    assert.equal(error.providerCode, 'rate_limit_exceeded');
    assert.equal(error.providerType, 'rate_limit_error');
    assert.equal(error.retryAfterMs, 90000);
    return true;
  });
});

test('Retry-After HTTP dates become durations; absent or invalid values remain unspecified', async () => {
  for (const [header, min, max] of [[new Date(Date.now() + 90000).toUTCString(), 88000, 90000], ['not-a-date'], [null]]) {
    const fetchFn = async () => new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
      status: 429, headers: header == null ? {} : { 'retry-after': header },
    });
    await assert.rejects(requestChat(gateway, { fetchFn }), error => {
      if (min === undefined) assert.equal(error.retryAfterMs, undefined);
      else assert.ok(error.retryAfterMs >= min && error.retryAfterMs <= max);
      return true;
    });
  }
});

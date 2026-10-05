const test = require('node:test');
const assert = require('node:assert/strict');
const { parseResponse, requestChat } = require('./ai-service.cjs');
const config = { endpoint: 'https://example.test/v1', apiKey: 'private-test-key', model: 'deepseek-demo', analysisMode: true, messages: [{ role: 'user', content: 'private-test-prompt' }] };
const frame = value => `data: ${JSON.stringify(value)}\n\n`;
const delta = (content, finish_reason = null) => ({ choices: [{ delta: { content }, finish_reason }] });

test('EOF without a generation marker preserves a partial audit and reports a distinct transport code', () => {
  const partial = '{"comparison":"收到的逐场核对内容尚未';
  let failure;
  assert.throws(() => parseResponse(frame(delta(partial))), error => {
    failure = error;
    return error.code === 'STREAM_INCOMPLETE' && error.providerType === 'stream_interrupted' && error.partialText === partial;
  });
  assert.deepEqual(failure.providerDiagnostic, {
    frameCount: 1, receivedBytes: Buffer.byteLength(frame(delta(partial))), outputCharacters: partial.length,
    hasDoneMarker: false, completionMarker: null, finishReason: null, streamEOF: true,
  });
});

test('explicit upstream interruptions are rejected for JSON and SSE, including the last paid delta', () => {
  for (const finish_reason of ['aborted', 'insufficient_system_resource']) {
    assert.throws(() => parseResponse(JSON.stringify({ choices: [{ message: { content: '已付费的部分正文' }, finish_reason }] })), error => error.code === 'STREAM_INCOMPLETE' && error.partialText === '已付费的部分正文');
    assert.throws(() => parseResponse(frame(delta('前文')) + frame(delta('最后一字', finish_reason)) + 'data: [DONE]\n\n'), error => {
      assert.equal(error.code, 'STREAM_INCOMPLETE');
      assert.equal(error.partialText, '前文最后一字');
      assert.equal(error.providerDiagnostic.finishReason, finish_reason);
      return true;
    });
  }
});

test('output-budget truncation remains distinguishable from a transport interruption', () => {
  assert.throws(() => parseResponse(frame(delta('正文', 'length'))), error => error.code === 'OUTPUT_TRUNCATED' && error.providerType === 'output_truncated' && error.partialText === '正文');
});

test('a reader failure records a missing EOF and does not repeat the paid request', async () => {
  let calls = 0, reads = 0, released = 0;
  const partial = '{"comparison":"不完整的审稿';
  const diagnostics = [];
  await assert.rejects(requestChat(config, {
    fetchFn: async () => {
      calls++;
      return { ok: true, body: { getReader: () => ({
        read: async () => {
          if (!reads++) return { done: false, value: new TextEncoder().encode(frame(delta(partial))) };
          throw new TypeError('terminated');
        },
        releaseLock: () => { released++; },
      }) } };
    },
    onDiagnostic: value => diagnostics.push(value),
  }), error => {
    assert.equal(error.code, 'STREAM_INCOMPLETE');
    assert.equal(error.providerType, 'stream_interrupted');
    assert.equal(error.partialText, partial);
    assert.equal(error.providerDiagnostic.streamEOF, false);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(released, 1);
  assert.equal(diagnostics.length, 1);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private-test|comparison|不完整/);
  assert.deepEqual(Object.keys(diagnostics[0]).sort(), ['completionMarker', 'finishReason', 'frameCount', 'hasDoneMarker', 'outputCharacters', 'receivedBytes', 'streamEOF'].sort());
});

test('a documented successful finish reason remains valid without a redundant DONE frame', async () => {
  const diagnostics = [];
  const output = await requestChat(config, { fetchFn: async () => new Response(frame(delta('完整正文', 'stop'))), onDiagnostic: value => diagnostics.push(value) });
  assert.equal(output, '完整正文');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].completionMarker, 'finish_reason');
  assert.equal(diagnostics[0].finishReason, 'stop');
  assert.equal(diagnostics[0].streamEOF, true);
});

test('caller cancellation is preserved instead of becoming an automatic continuation signal', async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(requestChat({ ...config, signal: controller.signal }, {
    fetchFn: async () => ({ ok: true, body: { getReader: () => ({
      read: async () => {
        if (!reads++) return { done: false, value: new TextEncoder().encode(frame(delta('已保存部分'))) };
        controller.abort(new DOMException('用户已停止', 'AbortError'));
        throw controller.signal.reason;
      }, releaseLock() {},
    }) } }),
  }), error => error.name === 'AbortError' && error.code !== 'STREAM_INCOMPLETE' && error.partialText === '已保存部分');
});

test('explicit content filtering cannot be replaced by a reader interruption or a continuation code', async () => {
  assert.throws(() => parseResponse(frame(delta('过滤前部分', 'content_filter'))), error => error.code === 'MODEL_CONTENT_FILTER' && error.partialText === '过滤前部分');
  let reads = 0, calls = 0;
  await assert.rejects(requestChat(config, { fetchFn: async () => {
    calls++;
    return { ok: true, body: { getReader: () => ({
      read: async () => {
        if (!reads++) return { done: false, value: new TextEncoder().encode(frame(delta('过滤前部分', 'content_filter'))) };
        throw new TypeError('terminated');
      }, releaseLock() {},
    }) } };
  } }), error => {
    assert.equal(error.code, 'MODEL_CONTENT_FILTER');
    assert.match(error.message, /内容审核/);
    assert.equal(error.partialText, '过滤前部分');
    assert.equal(error.providerDiagnostic.finishReason, 'content_filter');
    assert.equal(error.providerDiagnostic.streamEOF, false);
    return true;
  });
  assert.equal(calls, 1);
});

test('a length limit already received before the reader fails retains its output-budget classification', async () => {
  let reads = 0;
  await assert.rejects(requestChat(config, { fetchFn: async () => ({ ok: true, body: { getReader: () => ({
    read: async () => {
      if (!reads++) return { done: false, value: new TextEncoder().encode(frame(delta('预算耗尽前部分', 'length'))) };
      throw new TypeError('terminated');
    }, releaseLock() {},
  }) } }) }), error => error.code === 'OUTPUT_TRUNCATED' && error.partialText === '预算耗尽前部分' && error.providerDiagnostic.finishReason === 'length');
});

test('a clipped final SSE frame preserves prior paid text for continuation without accepting EOF as success', () => {
  const raw = frame(delta('已付费部分正文')) + 'data: {"choices": [{"delta": {"content": "断';
  assert.throws(() => parseResponse(raw), error => error.code === 'STREAM_INCOMPLETE' && error.partialText === '已付费部分正文' && error.providerDiagnostic.completionMarker === null);
});

test('malformed middle frames or data after a completion marker remain protocol errors, without a continuation code', () => {
  for (const raw of [frame(delta('已付费部分')) + 'data: broken json\n\n' + 'data: [DONE]\n\n', frame(delta('已付费部分', 'stop')) + 'data: broken json']) {
    assert.throws(() => parseResponse(raw), error => error.code !== 'STREAM_INCOMPLETE' && error.partialText === '已付费部分');
  }
});

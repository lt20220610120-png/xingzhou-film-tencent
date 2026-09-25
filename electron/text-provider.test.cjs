const test = require('node:test');
const assert = require('node:assert/strict');
const { requestText, testTextConnection } = require('./text-provider.cjs');

test('本机 Codex 配置进入本机通道，保留所选模型、推理档位和正文', async () => {
  let received;
  const result = await requestText({ provider: 'codexLocal', model: 'gpt-6-luna', reasoningEffort: 'high', messages: [{ role: 'user', content: '剧本' }] }, {
    codexRun: async value => { received = value; return '处理结果'; },
    apiRun: async () => { throw Error('不应调用按量 API'); },
  });
  assert.equal(result, '处理结果');
  assert.equal(received.model, 'gpt-6-luna');
  assert.equal(received.reasoningEffort, 'high');
});

test('已有 API 配置保持原来的请求路径', async () => {
  const result = await requestText({ provider: 'openai', model: 'gpt-4o' }, {
    codexRun: async () => { throw Error('不应调用 Codex'); },
    apiRun: async () => '原接口结果',
  });
  assert.equal(result, '原接口结果');
});

test('测试本机 Codex 连接检查实际返回正文', async () => {
  const result = await testTextConnection({ provider: 'codexLocal', model: 'gpt-6-sol', reasoningEffort: 'medium' }, {
    codexRun: async value => {
      assert.match(value.messages[0].content, /连接成功/);
      return '连接成功';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.message, '连接成功');
});

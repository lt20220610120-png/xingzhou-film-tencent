const test = require('node:test');
const assert = require('node:assert/strict');
const { requestText, testTextConnection } = require('./text-provider.cjs');

test('Doubao Work uses its local account bridge and defaults to high reasoning',async()=>{
 const signal=new AbortController().signal;
 const result=await requestText({provider:'doubaoWork',model:'turbo',messages:[{role:'user',content:'正文'}]}, {
  signal,doubaoRun:async(config,options)=>{assert.equal(config.model,'turbo');assert.equal(config.reasoningEffort,'high');assert.equal(options.signal,signal);return '豆包工作正文';},
  apiRun:async()=>{throw new Error('must not use a paid API');},
 });
 assert.equal(result,'豆包工作正文');
});

test('Doubao Work connection test returns real text and missing initialization fails clearly',async()=>{
 const result=await testTextConnection({provider:'doubaoWork',model:'auto'}, {doubaoRun:async config=>{assert.match(config.messages[0].content,/连接成功/);return '连接成功';},apiTest:async()=>{throw new Error('must not use API');}});
 assert.equal(result.protocol,'doubaoWork');assert.equal(result.message,'连接成功');
 await assert.rejects(requestText({provider:'doubaoWork'}),/尚未初始化/);
});

test('Gemini web account uses the browser session bridge instead of an API key',async()=>{
 const signal=new AbortController().signal;
 const result=await requestText({provider:'geminiWeb',model:'account-model',messages:[{role:'user',content:'正文'}]}, {
  signal,geminiRun:async(config,options)=>{assert.equal(config.model,'account-model');assert.equal(options.signal,signal);return '网页版正文';},
  apiRun:async()=>{throw new Error('must not use paid API');},
 });
 assert.equal(result,'网页版正文');
});
test('Gemini web connection test consumes and verifies actual text via its account bridge',async()=>{
 const result=await testTextConnection({provider:'geminiWeb',model:'auto'}, {geminiRun:async config=>{assert.match(config.messages[0].content,/连接成功/);return '连接成功';},apiTest:async()=>{throw new Error('must not use API');}});
 assert.equal(result.ok,true);assert.equal(result.protocol,'geminiWeb');assert.equal(result.message,'连接成功');
});

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

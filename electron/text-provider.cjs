const { requestChat, testAiConnection } = require('./ai-service.cjs');
const { runCodexText } = require('./codex-local.cjs');
const { createTextRequestScheduler } = require('./text-request-rate.cjs');
const requestScheduler = createTextRequestScheduler();

const isRetiredTextProfile=profile=>profile?.provider==='doubaoWork';
function assertTextProviderAvailable(config){
  if(isRetiredTextProfile(config))throw Object.assign(Error('原文本模型接口已下线，请选择可用接口后继续'),{code:'TEXT_PROVIDER_RETIRED'});
}

async function requestText(config, options = {}) {
  assertTextProviderAvailable(config);
  if(config?.provider==='chatgptWeb'){
    if(!options.chatgptRun)throw new Error('ChatGPT 网页账号连接尚未初始化，请在桌面应用的 API 接口中登录');
    return options.chatgptRun(config,{signal:options.signal||config.signal,onProgress:options.onProgress});
  }
  if (config?.provider === 'geminiWeb') {
    if (!options.geminiRun) throw new Error('Gemini 网页账号连接尚未初始化，请在桌面应用的 API 接口中登录');
    return options.geminiRun(config, { signal: options.signal || config.signal, onProgress: options.onProgress });
  }
  if (config?.provider === 'codexLocal') {
    return (options.codexRun || runCodexText)(config, {
      signal: options.signal || config.signal,
      onProgress: options.onProgress,
    });
  }
  const signal = options.signal || config.signal;
  return (options.requestScheduler || requestScheduler).run(config,
    () => (options.apiRun || requestChat)({ ...config, signal }, options),
    { signal, onProgress: options.onProgress });
}

async function testTextConnection(config, options = {}) {
  assertTextProviderAvailable(config);
  if (!['codexLocal','geminiWeb','chatgptWeb'].includes(config?.provider)) return (options.apiTest || testAiConnection)(config, options);
  const started = Date.now();
  const message = await requestText({ ...config, messages: [{ role: 'user', content: '只回复：连接成功' }] }, options);
  return { ok: true, message, protocol: config.provider, elapsedMs: Date.now() - started };
}

module.exports = { requestText, testTextConnection,assertTextProviderAvailable,isRetiredTextProfile };

const { requestChat, testAiConnection } = require('./ai-service.cjs');
const { runCodexText } = require('./codex-local.cjs');

async function requestText(config, options = {}) {
  if (config?.provider === 'codexLocal') {
    return (options.codexRun || runCodexText)(config, {
      signal: options.signal || config.signal,
      onProgress: options.onProgress,
    });
  }
  return (options.apiRun || requestChat)(config, options);
}

async function testTextConnection(config, options = {}) {
  if (config?.provider !== 'codexLocal') return (options.apiTest || testAiConnection)(config, options);
  const started = Date.now();
  const message = await requestText({ ...config, messages: [{ role: 'user', content: '只回复：连接成功' }] }, options);
  return { ok: true, message, protocol: 'codexLocal', elapsedMs: Date.now() - started };
}

module.exports = { requestText, testTextConnection };

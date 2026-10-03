const { createHash } = require('node:crypto');

// The bundled WorkBuddy gateway admits 120 requests per key in a 60s sliding
// window. Start at most 100/min, leaving room for panel and other-client calls.
// Admission does not wait for model completion: scenes remain concurrent.
function gatewayKey(config) {
  let url;
  try { url = new URL(config.endpoint); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.port !== '7864'
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null;
  return `${url.protocol}//loopback:7864/${createHash('sha256').update(String(config.apiKey || '').trim()).digest('hex')}`;
}

function gateWindow(error) {
  // This exact response comes from the gateway before upstream forwarding.
  // Generic 429, quotas, timeouts and partial paid output must not be retried.
  if (error?.httpStatus !== 429 || error.providerCode !== 'rate_limit_exceeded'
    || error.providerType !== 'rate_limit_error' || error.partialText) return 0;
  const match = /^请求过于频繁（(\d+)s 内超过 (\d+) 次）$/.exec(error.message || '');
  return match && Number(match[1]) > 0 && Number(match[2]) > 0 ? Number(match[1]) * 1000 : 0;
}

const abortError = () => Object.assign(new Error('任务已停止'), { name: 'AbortError' });
function createTextRequestScheduler({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const lanes = new Map();
  const intervalMs = 600, maxRetries = 2;
  function drain(lane) {
    if (lane.timer != null) { clearTimer(lane.timer); lane.timer = null; }
    if (!lane.queue.length) return;
    const delay = Math.max(lane.nextStartAt, lane.cooldownUntil) - now();
    if (delay > 0) {
      lane.timer = setTimer(() => { lane.timer = null; drain(lane); }, delay);
      return;
    }
    const entry = lane.queue.shift();
    entry.signal?.removeEventListener('abort', entry.abort);
    lane.nextStartAt = now() + intervalMs;
    entry.resolve();
    drain(lane);
  }
  function admit(lane, { signal, onProgress }) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const entry = { resolve, reject, signal };
      entry.abort = () => {
        const index = lane.queue.indexOf(entry);
        if (index < 0) return;
        lane.queue.splice(index, 1);
        signal.removeEventListener('abort', entry.abort);
        reject(abortError());
        drain(lane);
      };
      const waitMs = Math.max(0, Math.max(lane.nextStartAt, lane.cooldownUntil) - now()) + lane.queue.length * intervalMs;
      if (waitMs > 0) onProgress?.({ phase: 'rate-wait', waitMs, receivedBytes: 0 });
      signal?.addEventListener('abort', entry.abort, { once: true });
      lane.queue.push(entry);
      drain(lane);
    });
  }
  async function run(config, operation, { signal = config.signal, onProgress } = {}) {
    const key = gatewayKey(config);
    if (!key) return operation();
    if (!lanes.has(key)) lanes.set(key, { queue: [], timer: null, nextStartAt: 0, cooldownUntil: 0 });
    const lane = lanes.get(key);
    for (let retry = 0; ; retry++) {
      await admit(lane, { signal, onProgress });
      if (signal?.aborted) throw abortError();
      try { return await operation(); }
      catch (error) {
        if (signal?.aborted) throw abortError();
        const windowMs = gateWindow(error);
        if (!windowMs) throw error;
        error.code = 'RATE_LIMITED';
        const retryAfterMs = Number(error.retryAfterMs);
        lane.cooldownUntil = Math.max(lane.cooldownUntil, now() + Math.max(windowMs, Number.isFinite(retryAfterMs) ? retryAfterMs : 0));
        drain(lane);
        if (retry >= maxRetries) {
          error.rateLimitRetriesExhausted = true;
          throw error;
        }
      }
    }
  }
  return { run };
}

module.exports = { createTextRequestScheduler };

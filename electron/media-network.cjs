// Retry only reads, including interrupted response bodies. Generation POSTs must
// never pass through this helper: the provider may already have billed them.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isMediaNetworkError(error) {
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|ABORT_ERR/.test(String(error?.cause?.code || error?.code || ''))
    || /fetch failed|network|socket hang up|terminated|aborted/i.test(String(error?.message || ''))
    || ['TimeoutError', 'AbortError'].includes(error?.name);
}

let imageCache;
let cacheScope = () => '';
function configureMediaCache(cache, scope) { imageCache = cache; cacheScope = scope || (()=>''); }
async function readMediaBytes(url, options = {}) {
  // Explicitly cancellable requests keep their own lifecycle; ordinary preview,
  // export and reference reads coalesce through the same persistent cache.
  if (imageCache && !options.signal) return imageCache.read(url, cacheScope(), () => downloadMediaBytes(url, options));
  return downloadMediaBytes(url, options);
}
async function downloadMediaBytes(url, { fetchFn = globalThis.fetch, timeoutMs = 60000, attempts = 3, delayMs = 400, signal, label = '媒体下载' } = {}) {
  if (!/^https?:\/\//i.test(String(url))) throw new Error(`${label}地址无效`);
  const maxAttempts = Math.max(1, Math.min(3, attempts));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw signal.reason || new Error('下载已取消');
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('下载超时', 'TimeoutError')), timeoutMs);
    let retryDelay = delayMs * (attempt + 1);
    try {
      // Never forward API credentials to a result/reference image host.
      const response = await fetchFn(url, { method: 'GET', signal: controller.signal });
      if (!response.ok) {
        const retryAfter = Number(response.headers?.get('retry-after'));
        if (retryAfter > 0) retryDelay = Math.min(2000, retryAfter * 1000);
        await response.body?.cancel?.().catch(() => {});
        throw Object.assign(new Error(`${label}失败（HTTP ${response.status}）`), { status: response.status, retryable: RETRYABLE_STATUS.has(response.status) });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error(`${label}返回空文件`);
      return { bytes, mime: (response.headers?.get('content-type') || '').split(';')[0].toLowerCase() };
    } catch (error) {
      if (signal?.aborted) throw signal.reason || error;
      const retryable = error.retryable || isMediaNetworkError(error) || controller.signal.aborted;
      if (!retryable || attempt + 1 === maxAttempts) {
        if (!retryable || error.status) throw error;
        throw Object.assign(new Error(`${label}连接中断或超时，请检查网络后重试`), { cause: error });
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    if (retryDelay > 0) await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
}

module.exports = { readMediaBytes, isMediaNetworkError, configureMediaCache };

// Retry only reads, including interrupted response bodies. Generation POSTs must
// never pass through this helper: the provider may already have billed them.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
async function mediaErrorDetails(response){
  const reader=response.body?.getReader?.();let text='';
  try{
    if(!/json/i.test(response.headers?.get('content-type')||''))return {};
    if(reader){let size=0;const chunks=[];while(size<8192){const part=await reader.read();if(part.done)break;const bytes=Buffer.from(part.value);chunks.push(bytes.subarray(0,8192-size));size+=bytes.length;}text=Buffer.concat(chunks).toString('utf8');}
    else if(response.text)text=(await response.text()).slice(0,8192);
    const data=JSON.parse(text),message=data.error?.message||data.detail||data.message;
    const clean=typeof message==='string'?message.replace(/https?:\/\/[^\s"<>]+/gi,'[结果地址]').replace(/\bsk-[a-z0-9_-]{8,}/gi,'[密钥已隐藏]').replace(/[\x00-\x1f]/g,' ').slice(0,240):'';
    return {upstreamMessage:clean,upstreamCode:/^[\w.-]{1,80}$/.test(data.error?.code||'')?data.error.code:''};
  }catch{return {};}finally{try{if(reader)await reader.cancel();else await response.body?.cancel?.();}catch{}}
}

function isMediaNetworkError(error) {
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|ABORT_ERR/.test(String(error?.cause?.code || error?.code || ''))
    || /fetch failed|network|socket hang up|terminated|aborted/i.test(String(error?.message || ''))
    || ['TimeoutError', 'AbortError'].includes(error?.name);
}

let imageCache;
let mediaFetch;
// Electron's Chromium network stack follows the desktop's system proxy/PAC.
// Node fetch does not, which can make generation succeed but result GETs fail.
function configureMediaFetch(fetcher) { mediaFetch = fetcher; }
function fetchMedia(url,options) { return (mediaFetch||globalThis.fetch)(url,options); }
let cacheScope = () => '';
function configureMediaCache(cache, scope) { imageCache = cache; cacheScope = scope || (()=>''); }
async function readMediaBytes(url, options = {}) {
  // Explicitly cancellable requests keep their own lifecycle; ordinary preview,
  // export and reference reads coalesce through the same persistent cache.
  if (imageCache && !options.signal) return imageCache.read(url, cacheScope(), () => downloadMediaBytes(url, options));
  return downloadMediaBytes(url, options);
}
async function downloadMediaBytes(url, { fetchFn = mediaFetch || globalThis.fetch, timeoutMs = 60000, attempts = 3, delayMs = 400, signal, label = '媒体下载' } = {}) {
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
        const details=await mediaErrorDetails(response);
        throw Object.assign(new Error(`${label}失败（HTTP ${response.status}）${details.upstreamMessage?`：${details.upstreamMessage}`:''}`), { status: response.status, retryable: RETRYABLE_STATUS.has(response.status),...details });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw Object.assign(new Error(`${label}返回空文件`),{code:'MEDIA_CONTENT_EMPTY'});
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

module.exports = { readMediaBytes, isMediaNetworkError, configureMediaCache, configureMediaFetch, fetchMedia };

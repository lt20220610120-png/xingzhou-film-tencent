export function libTVError(reason,fallback='LibTV 请求失败，请稍后重试。'){
 const raw=String(reason?.message||reason||'').trim();
 const message=raw
  .replace(/Error invoking remote method ['"][^'"]+['"]:\s*/gi,'')
  .replace(/^(?:(?:Error|TypeError|AbortError):\s*)+/i,'')
  .replace(/(?:https?|socks[45]?):\/\/[^\s"'<>，。；）]+/gi,'[地址已隐藏]')
  .replace(/\b(?:127(?:\.\d{1,3}){3}|localhost|\[::1\]):\d{1,5}\b/gi,'[地址已隐藏]')
  .replace(/\b(?:set-cookie|cookie)\s*[:=]\s*[^\r\n，。]+/gi,'Cookie [已隐藏]')
  .replace(/\bBearer\s+[^\s"',;，。]+|\bsk-[a-z0-9_-]{8,}/gi,'[凭据已隐藏]')
  .replace(/\b(token|api[_-]?key|secret|authorization|password|username|nickname|account(?:Name|Id)|email)\s*[:=]\s*["']?[^\s"',;，。]+/gi,'$1=[已隐藏]')
  .replace(/[\x00-\x1f]/g,' ').trim().slice(0,300);
 return /[\u3400-\u9fff]/.test(message)?message:fallback;
}

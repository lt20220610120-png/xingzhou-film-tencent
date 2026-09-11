function normalizeEndpoint(endpoint = '') {
  return endpoint.trim().replace(/\/+$/, '').replace(/\/(chat\/completions|responses|messages)$/, '');
}
function chatCompletionsUrl(endpoint) { return `${normalizeEndpoint(endpoint)}/chat/completions`; }
function textContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (!value || typeof value !== 'object') return '';
  if (['reasoning', 'thinking', 'tool_use', 'function_call'].includes(value.type)) return '';
  return textContent(value.text ?? value.content ?? value.value);
}
function responseText(data) {
  const choice = data?.choices?.[0];
  return textContent(choice?.message?.content) || textContent(choice?.text)
    || textContent(data?.output_text) || textContent(data?.output) || textContent(data?.content);
}
function checkResponse(data) {
  if (data?.error || data?.status === 'failed') throw new Error(data.error?.message || '服务商生成失败');
  if (data?.status === 'incomplete' || ['length', 'max_tokens'].includes(data?.choices?.[0]?.finish_reason || data?.stop_reason)) {
    throw new Error('模型输出被截断，尚未完整生成。请提高服务商的输出额度或缩小本次输入范围。');
  }
  if (data?.choices?.[0]?.finish_reason === 'content_filter') throw new Error('服务商未返回正文：内容审核未通过。');
}
function parseResponse(raw) {
  if (!/^\s*(?:event:|data:|:)/m.test(raw)) {
    let data;
    try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); }
    catch { throw new Error('接口返回的不是 JSON 或事件流，请检查接口地址与协议。'); }
    checkResponse(data);
    const result = responseText(data);
    if (result.trim()) return result;
    if (textContent(data?.choices?.[0]?.message?.reasoning_content)) throw new Error('模型只返回了推理过程，没有生成最终正文。请检查服务商输出额度或更换模型。');
    throw new Error('接口已响应，但没有返回模型正文。请核对协议和模型，并使用“测试正文”检查。');
  }
  let output = '', snapshot = '', complete = false;
  for (const block of raw.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const payload = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!payload) continue;
    if (payload.trim() === '[DONE]') { complete = true; continue; }
    let event;
    try { event = JSON.parse(payload); } catch { throw new Error('接口事件流格式损坏，未保存为成功结果。'); }
    checkResponse(event);
    if (event.type === 'response.failed' || event.type === 'response.incomplete') { checkResponse(event.response); throw new Error('服务商没有完成本次生成。'); }
    if (event.type === 'response.completed') { checkResponse(event.response); snapshot = responseText(event.response); complete = true; }
    if (event.type === 'response.output_text.delta') output += textContent(event.delta);
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') output += textContent(event.delta.text);
    if (event.type === 'content_block_start') output += textContent(event.content_block);
    if (event.type === 'message_delta') checkResponse({ stop_reason: event.delta?.stop_reason });
    if (event.type === 'message_stop') complete = true;
    const choice = event.choices?.[0];
    output += textContent(choice?.delta?.content);
    if (choice?.message) snapshot = responseText(event);
    if (choice?.finish_reason) complete = true;
  }
  if (!complete) throw new Error('接口传输中断，未收到生成完成标记。服务商可能已计费，请先检查请求记录。');
  const result = snapshot || output;
  if (!result.trim()) throw new Error('接口已响应，但事件流没有返回正文。');
  return result;
}
function resolveProtocol({ endpoint = '', protocol = 'auto', provider = '' }) {
  if (['chat', 'responses', 'anthropic'].includes(protocol)) return protocol;
  if (/\/responses\/?$/.test(endpoint)) return 'responses';
  if (/\/messages\/?$/.test(endpoint) || /api\.anthropic\.com/.test(endpoint) || provider === 'claudeCodePool') return 'anthropic';
  return 'chat';
}
async function requestChat(config, { fetchFn = fetch, timeout = 600000 } = {}) {
  const { endpoint, apiKey = '', model, messages = [], requiresApiKey = true, signal } = config;
  if (!endpoint?.trim()) throw new Error('请填写接口地址');
  let parsedUrl;
  try { parsedUrl = new URL(endpoint); } catch { throw new Error('接口地址格式不正确'); }
  if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new Error('接口地址必须以 https:// 或 http:// 开头');
  if (!model?.trim()) throw new Error('请填写模型名称');
  if (requiresApiKey !== false && !apiKey?.trim()) throw new Error('请填写 API Key');
  const protocol = resolveProtocol(config);
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  let body = { model: model.trim(), messages, stream: false };
  let suffix = '/chat/completions';
  if (protocol === 'responses') {
    suffix = '/responses';
    body = { model: model.trim(), input: messages, stream: false, store: false };
  } else if (protocol === 'anthropic') {
    suffix = '/messages';
    delete headers.Authorization;
    headers['x-api-key'] = apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    body = { model: model.trim(), max_tokens: 8192, stream: false,
      system: messages.filter(m => ['system', 'developer'].includes(m.role)).map(m => textContent(m.content)).join('\n\n'),
      messages: messages.filter(m => !['system', 'developer'].includes(m.role)) };
  }
  const configuredTimeout = Number(config.timeout);
  const timeoutMs = configuredTimeout > 0 ? configuredTimeout : timeout;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('模型响应超时', 'TimeoutError')), timeoutMs);
  try {
    const response = await fetchFn(`${normalizeEndpoint(endpoint)}${suffix}`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      let data; try { data = JSON.parse(raw); } catch {}
      throw new Error(data?.error?.message || `接口请求失败（HTTP ${response.status}），请检查地址、协议和模型权限。`);
    }
    return parseResponse(raw);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('等待模型响应超时。服务商可能已计费，请先核对请求记录，避免重复生成。');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
async function testAiConnection(config, options) {
  const started = Date.now();
  const message = await requestChat({ ...config, messages: [{ role: 'user', content: '只回复：连接成功' }] }, options);
  return { ok: true, message, protocol: resolveProtocol(config), elapsedMs: Date.now() - started };
}
module.exports = { normalizeEndpoint, chatCompletionsUrl, textContent, responseText, parseResponse, resolveProtocol, requestChat, testAiConnection };

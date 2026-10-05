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
  const finishReason = data?.choices?.[0]?.finish_reason || data?.stop_reason;
  if (data?.status === 'incomplete' || ['length', 'max_tokens'].includes(finishReason)) {
    throw Object.assign(new Error('模型输出被截断，尚未完整生成。请提高服务商的输出额度或缩小本次输入范围。'), { code: 'OUTPUT_TRUNCATED', providerType: 'output_truncated' });
  }
  // DeepSeek documents these finish reasons as interrupted generation, even
  // when the transport later supplies [DONE]. Preserve the paid partial text.
  if (['aborted', 'insufficient_system_resource'].includes(finishReason)) {
    throw Object.assign(new Error('服务商中断了本次生成，尚未完整返回正文。已保留收到的部分内容。'), { code: 'STREAM_INCOMPLETE', providerType: 'stream_interrupted' });
  }
  if (finishReason === 'content_filter') throw Object.assign(new Error('服务商未返回正文：内容审核未通过。'), { code: 'MODEL_CONTENT_FILTER', providerType: 'content_filter' });
}
function parseResponse(raw, { streamEOF = true, onDiagnostic } = {}) {
  if (!/^\s*(?:event:|data:|:)/m.test(raw)) {
    let data;
    try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); }
    catch { throw new Error('接口返回的不是 JSON 或事件流，请检查接口地址与协议。'); }
    try { checkResponse(data); } catch(error) { error.partialText=responseText(data); throw error; }
    const result = responseText(data);
    if (result.trim()) return result;
    if (textContent(data?.choices?.[0]?.message?.reasoning_content)) throw new Error('模型只返回了推理过程，没有生成最终正文。请检查服务商输出额度或更换模型。');
    throw new Error('接口已响应，但没有返回模型正文。请核对协议和模型，并使用“测试正文”检查。');
  }
  let output = '', snapshot = '', complete = false, frameCount = 0, hasDoneMarker = false, completionMarker = null, finishReason = null;
  const diagnostic = () => ({
    frameCount, receivedBytes: Buffer.byteLength(raw, 'utf8'), outputCharacters: (snapshot || output).length,
    hasDoneMarker, completionMarker, finishReason, streamEOF: streamEOF === true,
  });
  const throwWithPartial = (error) => {
    if (!error.partialText) error.partialText = snapshot || output || '';
    error.providerDiagnostic = diagnostic();
    onDiagnostic?.(error.providerDiagnostic);
    throw error;
  };
  const payloads = raw.replace(/\r\n/g, '\n').split(/\n\s*\n/)
    .map(block => block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')).filter(Boolean);
  for (const [index, payload] of payloads.entries()) {
    frameCount++;
    if (payload.trim() === '[DONE]') { complete = true; hasDoneMarker = true; completionMarker = '[DONE]'; continue; }
    let event;
    try { event = JSON.parse(payload); } catch {
      const interruptedTail = !complete && index === payloads.length - 1;
      throwWithPartial(Object.assign(new Error('接口事件流格式损坏，未保存为成功结果。'), interruptedTail
        ? { code: 'STREAM_INCOMPLETE', providerType: 'stream_interrupted' }
        : { code: 'STREAM_MALFORMED', providerType: 'invalid_stream' }));
    }
    // Capture the delta before checking finish_reason. A length/content-filter
    // event can contain the last paid token that must remain resumable.
    const choice = event.choices?.[0];
    const reportedReason = choice?.finish_reason || event.stop_reason || event.delta?.stop_reason;
    if (reportedReason) finishReason = ['stop', 'length', 'max_tokens', 'content_filter', 'tool_calls', 'end_turn', 'stop_sequence', 'aborted', 'insufficient_system_resource'].includes(reportedReason) ? reportedReason : 'other';
    output += textContent(choice?.delta?.content);
    if (choice?.message) snapshot = responseText(event);
    if (event.type === 'response.output_text.delta') output += textContent(event.delta);
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') output += textContent(event.delta.text);
    if (event.type === 'content_block_start') output += textContent(event.content_block);
    try { checkResponse(event); } catch (error) { throwWithPartial(error); }
    if (event.type === 'response.failed' || event.type === 'response.incomplete') {
      try { checkResponse(event.response); } catch (error) { throwWithPartial(error); }
      throwWithPartial(new Error('服务商没有完成本次生成。'));
    }
    if (event.type === 'response.completed') {
      try { checkResponse(event.response); } catch (error) { throwWithPartial(error); }
      snapshot = responseText(event.response); complete = true; completionMarker = 'response.completed';
    }
    if (event.type === 'message_delta') {
      try { checkResponse({ stop_reason: event.delta?.stop_reason }); } catch (error) { throwWithPartial(error); }
    }
    if (event.type === 'message_stop') { complete = true; completionMarker = 'message_stop'; }
    if (choice?.finish_reason) { complete = true; completionMarker = 'finish_reason'; }
  }
  if (!complete) throwWithPartial(Object.assign(new Error('接口传输中断，未收到生成完成标记。服务商可能已计费，请先检查请求记录。'), { code: 'STREAM_INCOMPLETE', providerType: 'stream_interrupted' }));
  const result = snapshot || output;
  if (!result.trim()) throwWithPartial(new Error('接口已响应，但事件流没有返回正文。'));
  onDiagnostic?.(diagnostic());
  return result;
}
function resolveProtocol({ endpoint = '', protocol = 'auto', provider = '' }) {
  if (['chat', 'responses', 'anthropic'].includes(protocol)) return protocol;
  if (/\/responses\/?$/.test(endpoint)) return 'responses';
  if (/\/messages\/?$/.test(endpoint) || /api\.anthropic\.com/.test(endpoint) || provider === 'claudeCodePool') return 'anthropic';
  return 'chat';
}
async function requestChat(config, { fetchFn = fetch, timeout = 600000, onProgress, onDiagnostic } = {}) {
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
  const streaming = config.stream ?? Boolean(config.analysisMode);
  let body = { model: model.trim(), messages, stream: streaming };
  let suffix = '/chat/completions';
  if (protocol === 'responses') {
    suffix = '/responses';
    body = { model: model.trim(), input: messages, stream: streaming, store: false };
  } else if (protocol === 'anthropic') {
    suffix = '/messages';
    delete headers.Authorization;
    headers['x-api-key'] = apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    body = { model: model.trim(), max_tokens: 8192, stream: streaming,
      system: messages.filter(m => ['system', 'developer'].includes(m.role)).map(m => textContent(m.content)).join('\n\n'),
      messages: messages.filter(m => !['system', 'developer'].includes(m.role)) };
  }
  const budget=Number(config.maxOutputTokens);
  if(budget>0){
    const field=protocol==='responses'?'max_output_tokens':protocol==='chat'&&/^(?:gpt-5|o[134])/.test(model)?'max_completion_tokens':'max_tokens';
    body[field]=Math.min(32768,Math.max(1024,budget));
  }
  // DeepSeek's documented switch preserves output budget for final art content.
  if(config.analysisMode && protocol==='chat' && /deepseek/i.test(model))body.thinking={type:'disabled'};
  const configuredTimeout = Number(config.timeout);
  const timeoutMs = configuredTimeout > 0 ? configuredTimeout : timeout;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('模型响应超时', 'TimeoutError')), timeoutMs);
  let raw = '', streamEOF = false;
  try {
    onProgress?.({phase:'waiting',receivedBytes:0});
    const response = await fetchFn(`${normalizeEndpoint(endpoint)}${suffix}`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if(response.body?.getReader){
      const reader=response.body.getReader(),decoder=new TextDecoder();let receivedBytes=0;
      try{while(true){const {done,value}=await reader.read();if(done){streamEOF=true;break;}receivedBytes+=value.byteLength;raw+=decoder.decode(value,{stream:true});onProgress?.({phase:'receiving',receivedBytes});}raw+=decoder.decode();}
      finally{reader.releaseLock();}
    }else {raw=await response.text();streamEOF=true;}
    if (!response.ok) {
      let data; try { data = JSON.parse(raw); } catch {}
      const retryAfter = response.headers?.get?.('retry-after');
      let retryAfterMs;
      if (retryAfter != null && retryAfter.trim()) {
        const seconds = Number(retryAfter);
        const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(milliseconds)) retryAfterMs = Math.max(0, milliseconds);
      }
      throw Object.assign(new Error(data?.error?.message || `接口请求失败（HTTP ${response.status}），请检查地址、协议和模型权限。`), {
        httpStatus: response.status, providerCode: data?.error?.code, providerType: data?.error?.type, retryAfterMs,
      });
    }
    return parseResponse(raw, { streamEOF, onDiagnostic });
  } catch (error) {
    let providerTermination = false;
    if(raw && !error.providerDiagnostic){
      try { const partial = parseResponse(raw, { streamEOF, onDiagnostic: data => { error.providerDiagnostic = data; } }); error.partialText ||= partial; }
      catch(partial) {
        error.partialText ||= partial.partialText || ''; error.providerDiagnostic = partial.providerDiagnostic;
        // A failure after a terminal provider frame must not turn content
        // filtering (or a token limit) into a generic resumable network error.
        providerTermination = !signal?.aborted && (['MODEL_CONTENT_FILTER', 'OUTPUT_TRUNCATED', 'STREAM_MALFORMED'].includes(partial.code)
          || ['aborted', 'insufficient_system_resource'].includes(partial.providerDiagnostic?.finishReason));
        if (providerTermination) error = partial;
      }
      if (!providerTermination && !streamEOF && !controller.signal.aborted && !error.httpStatus) { error.code = 'STREAM_INCOMPLETE'; error.providerType = 'stream_interrupted'; }
      if (error.providerDiagnostic) onDiagnostic?.(error.providerDiagnostic);
    }
    if (!providerTermination && controller.signal.aborted && !signal?.aborted) throw Object.assign(new Error('等待模型响应超时。服务商可能已计费，请先核对请求记录，避免重复生成。'),{code:'REQUEST_TIMEOUT',partialText:error.partialText||'',providerDiagnostic:error.providerDiagnostic});
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
async function testAiConnection(config, options) {
  const started = Date.now();
  const message = await requestChat({ ...config, messages: [{ role: 'user', content: '只回复：连接成功' }] }, options);
  return { ok: true, message, protocol: resolveProtocol(config), elapsedMs: Date.now() - started };
}
module.exports = { normalizeEndpoint, chatCompletionsUrl, textContent, responseText, parseResponse, resolveProtocol, requestChat, testAiConnection };

// Gemini's web RPC format follows the account/model discovery and text protocol in
// https://github.com/HanaokaYuzu/Gemini-API (gemini-webapi 2.1.1).
// Protocol research attribution: see gemini-web-protocol-notice.md.
// All authenticated requests execute inside an app-owned real browser profile.
// Google cookies and CSRF tokens never leave that browser or enter app profiles.
const fs = require('node:fs');
const path = require('node:path');
const { spawn: nativeSpawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');

const GEMINI_URL = 'https://gemini.google.com/app';
const LOGIN_MESSAGE = '请点击“登录 Gemini 网页账号”，完成登录后关闭独立窗口，再点击“刷新登录与模型”';
const LOGIN_PENDING_MESSAGE = '请先在独立窗口完成 Gemini 登录，关闭该窗口后再点击“刷新登录与模型”';
const abortError = () => Object.assign(new Error('任务已停止'), { name: 'AbortError' });
function checkSignal(signal) { if (signal?.aborted) throw abortError(); }
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function findBrowser() {
  const candidates = process.platform === 'win32' ? [
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ] : ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return candidates.find(file => fs.existsSync(file)) || null;
}

function parseFrames(input) {
  let text = String(input || '').replace(/^\)\]\}'/, '').trimStart();
  const parts = [];
  while (text) {
    const marker = /^(\d+)\n/.exec(text);
    if (!marker) break;
    const length = Number(marker[1]);
    const start = marker[1].length;
    let parsed, consumed;
    // Google's declared UTF-16 length includes the leading newline. Accept
    // newline-exclusive frames too, for compatibility with older responses.
    for (const offset of [start, start + 1]) {
      try { parsed = JSON.parse(text.slice(offset, offset + length)); consumed = offset + length; break; } catch { /* Try the alternate frame boundary. */ }
    }
    if (parsed === undefined) throw Object.assign(new Error('Gemini 网页响应中断，未收到完整数据'), { frames: parts });
    if (Array.isArray(parsed)) parts.push(...parsed); else parts.push(parsed);
    text = text.slice(consumed).trimStart();
  }
  if (text.trim()) {
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) parts.push(...parsed); else parts.push(parsed); }
    catch { throw Object.assign(new Error('Gemini 网页响应格式已变化或数据不完整，请重新连接'), { frames: parts }); }
  }
  return parts;
}

function parseUserStatus(raw) {
  for (const part of parseFrames(raw)) {
    if (part?.[1] !== 'otAQ7b') continue;
    if (part?.[5]?.[0] === 7) return { loggedIn: false, models: [], message: LOGIN_MESSAGE };
    let body; try { body = JSON.parse(part[2]); } catch { continue; }
    const statusCode = body?.[14];
    const loggedIn = statusCode === 1000 || statusCode == null;
    if (!loggedIn) {
      const messages = { 1016: LOGIN_MESSAGE, 1040: '请在 Gemini 登录窗口接受最新服务条款后重新检查', 1042: '请在 Gemini 登录窗口接受最新服务条款后重新检查', 1060: '当前网络地区无法使用 Gemini 网页，请先确认浏览器中可以正常访问', 1014: 'Gemini 网页暂时不可用，请检查网络或稍后重试' };
      return { loggedIn: false, models: [], message: messages[statusCode] || `Gemini 网页账号暂时无法使用（状态 ${statusCode}），请在登录窗口检查` };
    }
    const tier = Array.isArray(body[16]) ? body[16] : [], capabilities = Array.isArray(body[17]) ? body[17] : [];
    const capacityField = tier.includes(21) || tier.includes(22) ? 13 : 12;
    const capacity = tier.includes(22) ? 2 : tier.includes(21) ? 1 : capabilities.includes(115) ? 4 : tier.includes(16) || capabilities.includes(106) ? 3 : tier.includes(8) || capabilities.includes(19) ? 2 : 1;
    const models = (Array.isArray(body[15]) ? body[15] : []).filter(data => typeof data?.[0] === 'string' && data[0]).map(data => {
      const category = String(data[1] || data[10] || '').trim();
      const name = String(data[11] || data[19] || category || data[0]).trim();
      const modelName = `gemini-${(category || name).toLowerCase().replace(/\s+/g, '-')}`;
      return { id: data[0], name, modelName, aliases: [data[0], category, name, modelName].filter(Boolean).map(value => value.toLowerCase()), capacity, capacityField, modelNumber: Number.isInteger(data[17]) ? data[17] : Number.isInteger(data[9]) ? data[9] : 1 };
    });
    if (!models.length) throw new Error('Gemini 网页没有返回账号可用模型，请重新连接');
    return { loggedIn: true, models, message: '已连接 Gemini 网页账号，使用该账号的网页额度' };
  }
  throw new Error('Gemini 网页没有返回账号状态，网页协议可能已变化，请重新连接');
}

function parseGeneratedText(raw, { onDiagnostic, streamEOF = true } = {}) {
  let output = '', completed = false, frames, interrupted = false, indicator = null, candidateId = '', finalContext = false, failure = null;
  try { frames = parseFrames(raw); } catch (error) { frames = error.frames || []; interrupted = true; }
  for (const part of frames) {
    const errorCode = part?.[5]?.[2]?.[0]?.[1]?.[0];
    if (errorCode) {
      if(errorCode>=1090&&errorCode<=1099){failure=Object.assign(new Error(`Gemini 网页会话验证失败（状态 ${errorCode}）`),{code:output?'OUTPUT_TRUNCATED':'GEMINI_SESSION_REJECTED',statusCode:errorCode,...output?{partialText:output}:{}});break;}
      const messages = { 1037: 'Gemini 网页账号当前模型额度已用完，请等待恢复或选择其他模型', 1050: 'Gemini 网页模型与会话不匹配，请重新发送', 1052: 'Gemini 网页所选模型不可用或协议已变化，请重新检查模型', 1060: 'Gemini 网页暂时限制了当前网络，请稍后重试', 1013: 'Gemini 网页暂时处理失败，请稍后重试' };
      failure=Object.assign(new Error(messages[errorCode] || `Gemini 网页处理失败（状态 ${errorCode}）`),{statusCode:errorCode});break;
    }
    if (typeof part?.[2] !== 'string') continue;
    let body; try { body = JSON.parse(part[2]); } catch { continue; }
    const candidate = body?.[4]?.[0];
    const text = candidate?.[1]?.[0];
    if (typeof text === 'string') {
      const nextCandidateId = typeof candidate?.[0] === 'string' ? candidate[0] : '';
      const nextOutput = /^https?:\/\/googleusercontent\.com\/card_content\//.test(text) && typeof candidate?.[22]?.[0] === 'string' ? candidate[22][0] : text;
      // The final context belongs to the candidate that produced it. A later
      // candidate or changed text cannot inherit an earlier acknowledgement.
      if (nextCandidateId !== candidateId || nextOutput !== output) finalContext = false;
      output = nextOutput;
      candidateId = nextCandidateId;
      indicator = Number.isInteger(candidate?.[8]?.[0]) ? candidate[8][0] : null;
      // Every candidate frame replaces its prior state. A finished earlier
      // frame or context token must not certify a later unfinished candidate.
      completed = indicator === 2;
    }
    if (typeof body?.[25] === 'string') finalContext = true;
  }
  const text = output.replace(/https?:\/\/googleusercontent\.com\/(?:\w+\/)+\d+\n*/g, '').trim();
  // Older web responses omit the candidate indicator, but include a final
  // context frame. Keep that compatibility only when no unfinished indicator
  // explicitly contradicts completion.
  completed ||= indicator === null && finalContext && !!text;
  const diagnostic = {
    frameCount: frames.length, receivedBytes: Buffer.byteLength(String(raw || ''), 'utf8'),
    candidateIdHash: candidateId ? createHash('sha256').update(candidateId).digest('hex').slice(0,16) : null,
    candidateCharacters: output.length, outputCharacters: text.length,
    completionIndicator: indicator, hasFinalContext: finalContext,
    streamEOF: streamEOF === true, interruptedFrame: interrupted,
    completed: completed && !interrupted && !failure, ...(failure?.statusCode ? {statusCode:failure.statusCode} : {}),
  };
  try { onDiagnostic?.(diagnostic); } catch { /* Diagnostics never alter task outcomes. */ }
  if (failure) throw Object.assign(failure,{providerDiagnostic:diagnostic});
  if (!completed || interrupted) {
    if (text || interrupted) throw Object.assign(new Error('Gemini 网页响应中断，未收到完整正文，请缩短输入或重新发送'), { code: 'OUTPUT_TRUNCATED', partialText: text, providerDiagnostic: diagnostic });
  }
  if (!text) throw new Error('Gemini 网页没有返回正文，请检查登录状态和当前模型额度');
  return text;
}

function buildGenerateRequest(prompt, model, sessionId = randomUUID(), extendedThinking = false) {
  const payload = Array(81).fill(null);
  Object.assign(payload, { 0: [prompt, 0, null, null, null, null, 0], 1: ['en'], 2: ['', '', '', null, null, null, null, null, null, ''], 6: [1], 7: 1, 10: 1, 11: 0, 17: [[0]], 18: 0, 27: 1, 30: [4], 41: [1], 45: 1, 53: 0, 59: randomUUID().toUpperCase(), 61: [], 68: 1, 79: model?.modelNumber || 1, 80: extendedThinking ? 2 : 1 });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8', 'X-Same-Domain': '1', 'x-goog-ext-525005358-jspb': JSON.stringify([payload[59], 1]) };
  if (model) {
    const header = [1, null, null, null, model.id, null, null, 0, [4, 5, 6, 8], null, null];
    if (model.capacityField === 13) header.push(null);
    header.push(model.capacity, null, null, model.modelNumber || 1, extendedThinking ? 2 : 1, sessionId);
    headers['x-goog-ext-525001261-jspb'] = JSON.stringify(header);
    headers['x-goog-ext-73010989-jspb'] = '[0]'; headers['x-goog-ext-73010990-jspb'] = '[0,0,0]';
  }
  return { body: JSON.stringify([null, JSON.stringify(payload)]), headers };
}

function createCdpConnection(socketUrl, WebSocketClass = global.WebSocket) {
  if (typeof WebSocketClass !== 'function') throw new Error('当前软件运行环境无法连接 Gemini 浏览器，请更新行舟影视');
  const socket = new WebSocketClass(socketUrl), pending = new Map(); let nextId = 0;
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Gemini 浏览器连接超时')); }, 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('无法连接 Gemini 独立浏览器')); }, { once: true });
  });
  socket.addEventListener('message', event => {
    let data; try { data = JSON.parse(String(event.data)); } catch { return; }
    const request = pending.get(data.id); if (!request) return;
    request.finish(data.error ? new Error('Gemini 浏览器执行失败，请重新连接') : null, data.result);
  });
  socket.addEventListener('close', () => { for (const item of [...pending.values()]) item.finish(new Error('Gemini 独立浏览器已关闭，请重新连接')); });
  return { opened, socket, command(method, params = {}, sessionId, { signal, timeout = 30000 } = {}) {
    checkSignal(signal);
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const finish = (error, result) => { if (!pending.has(id)) return; pending.delete(id); clearTimeout(timer); signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve(result); };
      const abort = () => finish(abortError());
      const timer = setTimeout(() => finish(new Error('Gemini 网页处理超时，请检查网络或缩短输入')), timeout);
      pending.set(id, { finish }); signal?.addEventListener('abort', abort, { once: true });
      try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); } catch { finish(new Error('Gemini 浏览器连接已断开，请重新连接')); }
    });
  }, disconnect() { socket.close(); } };
}

// This function is serialized into the browser. It keeps all login tokens there.
async function browserRequest(kind, request, timeout) {
  if (location.origin !== 'https://gemini.google.com') return { ok: false, code: 'AUTH_REQUIRED' };
  const runtime = globalThis.__xingzhouGeminiRuntime ||= { reqid: Math.floor(Math.random() * 90000) + 10000, uuid: crypto.randomUUID().toUpperCase(), bytes: 0 };
  const wiz = globalThis.WIZ_global_data || {};
  const html = document.documentElement.outerHTML;
  const read = key => {
    if (typeof wiz[key] === 'string') return wiz[key];
    const match = html.match(new RegExp('"' + key + '":\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"'));
    if (!match) return ''; try { return JSON.parse('"' + match[1] + '"'); } catch { return ''; }
  };
  const token = read('SNlM0e');
  if (!token) return { ok: false, code: 'AUTH_REQUIRED' };
  const params = new URLSearchParams({ hl: read('TuX5cc') || 'en', _reqid: String(runtime.reqid), rt: 'c' });
  runtime.reqid += 100000;
  if (read('cfb2h')) params.set('bl', read('cfb2h'));
  if (read('FdrFJe')) params.set('f.sid', read('FdrFJe'));
  let route, body, headers;
  if (kind === 'status') {
    route = '/_/BardChatUi/data/batchexecute'; params.set('rpcids', 'otAQ7b,ESY5D'); params.set('source-path', '/app');
    // The web client reads the activity preference as a session heartbeat before
    // generation. This RPC reads existing settings and does not change them.
    body = JSON.stringify([[['otAQ7b', '[]', null, 'generic'], ['ESY5D', '[[["bard_activity_enabled"]]]', null, 'generic']]]);
    headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8', 'X-Same-Domain': '1', 'x-goog-ext-525001261-jspb': JSON.stringify([1,null,null,null,null,null,null,null,[4,5,6,8],null,null,null,null,null,null,null,runtime.uuid]), 'x-goog-ext-73010989-jspb': '[0]' };
  } else {
    route = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'; body = request.body; headers = request.headers;
    const payload = JSON.parse(body), inner = JSON.parse(payload[1]); inner[1] = [read('TuX5cc') || 'en'];
    payload[1] = JSON.stringify(inner); body = JSON.stringify(payload);
    if (headers['x-goog-ext-525001261-jspb']) {
      const modelHeader = JSON.parse(headers['x-goog-ext-525001261-jspb']); modelHeader[modelHeader.length - 1] = runtime.uuid;
      headers['x-goog-ext-525001261-jspb'] = JSON.stringify(modelHeader);
    }
  }
  const controller = new AbortController(); runtime.controller = controller; runtime.bytes = 0;
  const timer = setTimeout(() => controller.abort(), timeout);
  let raw = '';
  try {
    const response = await fetch(route + '?' + params, { method: 'POST', credentials: 'include', headers, body: new URLSearchParams({ at: token, 'f.req': body }), signal: controller.signal });
    if (!response.ok) return { ok: false, code: response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'HTTP', status: response.status };
    const reader = response.body.getReader(), decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      runtime.bytes += value.byteLength;
      if (runtime.bytes > 16000000) { controller.abort(); return { ok: false, code: 'TOO_LARGE', raw }; }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode(); return { ok: true, raw, streamEOF: true };
  } catch (error) { return { ok: false, code: error.name === 'AbortError' ? 'ABORTED' : 'NETWORK', raw, streamEOF: false }; }
  finally { clearTimeout(timer); if (runtime.controller === controller) runtime.controller = null; }
}

function createGeminiWebService({ profileDir, findBrowser: locateBrowser = findBrowser, spawn = nativeSpawn, WebSocket: WebSocketClass = global.WebSocket, onDiagnostic } = {}) {
  if (!profileDir) throw new Error('Gemini 独立浏览器资料目录未配置');
  const resolvedProfile = path.resolve(profileDir);
  if (/[/\\](?:Microsoft[/\\]Edge|Google[/\\]Chrome)[/\\]User Data(?:[/\\]|$)/i.test(resolvedProfile)) throw new Error('Gemini 必须使用行舟影视独立浏览器资料目录');
  let child = null, connection = null, pageSession = null, visible = false, closed = false, lastState = { installed: !!locateBrowser(), loggedIn: false, running: false, models: [], message: LOGIN_MESSAGE }, queue = Promise.resolve();
  let diagnosticSequence = 0;
  const recordDiagnostic = value => {
    const diagnostic = { createdAt: new Date().toISOString(), sequence: ++diagnosticSequence, ...value };
    try {
      const file = path.join(resolvedProfile, 'gemini-generation-diagnostics.jsonl');
      // Retain only bounded protocol metadata. No prompt, generated text,
      // conversation identifiers, cookies or authentication tokens are logged.
      if (fs.existsSync(file) && fs.statSync(file).size > 262144) {
        try { fs.unlinkSync(file + '.1'); } catch { /* First rotation has no prior file. */ }
        fs.renameSync(file, file + '.1');
      }
      fs.appendFileSync(file, JSON.stringify(diagnostic) + '\n', 'utf8');
    } catch { /* Local diagnostics must not prevent a paid response. */ }
    try { onDiagnostic?.(diagnostic); } catch { /* Optional QA observers are isolated. */ }
  };
  const serialized = (operation, signal) => {
    const result = queue.then(() => { checkSignal(signal); if (closed) throw new Error('Gemini 服务已停止'); return operation(); });
    queue = result.catch(() => {});
    if (!signal) return result;
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      signal.addEventListener('abort', abort, { once: true });
      result.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
      if (signal.aborted) abort();
    });
  };
  async function stopOwnedBrowser() {
    const ownConnection = connection; connection = null; pageSession = null;
    if (ownConnection) { try { await ownConnection.command('Browser.close', {}, null, { timeout: 5000 }); } catch { /* Browser close terminates its websocket. */ } ownConnection.disconnect(); }
    const ownChild = child; child = null;
    if (ownChild && ownChild.exitCode == null) {
      await Promise.race([new Promise(resolve => ownChild.once('exit', resolve)), pause(1000)]);
      if (ownChild.exitCode == null) ownChild.kill();
    }
    lastState = { ...lastState, running: false };
  }
  async function ensureBrowser(show, signal) {
    checkSignal(signal);
    if (closed) throw new Error('Gemini 服务已停止');
    if (visible && child && child.exitCode == null) throw Object.assign(new Error(LOGIN_PENDING_MESSAGE), { code: 'LOGIN_IN_PROGRESS' });
    if (connection && connection.socket.readyState === 1 && (!show || visible)) return;
    if (connection || child) await stopOwnedBrowser();
    checkSignal(signal);
    if (closed) throw new Error('Gemini 服务已停止');
    const executable = locateBrowser(); if (!executable) throw new Error('本机未找到 Microsoft Edge 或 Google Chrome，请安装浏览器后连接 Gemini 网页账号');
    fs.mkdirSync(resolvedProfile, { recursive: true });
    const portFile = path.join(resolvedProfile, 'DevToolsActivePort');
    try { fs.unlinkSync(portFile); } catch { /* First launch has no file. */ }
    const args = [`--user-data-dir=${resolvedProfile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling'];
    if (!show) args.push('--headless=new');
    args.push(GEMINI_URL); visible = !!show;
    child = spawn(executable, args, { windowsHide: !show, shell: false, stdio: 'ignore' });
    let launchError = false; child.once('error', () => { launchError = true; });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      checkSignal(signal);
      if (closed) throw new Error('Gemini 服务已停止');
      if (launchError || child.exitCode != null) throw new Error('Gemini 独立浏览器启动失败，请关闭该独立窗口后重试');
      let lines; try { lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); } catch { await pause(200); continue; }
      if (!/^\d+$/.test(lines[0]) || !/^\/devtools\/browser\/[a-z0-9-]+$/i.test(lines[1] || '')) { await pause(200); continue; }
      connection = createCdpConnection(`ws://127.0.0.1:${Number(lines[0])}${lines[1]}`, WebSocketClass);
      await connection.opened;
      checkSignal(signal);
      if (closed || !connection) throw new Error('Gemini 服务已停止');
      const targets = await connection.command('Target.getTargets');
      checkSignal(signal);
      if (closed || !connection) throw new Error('Gemini 服务已停止');
      let page = targets.targetInfos.find(target => target.type === 'page' && /^https:\/\/gemini\.google\.com(?:\/|$)/.test(target.url || ''))
        || targets.targetInfos.find(target => target.type === 'page' && /^https:\/\/accounts\.google\.com(?:\/|$)/.test(target.url || ''))
        || targets.targetInfos.find(target => target.type === 'page');
      if (!page) { const created = await connection.command('Target.createTarget', { url: GEMINI_URL }); page = { targetId: created.targetId }; }
      const attached = await connection.command('Target.attachToTarget', { targetId: page.targetId, flatten: true }); pageSession = attached.sessionId;
      if (page.url && !/^https:\/\/(?:gemini|accounts)\.google\.com(?:\/|$)/.test(page.url)) await connection.command('Page.navigate', { url: GEMINI_URL }, pageSession);
      lastState = { ...lastState, installed: true, running: true }; return;
    }
    throw new Error('Gemini 独立浏览器启动超时，请检查 Edge 或 Chrome 是否可用');
  }
  async function evaluate(expression, options = {}) {
    let cancelledFetch = Promise.resolve();
    const cancel = () => {
      cancelledFetch = connection?.command('Runtime.evaluate', { expression: 'globalThis.__xingzhouGeminiRuntime?.controller?.abort(); true', returnByValue: true }, pageSession, { timeout: 5000 }).catch(() => {}) || Promise.resolve();
    };
    if (options.cancelFetch) options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await connection.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, pageSession, options);
      if (result.exceptionDetails) throw new Error('Gemini 网页执行失败，请在登录窗口确认页面可以正常使用');
      return result.result?.value;
    } finally {
      if (options.cancelFetch) options.signal?.removeEventListener('abort', cancel);
      // The public request rejects immediately, while its internal queue slot
      // stays occupied until the browser has acknowledged fetch cancellation.
      await cancelledFetch;
    }
  }
  async function inspect(signal) {
    await ensureBrowser(false, signal);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      checkSignal(signal);
      const page = await evaluate('({ready:document.readyState,origin:location.origin,token:!!globalThis.WIZ_global_data?.SNlM0e})', { signal });
      if (page.origin === 'https://gemini.google.com' && (page.token || page.ready === 'complete')) break;
      if (page.origin === 'https://accounts.google.com' && page.ready === 'complete') return { loggedIn: false, models: [], message: LOGIN_MESSAGE };
      await pause(250);
    }
    const result = await evaluate(`(${browserRequest.toString()})('status',null,30000)`, { signal, timeout: 35000, cancelFetch: true });
    if (!result?.ok) {
      if (result?.code === 'AUTH_REQUIRED') return { loggedIn: false, models: [], message: LOGIN_MESSAGE };
      throw new Error(result?.code === 'ABORTED' ? 'Gemini 网页连接超时，请检查网络' : 'Gemini 网页连接失败，请确认浏览器可以访问 gemini.google.com');
    }
    return parseUserStatus(result.raw);
  }
  const publicState = state => ({ ...state, models: state.models.map(({ id, name, modelName }) => ({ id, name, modelName })) });
  return {
    status: () => serialized(async () => {
      if (!locateBrowser()) return { installed: false, loggedIn: false, running: false, models: [], message: '本机未找到 Microsoft Edge 或 Google Chrome' };
      try { lastState = { installed: true, running: true, ...await inspect() }; }
      catch (error) { lastState = { installed: true, running: !!connection || !!child, loggedIn: false, models: [], message: error.message }; }
      return publicState(lastState);
    }),
    openLogin: () => serialized(async () => {
      if (visible && child && child.exitCode == null) return publicState({ ...lastState, loggedIn: false, models: [], message: LOGIN_PENDING_MESSAGE });
      await stopOwnedBrowser();
      if (closed) throw new Error('Gemini 服务已停止');
      const executable = locateBrowser(); if (!executable) throw new Error('本机未找到 Microsoft Edge 或 Google Chrome，请安装浏览器后连接 Gemini 网页账号');
      fs.mkdirSync(resolvedProfile, { recursive: true });
      // Google may reject debugging-enabled sign-in. Login happens in an ordinary
      // installed browser with no CDP connection or remote-debugging switches.
      const ownChild = spawn(executable, [`--user-data-dir=${resolvedProfile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-mode', GEMINI_URL], { windowsHide: false, shell: false, stdio: 'ignore' });
      child = ownChild; visible = true;
      ownChild.once('exit', () => { if (child === ownChild) { child = null; visible = false; lastState = { ...lastState, running: false }; } });
      ownChild.once('error', () => { if (child === ownChild) { child = null; visible = false; lastState = { ...lastState, running: false, message: 'Gemini 独立登录窗口启动失败' }; } });
      lastState = { installed: true, running: true, loggedIn: false, models: [], message: LOGIN_PENDING_MESSAGE };
      return publicState(lastState);
    }),
    listModels: () => serialized(async () => { lastState = { installed: true, running: true, ...await inspect() }; if (!lastState.loggedIn) throw new Error(lastState.message); return publicState(lastState).models; }),
    request: (config, options = {}) => serialized(async () => {
      const signal = options.signal || config.signal; checkSignal(signal);
      if (!Array.isArray(config.messages) || !config.messages.length) throw new Error('请填写要处理的文本');
      lastState = { installed: true, running: true, ...await inspect(signal) }; if (!lastState.loggedIn) throw new Error(lastState.message);
      const modelName = String(config.model || 'auto').trim().toLowerCase();
      const model = ['auto', 'default', ''].includes(modelName) ? null : lastState.models.find(item => item.aliases.includes(modelName));
      if (!model && !['auto', 'default', ''].includes(modelName)) throw new Error('当前 Gemini 网页账号没有该模型，请检查连接后选择账号提供的模型');
      const messages = config.messages.map(message => ({ role: ['system', 'developer', 'assistant', 'user'].includes(message?.role) ? message.role : 'user', content: typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '') }));
      const prompt = '你正在为行舟影视执行纯文本任务。请遵循下列消息指令，只返回要求的正文，保留必要上下文；assistant 消息是之前的回答。\n\n' + JSON.stringify(messages);
      const timeout = Number(config.timeout) > 0 ? Math.min(Number(config.timeout), 1800000) : 600000;
      const payload = buildGenerateRequest(prompt, model, randomUUID(), config.extendedThinking === true);
      options.onProgress?.({ phase: 'waiting', receivedBytes: 0 });
      const progress = options.onProgress ? setInterval(() => {
        evaluate('globalThis.__xingzhouGeminiRuntime?.bytes||0', { timeout: 5000 }).then(bytes => options.onProgress({ phase: bytes ? 'receiving' : 'waiting', receivedBytes: Number(bytes) || 0 })).catch(() => {});
      }, 1000) : null;
      try {
        checkSignal(signal);
        const send=async request=>{
        const result = await evaluate(`(${browserRequest.toString()})('generate',${JSON.stringify(request)},${timeout})`, { signal, timeout: timeout + 5000, cancelFetch: true });
        checkSignal(signal);
        if (!result?.ok) {
          if (result?.raw) {
            try { return parseGeneratedText(result.raw,{onDiagnostic:recordDiagnostic,streamEOF:result.streamEOF===true}); } catch (error) { if (error.code === 'OUTPUT_TRUNCATED' && error.partialText) throw error; }
          }
          const messages = { AUTH_REQUIRED: LOGIN_MESSAGE, ABORTED: 'Gemini 网页处理超时，请检查网络或缩短输入', TOO_LARGE: 'Gemini 网页返回内容过长，请拆分任务后重新发送', NETWORK: 'Gemini 网页网络连接中断，请检查网络后重新发送' };
          throw new Error(messages[result?.code] || `Gemini 网页请求失败${result?.status ? `（HTTP ${result.status}）` : ''}`);
        }
        return parseGeneratedText(result.raw,{onDiagnostic:recordDiagnostic,streamEOF:result.streamEOF!==false});
        };
        try{return await send(payload);}catch(error){
          // Only an explicit session rejection with no delivered text is replayed.
          // Never replay partial output, timeouts, quota errors, or network errors.
          if(error.code!=='GEMINI_SESSION_REJECTED')throw error;
          checkSignal(signal);options.onProgress?.({phase:'reconnecting',receivedBytes:0});
          const previousOrigin=await evaluate('performance.timeOrigin',{signal});
          await connection.command('Page.reload',{ignoreCache:true},pageSession,{signal});
          const refreshDeadline=Date.now()+30000;let refreshed=false;
          while(Date.now()<refreshDeadline){
            const page=await evaluate('({timeOrigin:performance.timeOrigin,ready:document.readyState})',{signal});
            if(page.timeOrigin!==previousOrigin&&page.ready==='complete'){refreshed=true;break;}
            await pause(200);checkSignal(signal);
          }
          if(!refreshed)throw new Error('Gemini 后台页面刷新超时，请检查网络后重新连接');
          lastState={installed:true,running:true,...await inspect(signal)};
          if(!lastState.loggedIn)throw new Error(lastState.message);
          const refreshedModel=model&&lastState.models.find(item=>item.id===model.id);
          if(model&&!refreshedModel)throw new Error('Gemini 账号模型已经变化，请刷新模型后重新选择');
          try{return await send(buildGenerateRequest(prompt,refreshedModel||null,randomUUID(),config.extendedThinking===true));}
          catch(second){if(second.code==='GEMINI_SESSION_REJECTED')throw Object.assign(new Error(`Gemini 网页会话仍被 Google 拒绝（状态 ${second.statusCode}）。后台刷新未恢复，请打开独立登录窗口重新验证账号，完成后关闭窗口再测试正文。`),{code:second.code,statusCode:second.statusCode});throw second;}
        }
      } finally { if (progress) clearInterval(progress); }
    }, options.signal || config.signal),
    close: () => { closed = true; return stopOwnedBrowser(); },
  };
}

module.exports = { createGeminiWebService, findBrowser, createCdpConnection, parseFrames, parseUserStatus, parseGeneratedText, buildGenerateRequest };

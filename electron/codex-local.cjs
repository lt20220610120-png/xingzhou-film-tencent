const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

function findCodexCommand() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const base = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    try {
      const matches = fs.readdirSync(base, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(base, entry.name, 'codex.exe'))
        .filter(file => fs.existsSync(file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (matches.length) return { executable: matches[0], prefixArgs: [] };
    } catch { /* The standalone CLI can still be on PATH. */ }
  }
  return { executable: process.platform === 'win32' ? 'codex.exe' : 'codex', prefixArgs: [] };
}

function buildCodexArgs(config, outputFile, workDir) {
  const model = String(config.model || '').trim();
  const effort = String(config.reasoningEffort || 'medium').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(model)) throw new Error('请选择有效的 Codex 模型');
  if (!EFFORTS.has(effort)) throw new Error('请选择有效的 Codex 推理档位');
  return ['exec', '-', '--model', model, '-c', `model_reasoning_effort="${effort}"`, '--sandbox', 'read-only',
    '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--json', '-C', workDir, '-o', outputFile];
}

function formatCodexMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('请填写要处理的文本');
  const conversation = messages.map(message => ({
    role: ['system', 'developer', 'assistant', 'user'].includes(message?.role) ? message.role : 'user',
    content: typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? ''),
  }));
  return `你正在为行舟影视执行一项纯文本处理任务。不要调用工具，不要读取或修改文件。只返回任务要求的正文，不要添加解释、前言或代码块。请遵循下列消息中的指令并保留必要的上下文；assistant 消息是之前的回答。\n\n${JSON.stringify(conversation)}`;
}

function cleanEnvironment(source) {
  const env = { ...source };
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_BASE_URL']) delete env[key];
  return env;
}

function runProcess(command, args, { input = '', signal, timeout = 600000, env, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('任务已停止'), { name: 'AbortError' }));
    let stdout = '', stderr = '', finished = false, forcedError = null;
    const child = spawn(command.executable, [...(command.prefixArgs || []), ...args], {
      cwd: process.cwd(), env: cleanEnvironment(env || process.env), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result);
    };
    const abort = () => {
      forcedError = Object.assign(new Error('任务已停止'), { name: 'AbortError' });
      child.kill();
    };
    const timer = setTimeout(() => {
      forcedError = new Error('本机 Codex 处理超时，请检查登录状态或缩短本次输入');
      child.kill();
    }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
      onProgress?.({ phase: 'receiving', receivedBytes: Buffer.byteLength(stdout) });
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });
    child.once('error', error => finish(new Error(error.code === 'ENOENT' ? '本机未找到 Codex，请先安装或打开 Codex 桌面应用' : `无法启动本机 Codex：${error.message}`)));
    child.once('close', code => finish(forcedError, { code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function runCodexText(config, options = {}) {
  const command = options.command || findCodexCommand();
  const signal = options.signal || config.signal;
  const timeout = Number(config.timeout) > 0 ? Number(config.timeout) : 600000;
  const prompt = formatCodexMessages(config.messages);
  const login = await runProcess(command, ['login', 'status'], { signal, timeout: 15000, env: options.env });
  if (login.code !== 0 || !/Logged in using ChatGPT/i.test(`${login.stdout}\n${login.stderr}`)) {
    throw new Error('请先在本机执行 codex login，并确认使用 ChatGPT 账号登录；已拒绝 API Key 计费方式');
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingzhou-codex-'));
  const outputFile = path.join(workDir, 'answer.txt');
  try {
    const args = buildCodexArgs(config, outputFile, workDir);
    options.onProgress?.({ phase: 'waiting', receivedBytes: 0 });
    const result = await runProcess(command, args, { input: prompt, signal, timeout, env: options.env, onProgress: options.onProgress });
    if (result.code !== 0) throw new Error(`本机 Codex 处理失败（退出码 ${result.code}）。请检查模型是否可用、额度是否充足及 Codex 登录状态`);
    const output = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8').trim() : '';
    if (!output) throw new Error('本机 Codex 没有返回正文');
    return output;
  } finally { fs.rmSync(workDir, { recursive: true, force: true }); }
}

module.exports = { findCodexCommand, buildCodexArgs, formatCodexMessages, runCodexText };

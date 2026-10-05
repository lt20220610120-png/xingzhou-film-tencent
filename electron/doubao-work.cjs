// A signed-in desktop client is not proof of a usable background provider.
// The previous accessibility driver required foreground focus and clipboard
// input, so it must never run on status, model discovery, tests or generation.
const fs = require('node:fs');
const path = require('node:path');
const { spawn: nativeSpawn } = require('node:child_process');

const BACKGROUND_CODE = 'DOUBAO_BACKGROUND_UNAVAILABLE';
const BACKGROUND_MESSAGE = '豆包工作后台连接暂不可用：前台自动操作已停用，请选择已接通的 Gemini、Codex 或文本 API 后继续。已有豆包任务保留在客户端。';

function findDoubaoWork() {
  const executable = path.join(process.env.LOCALAPPDATA || '', 'DoubaoWork', 'Application', 'app', 'DoubaoWork.exe');
  return fs.existsSync(executable) ? executable : null;
}

function createDoubaoWorkService({ findExecutable = findDoubaoWork, spawn = nativeSpawn, platform = process.platform } = {}) {
  let closed = false;
  const checkOpen = () => {
    if (closed) throw new Error('豆包工作连接已关闭');
    if (platform !== 'win32') throw new Error('豆包工作本机账号连接目前支持 Windows');
  };
  const unavailable = () => Object.assign(new Error(BACKGROUND_MESSAGE), { code: BACKGROUND_CODE });
  return {
    async status() {
      const installed = platform === 'win32' && Boolean(findExecutable());
      return { installed, loggedIn: false, loginVerified: false, ready: false, available: false, background: false, models: [], code: BACKGROUND_CODE,
        message: closed ? '豆包工作连接已关闭' : BACKGROUND_MESSAGE };
    },
    async listModels() { checkOpen(); throw unavailable(); },
    async request(config = {}, options = {}) {
      checkOpen();
      if ((options.signal || config.signal)?.aborted) throw Object.assign(new Error('任务已停止'), { name: 'AbortError' });
      throw unavailable();
    },
    // Only the explicitly labelled user button may open the ordinary client.
    // Never launch it as a side effect of a model request or status refresh.
    async openLogin() {
      checkOpen();
      const executable = findExecutable();
      if (!executable) throw new Error('本机未找到豆包工作，请先安装客户端');
      const child = spawn(executable, [], { windowsHide: false, shell: false, stdio: 'ignore' });
      child.once('error', () => {}); child.unref?.();
      return { ...(await this.status()), message: '已打开豆包工作供你手动使用；后台调用暂不可用，登录后也不会自动提交任务。' };
    },
    async close() { closed = true; },
  };
}

module.exports = { createDoubaoWorkService, findDoubaoWork, BACKGROUND_MESSAGE, BACKGROUND_CODE };

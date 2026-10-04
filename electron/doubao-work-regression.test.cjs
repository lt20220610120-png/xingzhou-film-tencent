const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { createDoubaoWorkService } = require('./doubao-work.cjs');

const models = [{ name: '自动', enabled: true }, { name: '豆包 2.1 Pro', enabled: true }];
const nativeOptions = { platform: 'win32', findExecutable: () => 'C:/installed/DoubaoWork.exe' };
function worker(onLine) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.killed = false;
  child.stdin = new Writable({ write(chunk, encoding, done) { onLine(JSON.parse(chunk.toString()), child); done(); } });
  child.kill = () => { child.killed = true; setImmediate(() => child.emit('close', null)); };
  child.reply = (result, newline = true) => {
    child.stdout.write(JSON.stringify(result) + (newline ? '\n' : ''));
    child.stdout.end(); child.stderr.end();
    setImmediate(() => { child.emit('exit', 0); child.emit('close', 0); });
  };
  return child;
}

test('native response is read after process exit and a final JSON without newline is preserved', async () => {
  const service = createDoubaoWorkService({ ...nativeOptions, spawn(executable, args, options) {
    assert.match(executable, /powershell\.exe$/i); assert.equal(options.windowsHide, true); assert.equal(options.shell, false);
    return worker((payload, child) => {
      assert.equal(payload.action, 'status');
      setImmediate(() => {
        child.emit('exit', 0);
        setImmediate(() => child.reply({ ok: true, state: { loggedIn: true, ready: true, running: true } }, false));
      });
    });
  } });
  const status = await service.status();
  assert.equal(status.loggedIn, true); assert.equal(status.ready, true);
  await service.close();
});

test('cancel while discovering models never submits a new desktop task', async () => {
  const controller = new AbortController(), calls = [];
  const service = createDoubaoWorkService({ ...nativeOptions, runAdapter: async payload => {
    calls.push(payload.action); controller.abort(); return { ok: true, models };
  } });
  await assert.rejects(service.request({ model: 'pro', messages: [{ role: 'user', content: '未发送正文' }] }, { signal: controller.signal }), error => error.name === 'AbortError');
  assert.deepEqual(calls, ['models']);
  await service.close();
});

test('model refresh and generation cannot drive the same desktop menus concurrently', async () => {
  let complete;
  const calls = [];
  const service = createDoubaoWorkService({ ...nativeOptions, runAdapter: payload => {
    calls.push(payload.action); return new Promise(resolve => { complete = resolve; });
  } });
  const refresh = service.listModels();
  await assert.rejects(service.request({ model: 'pro', messages: [{ role: 'user', content: '正文' }] }), /只能|当前任务|当前操作|操作客户端/);
  await assert.rejects(service.listModels(), /当前任务|操作客户端/);
  assert.deepEqual(calls, ['models']);
  complete({ ok: true, models }); await refresh; await service.close();
});

test('shutdown during model discovery prevents subsequent task submission', async () => {
  let complete;
  const calls = [];
  const service = createDoubaoWorkService({ ...nativeOptions, runAdapter: payload => {
    calls.push(payload.action); return new Promise(resolve => { complete = resolve; });
  } });
  const result = service.request({ model: 'pro', messages: [{ role: 'user', content: '未发送正文' }] });
  const rejected = assert.rejects(result, /连接已关闭/);
  await service.close(); complete({ ok: true, models }); await rejected;
  assert.deepEqual(calls, ['models']);
});

test('shutdown waits for its native worker cancellation and never kills the user client', async () => {
  const children = [], executables = [];
  let taskStarted;
  const started = new Promise(resolve => { taskStarted = resolve; });
  const service = createDoubaoWorkService({ ...nativeOptions, spawn(executable) {
    executables.push(executable);
    const child = worker((payload, child) => {
      if (payload.action === 'models') setImmediate(() => child.reply({ ok: true, models }));
      else if (payload.action === 'request') taskStarted();
      else if (payload.cancel) setImmediate(() => child.reply({ ok: false, code: 'ABORTED', message: '任务已停止' }));
    });
    children.push(child); return child;
  } });
  const request = service.request({ model: 'pro', messages: [{ role: 'user', content: '待接收正文' }] });
  const rejected = assert.rejects(request, error => error.name === 'AbortError');
  await started; await service.close(); await rejected;
  assert.ok(executables.every(executable => /powershell\.exe$/i.test(executable)));
  assert.ok(children.every(child => !child.killed));
});

test('a late stdin pipe error during cancellation cannot crash the desktop or lose the stopped classification', async () => {
  const controller = new AbortController();
  const service = createDoubaoWorkService({ ...nativeOptions, spawn() {
    return worker((payload, child) => {
      if (payload.action === 'models') setImmediate(() => child.reply({ ok: true, models }));
      else if (payload.action === 'request') setImmediate(() => controller.abort());
      else if (payload.cancel) setImmediate(() => {
        child.stdin.emit('error', Object.assign(new Error('pipe closed'), { code: 'EPIPE' }));
        child.reply({ ok: false, code: 'ABORTED', message: '任务已停止' });
      });
    });
  } });
  await assert.rejects(service.request({ model: 'pro', messages: [{ role: 'user', content: '正文' }] }, { signal: controller.signal }), error => error.name === 'AbortError');
  await service.close();
});

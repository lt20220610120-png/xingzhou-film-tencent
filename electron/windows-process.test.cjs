const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const { windowlessPython } = require('./windows-process.cjs');
const { inspectPersistentPaths } = require('./workbuddy-update.cjs');

test('Windows Python helpers use the GUI interpreter across an entire venv lineage', () => {
  const consolePython = 'C:\\manager with spaces\\.venv\\Scripts\\python.exe';
  const guiPython = 'C:\\manager with spaces\\.venv\\Scripts\\pythonw.exe';
  assert.equal(windowlessPython(consolePython, { platform: 'win32', fileExists: file => file === guiPython }), guiPython);
  assert.equal(windowlessPython(guiPython, { platform: 'win32' }), guiPython);
  assert.throws(() => windowlessPython(consolePython, { platform: 'win32', fileExists: () => false }), /无窗口 Python/);
  assert.equal(windowlessPython('/venv/bin/python', { platform: 'linux', fileExists: () => { throw new Error('must not inspect Windows files'); } }), '/venv/bin/python');
});

test('explicit PATH Python inspection selects a windowless interpreter without executing a discovery command', () => {
  const expected = 'C:\\Python314\\pythonw.exe';
  assert.equal(windowlessPython('python', { platform: 'win32', searchPath: 'C:\\unrelated;"C:\\Python314"', fileExists: file => file === expected }), expected);
  assert.throws(() => windowlessPython('cmd.exe', { platform: 'win32' }), /无窗口 Python/);
});

test('real Windows update data inspection has no console while retaining redirected JSON output', { skip: process.platform !== 'win32', timeout: 15000 }, async t => {
  let python;
  try { python = windowlessPython('python'); }
  catch { t.skip('A windowless Python installation is required'); return; }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-windowless-update-'));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.ok(path.basename(resolved).startsWith('xz-windowless-update-') && path.dirname(resolved) === fs.realpathSync(os.tmpdir()));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const venv = path.join(root, '.venv');
  fs.mkdirSync(path.join(root,'upstream'));fs.writeFileSync(path.join(root,'upstream','config.json'),'{}');
  await run(python, ['-m', 'venv', '--without-pip', venv], { windowsHide: true, shell: false, timeout: 10000 });
  const consoleRecord = path.join(root, 'console.json');
  fs.writeFileSync(path.join(venv, 'Lib', 'site-packages', 'sitecustomize.py'),
    `import ctypes,json,os\nk=ctypes.windll.kernel32\nk.GetConsoleWindow.restype=ctypes.c_void_p\nwith open(${JSON.stringify(consoleRecord)},'w') as f: json.dump({'console':k.GetConsoleWindow() or 0,'pid':os.getpid()},f)\n`);
  // Exercise the production updater helper with entirely empty fixture data.
  // No account files, real deployment, running manager, or network is used.
  const paths = await inspectPersistentPaths(root);
  assert.ok(paths.length >= 3 && paths.every(item => path.isAbsolute(item.path)));
  assert.equal(JSON.parse(fs.readFileSync(consoleRecord, 'utf8')).console, 0);
});

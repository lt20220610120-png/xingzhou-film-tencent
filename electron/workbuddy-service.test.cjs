const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createWorkBuddyService } = require('./workbuddy-service.cjs');

function fixture(t, env = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-workbuddy-'));
  const root = path.join(dir, 'manager');
  const userDataDir = path.join(dir, 'profile');
  for (const name of ['server', 'web/out', 'data', '.venv/Scripts', 'upstream/auths', 'upstream/data']) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
  }
  for (const name of ['server/main.py', 'web/out/index.html', '.venv/Scripts/python.exe', '.venv/Scripts/pythonw.exe', 'upstream/wb2api.exe']) {
    fs.writeFileSync(path.join(root, name), 'fixture');
  }
  fs.writeFileSync(path.join(root, '.env'), env);
  fs.writeFileSync(path.join(root, '.version'), '1.0.75\n');
  fs.writeFileSync(path.join(root, 'upstream/config.json'), JSON.stringify({ listen: '127.0.0.1:7863', auth_dir: './auths' }));
  fs.writeFileSync(path.join(root, 'data/users.json'), JSON.stringify({
    secret: 'test-only-secret', users: [{ username: 'observer', role: 'viewer' }, { username: 'fixture-admin', role: 'admin', sv: 3 }],
  }));
  fs.writeFileSync(path.join(root, 'upstream/auths/workbuddy-fixture.json'), '{}');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { root, userDataDir };
}

const healthy = async () => ({ ok: true, json: async () => ({ ok: true, service: 'workbuddy-manager' }) });
const unavailable = async () => { throw new Error('connect ECONNREFUSED'); };
const processExec = async (_file, args) => {
  const command = args.at(-1);
  if (command.includes('CreateShortcut')) return { stdout: '[]' };
  if (command.includes('Stop-Process')) return { stdout: '{"stopped":true}' };
  return { stdout: '{"found":true,"matches":true,"pid":42}' };
};
const fakeSpawn = () => {
  const child = new EventEmitter();
  child.pid = 123;
  child.unref = () => {};
  return child;
};

test('folder selection rejects relative or incomplete roots without saving them', async t => {
  const { userDataDir } = fixture(t);
  const service = createWorkBuddyService({ userDataDir, exec: processExec, fetch: unavailable });
  await assert.rejects(service.selectRoot('relative/manager'), /绝对路径/);
  await assert.rejects(service.selectRoot(path.join(userDataDir, 'missing')), /面板目录/);
  assert.equal(await service.getRoot(), null);
});

test('status trusts the explicit health marker and never returns stored credentials', async t => {
  const { root, userDataDir } = fixture(t, 'WB_MANAGER_PORT=18764\nWB_ADMIN_PASSWORD=do-not-return\n');
  let requested;
  const service = createWorkBuddyService({ userDataDir, exec: processExec, fetch: async url => { requested = url; return healthy(); } });
  const status = await service.selectRoot(root);
  assert.equal(requested, 'http://127.0.0.1:18764/api/healthz');
  assert.equal(status.running, true);
  assert.equal(status.version, '1.0.75');
  assert.equal(status.accounts, 1);
  assert.equal(await service.getRoot(), root);
  assert.doesNotMatch(JSON.stringify(status), /test-only-secret|do-not-return|fixture-admin|observer/);
});

test('discovery uses the existing shortcut working directory and persists the selection', async t => {
  const { root, userDataDir } = fixture(t);
  const service = createWorkBuddyService({ userDataDir, fetch: healthy, exec: async () => ({
    stdout: JSON.stringify([{ workingDirectory: root, targetPath: 'powershell.exe', arguments: '-File "Open-WorkBuddy-Manager.ps1"' }]),
  }) });
  assert.equal(await service.discover(), root);
  const second = createWorkBuddyService({ userDataDir, fetch: healthy, exec: async () => { throw new Error('shortcut unavailable'); } });
  assert.equal(await second.getRoot(), root);
});

test('short lived cookie uses the real administrator and current revocation version', t => {
  const { root, userDataDir } = fixture(t);
  const service = createWorkBuddyService({ userDataDir, now: () => 1700000000000 });
  const cookie = service.sessionCookie(root);
  const raw = Buffer.from(cookie.value, 'base64url').toString('utf8');
  const split = raw.lastIndexOf('|');
  const payload = raw.slice(0, split);
  assert.deepEqual(JSON.parse(payload), { username: 'fixture-admin', role: 'admin', sv: 3, iat: 1700000000, orig: 1700000000, exp: 1700000300 });
  assert.equal(raw.slice(split + 1), crypto.createHmac('sha256', 'test-only-secret').update(payload, 'utf8').digest('hex'));
  assert.equal(cookie.name, 'wb_session');
  assert.equal(cookie.url, 'http://127.0.0.1:7864');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.expirationDate, 1700000300);
});

test('missing or malformed users never bootstrap or reveal the file contents', t => {
  const { root, userDataDir } = fixture(t);
  const service = createWorkBuddyService({ userDataDir });
  const users = path.join(root, 'data/users.json');
  fs.writeFileSync(users, '{"secret":"do-not-reveal"');
  assert.throws(() => service.sessionCookie(root), error => /管理员会话/.test(error.message) && !error.message.includes('do-not-reveal'));
  fs.unlinkSync(users);
  assert.throws(() => service.sessionCookie(root), /管理员会话/);
  assert.equal(fs.existsSync(users), false);
});

test('a different service occupying the port cannot be started over or stopped', async t => {
  const { root, userDataDir } = fixture(t);
  let mutations = 0;
  const service = createWorkBuddyService({ userDataDir,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, service: 'another-service' }) }),
    exec: async () => { mutations += 1; return {}; }, spawn: () => { mutations += 1; return fakeSpawn(); },
  });
  const status = await service.status(root);
  assert.equal(status.running, false);
  await assert.rejects(service.start(root), /占用/);
  await assert.rejects(service.stop(root), /身份|占用/);
  assert.equal(mutations, 0);
});

test('a healthy marker with the wrong deployment process is never stopped', async t => {
  const { root, userDataDir } = fixture(t);
  const commands = [];
  const service = createWorkBuddyService({ userDataDir, fetch: healthy, exec: async (_file, args) => {
    commands.push(args.at(-1));
    return { stdout: '{"found":true,"matches":false,"pid":42}' };
  } });
  await assert.rejects(service.stop(root), /身份/);
  assert.equal(commands.some(command => command.includes('Stop-Process')), false);
});

test('starting an already healthy installed manager does not launch a browser or another process', async t => {
  const { root, userDataDir } = fixture(t);
  let spawns = 0;
  const service = createWorkBuddyService({ userDataDir, fetch: healthy, exec: processExec, spawn: () => { spawns += 1; return fakeSpawn(); } });
  assert.equal((await service.start(root)).running, true);
  assert.equal(spawns, 0);
});

test('a healthy manager from a different root cannot be accepted by start', async t => {
  const { root, userDataDir } = fixture(t);
  const service = createWorkBuddyService({ userDataDir, fetch: healthy, exec: async () => ({ stdout: '{"found":true,"matches":false,"pid":42}' }) });
  await assert.rejects(service.start(root), /身份|其他/);
});

test('an occupied upstream port must belong to the selected Go runtime', async t => {
  const { root, userDataDir } = fixture(t);
  let launched = false;
  const service = createWorkBuddyService({ userDataDir, fetch: unavailable, spawn: () => { launched = true; return fakeSpawn(); }, exec: async (_file, args) => ({
    stdout: args.at(-1).includes('7863') ? '{"found":true,"matches":false}' : '{"found":false,"matches":false}',
  }) });
  await assert.rejects(service.start(root), /上游.*身份|上游.*占用/);
  assert.equal(launched, false);
});

test('opening a healthy manager starts its missing upstream without launching another manager', async t => {
  const { root, userDataDir } = fixture(t);
  const launched = [];
  const service = createWorkBuddyService({ userDataDir, fetch: healthy,
    spawn: file => { launched.push(file); return fakeSpawn(); }, exec: async (_file, args) => ({
      stdout: args.at(-1).includes('7863') ? '{"found":false,"matches":false}' : '{"found":true,"matches":true,"pid":42}',
    }) });
  assert.equal((await service.start(root)).running, true);
  assert.deepEqual(launched, [path.join(root, 'upstream/wb2api.exe')]);
});

test('starting a manager uses the windowless interpreter and refuses a console-only environment', async t => {
  const { root, userDataDir } = fixture(t);
  const launched = [];
  const service = createWorkBuddyService({ userDataDir, platform: 'win32',
    fetch: async () => launched.length ? healthy() : unavailable(),
    spawn: (file, args, options) => { launched.push({ file, args, options }); return fakeSpawn(); },
    exec: async (_file, args) => ({ stdout: JSON.stringify({ found: args.at(-1).includes('7863') || launched.length > 0, matches: true, pid: 123 }) }),
  });
  assert.equal((await service.start(root)).running, true);
  assert.equal(launched[0].file, path.join(root, '.venv/Scripts/pythonw.exe'));
  assert.equal(launched[0].options.detached, true);
  assert.equal(launched[0].options.windowsHide, true);
  launched.length = 0;
  fs.unlinkSync(path.join(root, '.venv/Scripts/pythonw.exe'));
  await assert.rejects(service.start(root), /Python.*运行环境/);
  assert.equal(launched.length, 0);
});

test('a verified legacy manager migrates once while the upstream and later opens stay running', async t => {
  const { root, userDataDir } = fixture(t);
  let running = true, legacy = true, stops = 0, launches = 0;
  const service = createWorkBuddyService({ userDataDir, fetch: async () => running ? healthy() : unavailable(),
    spawn: file => { assert.equal(file, path.join(root, '.venv/Scripts/pythonw.exe')); launches++; running = true; legacy = false; return fakeSpawn(); },
    exec: async (_file, args) => {
      const command = args.at(-1);
      if (command.includes('7863')) return { stdout: '{"found":true,"matches":true}' };
      if (command.includes('Stop-Process')) { stops++; running = false; return { stdout: '{"stopped":true}' }; }
      return { stdout: JSON.stringify({ found: running, matches: running, legacy, pid: 123 }) };
    },
  });
  const opened = await Promise.all([service.start(root), service.start(root)]);
  assert.ok(opened.every(state => state.running));
  assert.equal((await service.start(root)).running, true);
  assert.equal(stops, 1);
  assert.equal(launches, 1);
});

test('a legacy manager stays running when the windowless runtime is missing', async t => {
  const { root, userDataDir } = fixture(t);
  fs.unlinkSync(path.join(root, '.venv/Scripts/pythonw.exe'));
  let stopped = false;
  const service = createWorkBuddyService({ userDataDir, fetch: healthy, exec: async (_file, args) => {
    if (args.at(-1).includes('Stop-Process')) stopped = true;
    return { stdout: '{"found":true,"matches":true,"legacy":true,"pid":123}' };
  } });
  await assert.rejects(service.start(root), /Python.*运行环境/);
  assert.equal(stopped, false);
});

test('Windows identity checks accept both installed interpreters and reject another deployment', { skip: process.platform !== 'win32' }, async t => {
  const { execFile } = require('node:child_process');
  const run = require('node:util').promisify(execFile);
  const { root, userDataDir } = fixture(t);
  for (const [exe, accepted] of [
    [path.join(root, '.venv/Scripts/python.exe'), true],
    [path.join(root, '.venv/Scripts/pythonw.exe'), true],
    [path.join(root, 'another/.venv/Scripts/pythonw.exe'), false],
  ]) {
    const commandLine = `"${exe}" -m uvicorn server.main:app --port 7864`;
    const service = createWorkBuddyService({ userDataDir, fetch: healthy, exec: async (file, args, options) => {
      const command = args.at(-1);
      if (command.includes('7863')) return { stdout: '{"found":true,"matches":true}' };
      // Run the production PowerShell identity expression with controlled OS
      // process records; no real listener can be stopped by this fixture.
      const records = `function Get-NetTCPConnection { [pscustomobject]@{OwningProcess=123} }; function Get-CimInstance { [pscustomobject]@{ProcessId=123;CommandLine='${commandLine.replaceAll("'", "''")}'} }; `;
      const result = await run(file, [...args.slice(0, -1), records + command], options);
      const inspected = JSON.parse(result.stdout);
      assert.equal(inspected.matches, accepted);
      assert.equal(inspected.legacy, accepted && exe.endsWith('python.exe'));
      // Migration is tested separately; isolate real identity evaluation here.
      return { stdout: JSON.stringify({ ...inspected, legacy: false }) };
    } });
    if (accepted) assert.equal((await service.start(root)).running, true);
    else await assert.rejects(service.start(root), /身份/);
  }
});

test('Windows manager has no console and keeps writing logs after its launching app exits', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const { execFileSync, execFile: run } = require('node:child_process');
  const { promisify } = require('node:util');
  let python;
  try { python = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { windowsHide: true, encoding: 'utf8' }).trim(); }
  catch { t.skip('Native Python is required for the Windows console regression'); return; }
  const { root, userDataDir } = fixture(t);
  fs.unlinkSync(path.join(root, '.venv/Scripts/python.exe'));
  fs.unlinkSync(path.join(root, '.venv/Scripts/pythonw.exe'));
  execFileSync(python, ['-m', 'venv', '--without-pip', path.join(root, '.venv')], { windowsHide: true, timeout: 10000 });
  const report = path.join(root, 'console.json');
  // A minimal uvicorn stand-in exercises the real venv launcher and Windows
  // console APIs without installing packages or touching the user's service.
  fs.writeFileSync(path.join(root, 'uvicorn.py'), `import ctypes,json,os,sys,time
kernel=ctypes.windll.kernel32
kernel.GetConsoleWindow.restype=ctypes.c_void_p
console=kernel.GetConsoleWindow()
print('manager-stdout',flush=True)
print('manager-stderr',file=sys.stderr,flush=True)
with open('console.json','w') as f: json.dump({'pid':os.getpid(),'console':console or 0,'args':sys.argv},f)
time.sleep(1.5)
with open('survived.txt','w') as f: f.write('alive')
`);
  const parent = path.join(root, 'launch.cjs');
  fs.writeFileSync(parent, `const fs=require('node:fs');
const {createWorkBuddyService}=require(${JSON.stringify(require.resolve('./workbuddy-service.cjs'))});
const service=createWorkBuddyService({userDataDir:${JSON.stringify(userDataDir)},pollIntervalMs:10,
fetch:async()=>{if(!fs.existsSync(${JSON.stringify(report)})) throw Error('pending');return {ok:true,json:async()=>({ok:true,service:'workbuddy-manager'})};},
exec:async(_file,args)=>({stdout:JSON.stringify({found:args.at(-1).includes('7863')||fs.existsSync(${JSON.stringify(report)}),matches:true,pid:123})})});
service.start(${JSON.stringify(root)}).catch(()=>{process.exitCode=1});
`);
  await promisify(run)(process.execPath, [parent], { windowsHide: true, timeout: 12000 });
  // The launcher has exited, but the independent manager must finish its work.
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(path.join(root, 'survived.txt')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(fs.readFileSync(path.join(root, 'survived.txt'), 'utf8'), 'alive');
  const info = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(info.console, 0, 'the manager must never allocate a terminal window');
  assert.ok(info.args.includes('server.main:app'));
  assert.match(fs.readFileSync(path.join(root, 'data/manager.out.log'), 'utf8'), /manager-stdout/);
  assert.match(fs.readFileSync(path.join(root, 'data/manager.err.log'), 'utf8'), /manager-stderr/);
});

test('failed startup cleans only its newly launched manager process for update rollback', async t => {
  const { root, userDataDir } = fixture(t);
  const commands = [];
  const service = createWorkBuddyService({ userDataDir, fetch: unavailable, spawn: fakeSpawn,
    startupTimeoutMs: 10, pollIntervalMs: 1, exec: async (_file, args) => {
      const command = args.at(-1);
      commands.push(command);
      return { stdout: command.includes('Stop-Process') ? '{"stopped":true}' : '{"found":false,"matches":false}' };
    } });
  await assert.rejects(service.start(root), /启动失败/);
  const cleanup = commands.filter(command => command.includes('Stop-Process'));
  assert.equal(cleanup.length, 1);
  assert.match(cleanup[0], /123/);
  assert.doesNotMatch(cleanup[0], /wb2api\.exe/);
});

test('startup fails within its deadline and exposes only a classified log summary', async t => {
  const { root, userDataDir } = fixture(t);
  fs.writeFileSync(path.join(root, 'data/manager.err.log'), 'WB_ADMIN_PASSWORD=keep-private\nModuleNotFoundError: No module named uvicorn\n');
  const service = createWorkBuddyService({ userDataDir, fetch: unavailable, exec: async () => ({ stdout: '{"found":false,"matches":false}' }),
    spawn: fakeSpawn, startupTimeoutMs: 30, pollIntervalMs: 1 });
  await assert.rejects(service.start(root), error => /Python 依赖/.test(error.message) && !error.message.includes('keep-private'));
});

test('stopping a verified manager leaves the upstream account process alone', async t => {
  const { root, userDataDir } = fixture(t);
  let stopped = false;
  const commands = [];
  const service = createWorkBuddyService({ userDataDir, fetch: async () => stopped ? unavailable() : healthy(), exec: async (_file, args) => {
    const command = args.at(-1);
    commands.push(command);
    if (command.includes('Stop-Process')) { stopped = true; return { stdout: '{"stopped":true}' }; }
    return { stdout: '{"found":true,"matches":true,"pid":42}' };
  }, pollIntervalMs: 1 });
  assert.equal((await service.stop(root)).running, false);
  assert.equal(commands.filter(command => command.includes('Stop-Process')).length, 1);
  assert.equal(commands.filter(command => command.includes('Stop-Process')).every(command => !command.includes('wb2api.exe')), true);
});

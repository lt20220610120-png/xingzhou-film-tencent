const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { execFile, spawn: nativeSpawn } = require('node:child_process');

const runFile = promisify(execFile);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const psLiteral = value => `'${String(value).replaceAll("'", "''")}'`;
const isFile = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };
const isLoopback = host => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host.toLowerCase());

function validateRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error('请选择控制面板的绝对路径');
  }
  let root;
  try { root = fs.realpathSync(value); } catch { throw new Error('所选面板目录不存在'); }
  if (!isFile(path.join(root, 'server/main.py')) || !isFile(path.join(root, 'web/out/index.html'))) {
    throw new Error('所选面板目录缺少官方服务或网页文件');
  }
  return root;
}

function readEnv(root) {
  const result = {};
  let source;
  try { source = fs.readFileSync(path.join(root, '.env'), 'utf8'); } catch { return result; }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    result[match[1]] = value;
  }
  return result;
}

function settings(root) {
  const env = readEnv(root);
  const port = Number(env.WB_MANAGER_PORT || 7864);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('面板端口配置无效');
  const host = env.WB_MANAGER_HOST || '127.0.0.1';
  if (!isLoopback(host)) throw new Error('控制面板需要使用本机回环地址');
  const dataDir = path.resolve(root, env.WB_DATA_DIR || 'data');
  const upstreamDir = path.resolve(root, env.WB_UPSTREAM_DIR || 'upstream');
  const url = `http://127.0.0.1:${port}`;
  let upstreamUrl;
  try { upstreamUrl = new URL(env.WB2API_BASE || 'http://127.0.0.1:7863'); } catch { throw new Error('上游地址配置无效'); }
  if (upstreamUrl.protocol !== 'http:' || !isLoopback(upstreamUrl.hostname) || upstreamUrl.username || upstreamUrl.password) {
    throw new Error('内嵌面板需要使用本机上游服务');
  }
  return {
    port, url, dataDir, upstreamDir, upstreamUrl: upstreamUrl.origin,
    upstreamPort: Number(upstreamUrl.port || 80),
    usersFile: path.resolve(root, env.WB_USERS_FILE || path.join(dataDir, 'users.json')),
    authDir: path.resolve(root, env.WB_AUTH_DIR || path.join(upstreamDir, 'auths')),
    upstreamConfig: path.resolve(root, env.WB_UPSTREAM_CONFIG || path.join(upstreamDir, 'config.json')),
    python: path.join(root, '.venv/Scripts/pythonw.exe'),
    legacyPython: path.join(root, '.venv/Scripts/python.exe'),
  };
}

function createWorkBuddyService({ userDataDir, exec = runFile, fetch: request = global.fetch, spawn = nativeSpawn,
  now = Date.now, startupTimeoutMs = 25000, pollIntervalMs = 300, platform = process.platform } = {}) {
  if (!userDataDir || !path.isAbsolute(userDataDir)) throw new Error('缺少本机配置目录');
  const configFile = path.join(userDataDir, 'workbuddy-panel.json');
  let selectedRoot = null;
  let discovering = null;
  const starts = new Map();

  const powershell = command => exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true, timeout: 12000, maxBuffer: 512 * 1024, encoding: 'utf8',
  });
  const jsonResult = result => {
    try { return JSON.parse(String(result?.stdout ?? result ?? '').replace(/^\uFEFF/, '').trim() || 'null'); }
    catch { return null; }
  };

  function remember(root) {
    fs.mkdirSync(userDataDir, { recursive: true });
    const temporary = `${configFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ root }), { mode: 0o600 });
    fs.renameSync(temporary, configFile);
    selectedRoot = root;
    return root;
  }

  async function discover() {
    if (selectedRoot) { try { return validateRoot(selectedRoot); } catch { selectedRoot = null; } }
    try {
      const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      selectedRoot = validateRoot(saved.root);
      return selectedRoot;
    } catch { /* stale or absent selection: try the existing shortcut */ }
    if (platform !== 'win32') return null;
    if (discovering) return discovering;
    discovering = (async () => {
      try {
        // Reading shortcuts never executes their target or arguments.
        const result = await powershell(`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $shell=New-Object -ComObject WScript.Shell; $dirs=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu')); $items=@(foreach($dir in $dirs){ if($dir -and (Test-Path -LiteralPath $dir)){ Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | Where-Object {$_.Name -match 'WorkBuddy'} | ForEach-Object { $shortcut=$shell.CreateShortcut($_.FullName); [pscustomobject]@{workingDirectory=$shortcut.WorkingDirectory;targetPath=$shortcut.TargetPath;arguments=$shortcut.Arguments} } } }); ConvertTo-Json -InputObject $items -Compress`);
        const found = jsonResult(result);
        for (const shortcut of Array.isArray(found) ? found : found ? [found] : []) {
          const args = String(shortcut.arguments || '');
          const launchFile = args.match(/-File\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i);
          const candidates = [shortcut.workingDirectory, shortcut.targetPath ? path.dirname(shortcut.targetPath) : null,
            launchFile ? path.dirname(launchFile[1] || launchFile[2] || launchFile[3]) : null];
          for (const candidate of candidates) {
            try { return remember(validateRoot(candidate)); } catch { /* unrelated shortcut */ }
          }
        }
      } catch { /* folder selection remains available when COM is unavailable */ }
      return null;
    })();
    try { return await discovering; } finally { discovering = null; }
  }

  async function resolveRoot(root) {
    const value = root || await discover();
    if (!value) throw new Error('未找到 WorkBuddy 控制面板，请选择安装目录');
    return validateRoot(value);
  }

  async function health(config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await request(`${config.url}/api/healthz`, { signal: controller.signal, redirect: 'error' });
      let body;
      try { body = await response.json(); } catch { body = null; }
      return { running: response.ok === true && body?.ok === true && body?.service === 'workbuddy-manager', reachable: true };
    } catch { return { running: false, reachable: false }; }
    finally { clearTimeout(timer); }
  }

  async function status(root) {
    let located;
    try { located = root ? validateRoot(root) : await discover(); }
    catch { return { installed: false, running: false, root: null, version: '', error: '面板目录无效，请重新选择' }; }
    if (!located) return { installed: false, running: false, root: null, version: '' };
    let config;
    try { config = settings(located); }
    catch (error) { return { installed: true, running: false, root: located, version: '', error: error.message }; }
    const state = await health(config);
    let version = '';
    try { version = fs.readFileSync(path.join(located, '.version'), 'utf8').trim(); } catch { /* older installs */ }
    if (!/^[vV]?\d+\.\d+\.\d+[\w.-]*$/.test(version)) version = '';
    let accounts = 0;
    try { accounts = fs.readdirSync(config.authDir).filter(name => /^workbuddy-.*\.json$/.test(name)).length; } catch { /* empty pool */ }
    return { installed: true, running: state.running, root: located, version, accounts, port: config.port,
      ...(state.reachable && !state.running ? { error: '面板端口已被其他服务占用' } : {}) };
  }

  async function selectRoot(root) { return status(remember(validateRoot(root))); }

  function sessionCookie(root) {
    const config = settings(validateRoot(root));
    let users;
    try { users = JSON.parse(fs.readFileSync(config.usersFile, 'utf8')); }
    catch { throw new Error('无法建立管理员会话，请检查面板管理员配置'); }
    const admin = Array.isArray(users?.users) ? users.users.find(user => user?.role === 'admin' && typeof user.username === 'string' && user.username) : null;
    if (!admin || typeof users.secret !== 'string' || !users.secret || !Number.isSafeInteger(Number(admin.sv || 0))) {
      throw new Error('无法建立管理员会话，请检查面板管理员配置');
    }
    const issued = Math.floor(now() / 1000);
    const payload = JSON.stringify({ username: admin.username, role: 'admin', sv: Number(admin.sv || 0), iat: issued, orig: issued, exp: issued + 300 });
    const signature = crypto.createHmac('sha256', users.secret).update(payload, 'utf8').digest('hex');
    const value = Buffer.from(`${payload}|${signature}`, 'utf8').toString('base64').replaceAll('+', '-').replaceAll('/', '_');
    // Internal main-process API. Never expose this result through IPC or logging.
    return { name: 'wb_session', value, url: config.url, path: '/', httpOnly: true, sameSite: 'lax', secure: false, expirationDate: issued + 300 };
  }

  function processScript(root, config, stopping = false, expectedPid = null) {
    const prefix = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $expected=${psLiteral(config.python)}; $legacy=${psLiteral(config.legacyPython)}; $conns=@(Get-NetTCPConnection -LocalPort ${config.port} -State Listen -ErrorAction SilentlyContinue); $ids=@($conns | Select-Object -ExpandProperty OwningProcess -Unique); if($ids.Count -ne 1){ [pscustomobject]@{found=($ids.Count -gt 0);matches=$false}|ConvertTo-Json -Compress; exit }; $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ids[0]); $command=[string]$process.CommandLine; $match=($command.StartsWith('"'+$expected+'"',[StringComparison]::OrdinalIgnoreCase) -or $command.StartsWith($expected+' ',[StringComparison]::OrdinalIgnoreCase) -or $command.StartsWith('"'+$legacy+'"',[StringComparison]::OrdinalIgnoreCase) -or $command.StartsWith($legacy+' ',[StringComparison]::OrdinalIgnoreCase)) -and ($command -match '(?:^|\\s)-m\\s+uvicorn(?:\\s|$)') -and ($command -match '(?:^|\\s)server\\.main:app(?:\\s|$)');`;
    if (!stopping) return `${prefix} $legacyMatch=$match -and ($command.StartsWith('"'+$legacy+'"',[StringComparison]::OrdinalIgnoreCase) -or $command.StartsWith($legacy+' ',[StringComparison]::OrdinalIgnoreCase)); [pscustomobject]@{found=$true;matches=$match;legacy=$legacyMatch;pid=$process.ProcessId}|ConvertTo-Json -Compress`;
    return `${prefix} if(-not $match -or $process.ProcessId -ne ${Number(expectedPid)}){ throw 'Process identity mismatch' }; $children=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$process.ProcessId) | Where-Object {$_.Name -match '^python(?:w)?\\.exe$'}); foreach($child in $children){ Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop; [pscustomobject]@{stopped=$true}|ConvertTo-Json -Compress`;
  }

  async function inspectUpstream(config) {
    const expected = path.join(config.upstreamDir, 'wb2api.exe');
    try {
      const result = jsonResult(await powershell(`$ErrorActionPreference='Stop'; $expected=${psLiteral(expected)}; $conns=@(Get-NetTCPConnection -LocalPort ${config.upstreamPort} -State Listen -ErrorAction SilentlyContinue); $ids=@($conns|Select-Object -ExpandProperty OwningProcess -Unique); if($ids.Count -eq 0){ [pscustomobject]@{found=$false;matches=$false}|ConvertTo-Json -Compress; exit }; if($ids.Count -ne 1){ [pscustomobject]@{found=$true;matches=$false}|ConvertTo-Json -Compress; exit }; $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ids[0]); $match=[string]::Equals([string]$process.ExecutablePath,$expected,[StringComparison]::OrdinalIgnoreCase); [pscustomobject]@{found=$true;matches=$match}|ConvertTo-Json -Compress`));
      if (!result) throw new Error('missing');
      return result;
    } catch { throw new Error('无法确认本机上游服务身份'); }
  }

  async function cleanupLaunchedManager(config, pid) {
    if (!Number.isInteger(pid) || pid <= 0) return;
    // Only the launcher's verified Python lineage can be cleaned without a
    // healthy HTTP marker. Never stop an unrelated listener during rollback.
    try {
      await powershell(`$ErrorActionPreference='Stop'; $expected=${psLiteral(config.python)}; $process=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if(-not $process){exit}; $command=[string]$process.CommandLine; $match=($command.StartsWith('"'+$expected+'"',[StringComparison]::OrdinalIgnoreCase) -or $command.StartsWith($expected+' ',[StringComparison]::OrdinalIgnoreCase)) -and ($command -match '(?:^|\\s)-m\\s+uvicorn(?:\\s|$)') -and ($command -match '(?:^|\\s)server\\.main:app(?:\\s|$)'); if(-not $match){exit}; $children=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$process.ProcessId) | Where-Object {$_.Name -match '^python(?:w)?\\.exe$'}); foreach($child in $children){ Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue`);
    } catch { /* best effort; the original classified startup error wins */ }
  }

  async function inspectManager(root, config) {
    if (platform !== 'win32') throw new Error('控制面板进程管理仅支持 Windows');
    try { return jsonResult(await powershell(processScript(root, config))) || { found: true, matches: false }; }
    catch { throw new Error('无法确认面板服务进程身份'); }
  }

  function logSummary(config) {
    let tail;
    try {
      const file = path.join(config.dataDir, 'manager.err.log');
      const fd = fs.openSync(file, 'r');
      try { const size = fs.fstatSync(fd).size; const buffer = Buffer.alloc(Math.min(size, 16384)); fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length)); tail = buffer.toString('utf8'); }
      finally { fs.closeSync(fd); }
    } catch { return '请检查面板运行环境后重试'; }
    // Do not return raw logs: bootstrap can print an administrator password.
    if (/ModuleNotFoundError|No module named|ImportError/i.test(tail)) return 'Python 依赖缺失，请修复面板运行环境';
    if (/10048|address already in use|EADDRINUSE/i.test(tail)) return '面板端口已被占用';
    if (/PermissionError|Access is denied|拒绝访问/i.test(tail)) return '面板目录或运行文件无法访问';
    return '请检查面板运行环境后重试';
  }

  function launch(file, args, cwd, outFile, errFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const out = fs.openSync(outFile, 'a');
    const err = fs.openSync(errFile, 'a');
    let child;
    try { child = spawn(file, args, { cwd, detached: true, windowsHide: true, stdio: ['ignore', out, err], env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } }); }
    catch { throw new Error('无法启动面板运行文件'); }
    finally { fs.closeSync(out); fs.closeSync(err); }
    let failed = false;
    child.on('error', () => { failed = true; });
    child.unref();
    return { pid: child.pid, isFailed: () => failed };
  }

  async function start(root) {
    const located = await resolveRoot(root);
    if (starts.has(located)) return starts.get(located);
    const starting = (async () => {
      const config = settings(located);
      let current = await health(config);
      let existing;
      if (current.running) {
        existing = await inspectManager(located, config);
        if (!existing.found || !existing.matches) throw new Error('面板服务属于其他目录，无法确认身份');
      } else {
        if (current.reachable) throw new Error('面板端口已被其他服务占用');
        existing = await inspectManager(located, config);
      }
      if (existing.found && !existing.matches) throw new Error('面板端口已被其他进程占用，无法确认身份');
      if ((!current.running || existing.legacy === true) && !isFile(config.python)) throw new Error('缺少 Python 运行环境，请在面板目录完成首次安装');
      const upstreamExe = path.join(config.upstreamDir, 'wb2api.exe');
      if (!isFile(upstreamExe) || !isFile(config.upstreamConfig)) throw new Error('上游运行文件缺失，请检查面板安装目录');
      const upstreamState = await inspectUpstream(config);
      if (upstreamState.found && !upstreamState.matches) throw new Error('上游端口被其他服务占用，无法确认身份');
      if (!upstreamState.found) launch(upstreamExe, ['-config', config.upstreamConfig], config.upstreamDir,
        path.join(config.upstreamDir, 'data/server.out.log'), path.join(config.upstreamDir, 'data/server.err.log'));
      if (current.running && existing.legacy === true) {
        // Recheck identity in stop before replacing a console-backed manager.
        // Panel open/update already serialize this entire startup promise.
        await stop(located);
        current = await health(config);
        existing = await inspectManager(located, config);
        if ((current.reachable && !current.running) || (existing.found && !existing.matches)) throw new Error('面板端口已被其他进程占用，无法确认身份');
        if (current.running && !existing.found) throw new Error('面板服务身份不匹配');
      }
      if (current.running) return status(located);
      let launched = null;
      // The venv console launcher starts another interpreter that allocates a
      // visible console despite windowsHide + detached. pythonw keeps both
      // processes windowless while redirected logs and detached lifetime work.
      if (!existing.found) launched = launch(config.python, ['-m', 'uvicorn', 'server.main:app', '--env-file', '.env', '--host', '127.0.0.1', '--port', String(config.port)], located,
        path.join(config.dataDir, 'manager.out.log'), path.join(config.dataDir, 'manager.err.log'));
      const deadline = Date.now() + startupTimeoutMs;
      try {
        do {
          if (launched?.isFailed()) break;
          const state = await health(config);
          if (state.running) {
            const running = await inspectManager(located, config);
            if (!running.found || !running.matches) throw new Error('面板服务身份不匹配');
            return status(located);
          }
          if (state.reachable) throw new Error('面板端口已被其他服务占用');
          await wait(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
        } while (Date.now() < deadline);
        throw new Error(`面板启动失败：${logSummary(config)}`);
      } catch (error) {
        if (launched) await cleanupLaunchedManager(config, launched.pid);
        throw error;
      }
    })();
    starts.set(located, starting);
    try { return await starting; } finally { starts.delete(located); }
  }

  async function stop(root) {
    const located = await resolveRoot(root);
    const config = settings(located);
    const state = await health(config);
    if (state.reachable && !state.running) throw new Error('面板端口被其他服务占用，无法确认身份');
    const process = await inspectManager(located, config);
    if (!process.found) return status(located);
    if (!state.running || !process.matches || !Number.isInteger(process.pid)) throw new Error('无法确认面板服务进程身份，未停止任何进程');
    try {
      const result = jsonResult(await powershell(processScript(located, config, true, process.pid)));
      if (!result?.stopped) throw new Error('not stopped');
    } catch { throw new Error('面板服务未停止，进程身份可能已改变'); }
    const deadline = Date.now() + 10000;
    do {
      if (!(await health(config)).running) return status(located);
      await wait(pollIntervalMs);
    } while (Date.now() < deadline);
    throw new Error('面板服务停止超时');
  }

  return { discover, getRoot: discover, status, start, stop, sessionCookie, selectRoot, setRoot: selectRoot };
}

module.exports = { createWorkBuddyService, validateRoot };

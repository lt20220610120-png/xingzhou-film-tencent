const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function inside(root, target) {
  const relative = path.relative(root, target);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function hashFile(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(256 * 1024);
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

function cmd(file, args) {
  return execFileSync(file, args, { windowsHide: true, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
}

function protectFolder(folder, readonly) {
  if (process.platform !== 'win32') {
    fs.chmodSync(folder, readonly ? 0o500 : 0o700);
    return;
  }
  const sid = cmd('whoami.exe', ['/user', '/fo', 'csv', '/nh']).match(/"S-1-[0-9-]+"/)?.[0].slice(1, -1);
  if (!sid) throw new Error('无法识别本机备份的所有者');
  cmd('icacls.exe', [folder, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)(${readonly ? 'RX' : 'F'})`]);
  const script = `$ErrorActionPreference='Stop';$acl=[IO.Directory]::GetAccessControl('${folder.replaceAll("'", "''")}');$rules=$acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]);if(!$acl.AreAccessRulesProtected -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne '${sid}' -or $rules[0].AccessControlType -ne 'Allow'){exit 1};if(${readonly ? '$true' : '$false'} -eq [bool]($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::WriteData)){exit 1}`;
  cmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

function statIfPresent(source) {
  try { return fs.lstatSync(source, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function copyVerified(source, destination, manifest, relative) {
  const before = statIfPresent(source);
  if (!before || before.isSymbolicLink() || (!before.isFile() && !before.isDirectory())) throw new Error('备份资料包含链接、特殊文件或已变更的文件');
  if (before.isDirectory()) {
    const names = fs.readdirSync(source).sort();
    fs.mkdirSync(destination, { mode: 0o700 });
    for (const name of names) copyVerified(path.join(source, name), path.join(destination, name), manifest, relative.concat(name));
    if (JSON.stringify(fs.readdirSync(source).sort()) !== JSON.stringify(names)) throw new Error('备份期间目录发生变化，请稍后重试');
    if (process.platform !== 'win32') fs.chmodSync(destination, 0o500);
    return;
  }
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  const copied = hashFile(destination);
  const original = hashFile(source);
  const after = statIfPresent(source);
  if (copied !== original || before.size !== after?.size || before.ino !== after?.ino || before.mtimeNs !== after?.mtimeNs) {
    throw new Error('备份期间资料发生变化，请稍后重试');
  }
  manifest.push({ path: relative, sha256: copied });
  fs.chmodSync(destination, 0o400);
}

function disposableTree(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const child = path.join(folder, entry.name);
    if (entry.isDirectory()) { fs.chmodSync(child, 0o700); disposableTree(child); }
    else fs.chmodSync(child, 0o600);
  }
  fs.rmSync(folder, { recursive: true, force: true });
}

function createBackup(root, persistentPaths, directory = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Xingzhou-WorkBuddy-Backups')) {
  root = fs.realpathSync(root);
  const base = path.resolve(directory);
  if (inside(root, base)) throw new Error('WorkBuddy 备份必须保存在部署目录之外');
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(base).isSymbolicLink() || inside(root, fs.realpathSync(base))) throw new Error('WorkBuddy 备份目录无效');
  const folder = fs.mkdtempSync(path.join(base, 'workbuddy-'));
  const manifest = [];
  const external = [];
  try {
    protectFolder(folder, false);
    const externalSources = new Set();
    for (const { key, path: source } of persistentPaths) {
      // Client integration destinations can contain unrelated credentials.
      if (['WB_CCSWITCH_DIR', 'WB_ZCODE_DIR'].includes(key)) continue;
      const files = key === 'WB_DB' ? [source, source + '-wal', source + '-shm'] : [source];
      for (const file of files) {
        if (inside(root, file) || !statIfPresent(file)) continue;
        if (inside(file, root) || inside(file, folder)) throw new Error('外部资料路径与部署或备份目录重叠');
        externalSources.add(file);
      }
    }
    copyVerified(root, path.join(folder, 'installation'), manifest, ['installation']);
    for (const source of externalSources) {
      if ([...externalSources].some(parent => parent !== source && inside(parent, source))) continue;
      const prefix = `external-${external.length + 1}`;
      copyVerified(source, path.join(folder, prefix), manifest, [prefix]);
      external.push({ source, prefix });
    }
    const index = path.join(folder, 'manifest.json');
    fs.writeFileSync(index, JSON.stringify({ version: 1, external, files: manifest }), { flag: 'wx', mode: 0o400 });
    const reference = source => {
      if (inside(root, source)) return path.join(folder, 'installation', path.relative(root, source));
      const item = external.find(({ source: parent }) => inside(parent, source));
      return item ? path.join(folder, item.prefix, path.relative(item.source, source)) : null;
    };
    protectFolder(folder, true);
    return { directory: folder, reference, files: manifest.length };
  } catch (error) {
    try { disposableTree(folder); } catch { /* An incomplete private copy grants no access to another user. */ }
    throw error;
  }
}

function accountInventory(paths) {
  const folders = [...new Set(paths.filter(({ key }) => ['WB_AUTH_DIR', 'WB2A_AUTH_DIR', 'auth_dir', '分组账号目录'].includes(key)).map(item => item.path))];
  return folders.map(folder => {
    const directory = statIfPresent(folder);
    if (!directory) return [folder, []];
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('账号目录无效，更新已停止');
    const records = fs.readdirSync(folder, { withFileTypes: true });
    if (records.some(item => item.isSymbolicLink())) throw new Error('账号目录包含链接，更新已停止');
    return [folder, records.filter(item => item.isFile() && /^workbuddy-.+\.json(?:\.disabled)?$/i.test(item.name)).map(item => item.name).sort()];
  });
}

function checkpointDatabase(database, folder) {
  if (!database) return [];
  fs.mkdirSync(folder, { mode: 0o700 });
  return ['', '-wal', '-shm', '-journal'].map(suffix => {
    const source = database + suffix;
    const saved = path.join(folder, `manager.db${suffix}`);
    const previous = statIfPresent(source);
    if (previous) {
      if (!previous.isFile()) throw new Error('WorkBuddy 数据库路径无效');
      fs.copyFileSync(source, saved, fs.constants.COPYFILE_EXCL);
      if (hashFile(source) !== hashFile(saved)) throw new Error('WorkBuddy 数据库备份校验失败');
    }
    return { source, saved: previous ? saved : null };
  });
}

function restoreDatabase(checkpoint, quarantine) {
  if (!checkpoint.length) return;
  fs.mkdirSync(quarantine, { mode: 0o700 });
  for (const [index, {source, saved}] of checkpoint.entries()) {
    const candidate = statIfPresent(source);
    if (candidate) {
      if (!candidate.isFile()) throw new Error('WorkBuddy 数据库恢复路径无效');
      fs.copyFileSync(source, path.join(quarantine, `candidate-${index}`), fs.constants.COPYFILE_EXCL);
      if (!saved && path.basename(source).match(/-(?:wal|shm|journal)$/)) fs.unlinkSync(source);
    }
    if (saved) {
      fs.copyFileSync(saved, source);
      if (hashFile(saved) !== hashFile(source)) throw new Error('WorkBuddy 数据库恢复校验失败');
    }
  }
}

module.exports = { createBackup, accountInventory, hashFile, protectFolder, checkpointDatabase, restoreDatabase };

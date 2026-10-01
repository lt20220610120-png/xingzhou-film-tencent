const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const CREDENTIAL_FIELDS = new Set([
  'apikey', 'token', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken',
  'authorization', 'password', 'passwd', 'secret', 'clientsecret',
  'credentials', 'credential', 'cookie', 'cookies', 'privatekey',
]);

function checkpointError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
    throw checkpointError('DIRECTOR_QUICK_INVALID_RUN_ID', '自动分段任务编号无效，请重新打开任务列表。');
  }
  return runId;
}

// Checkpoints hold generated drafts, not API profiles. Reject secrets before
// any filesystem operation rather than silently deleting fields from a run.
function assertJsonData(value, ancestors = new Set(), depth = 0) {
  if (depth > 128) throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点嵌套过深，无法保存。');
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点包含无效数据，无法保存。');
  }
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点必须为普通 JSON 数据。');
  }
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点包含无效字段。');
    }
    if (CREDENTIAL_FIELDS.has(key.toLowerCase().replace(/[-_\s]/g, ''))) {
      throw checkpointError('DIRECTOR_QUICK_CREDENTIAL_FIELD', '自动分段检查点不能保存账号凭据或 API 密钥。');
    }
    if (descriptor.get || descriptor.set) {
      throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点包含非 JSON 属性。');
    }
    assertJsonData(descriptor.value, ancestors, depth + 1);
  }
  ancestors.delete(value);
}

function assertRun(run, accountId, expectedRunId) {
  if (!run || typeof run !== 'object' || Array.isArray(run) || !run.snapshot || typeof run.snapshot !== 'object' || Array.isArray(run.snapshot)) {
    throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点缺少任务快照。');
  }
  assertRunId(run.id);
  if (expectedRunId && run.id !== expectedRunId) {
    throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点任务编号不一致。');
  }
  if (run.snapshot.accountId !== accountId) {
    throw checkpointError('DIRECTOR_QUICK_ACCOUNT_MISMATCH', '当前账号无法访问此自动分段任务。');
  }
  if (typeof run.phase !== 'string' || !run.phase.trim()) {
    throw checkpointError('DIRECTOR_QUICK_INVALID_RUN', '自动分段检查点缺少任务状态。');
  }
  assertJsonData(run);
}

function createDirectorQuickCheckpoints(dataDir, getAccountId) {
  if (typeof dataDir !== 'string' || !dataDir.trim() || typeof getAccountId !== 'function') {
    throw new TypeError('自动分段检查点需要资料目录和当前账号解析器。');
  }
  const root = path.resolve(dataDir, '导演工作台的项目', 'quick-generation');

  function scope() {
    const accountId = getAccountId();
    if (typeof accountId !== 'string' || !accountId.trim()) {
      throw checkpointError('DIRECTOR_QUICK_ACCOUNT_REQUIRED', '请先登录行舟影视，再查看自动分段任务。');
    }
    const accountKey = crypto.createHash('sha256').update(accountId).digest('hex');
    return { accountId, directory: path.join(root, accountKey) };
  }

  function readRun(file, accountId, runId) {
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') throw checkpointError('DIRECTOR_QUICK_NOT_FOUND', '自动分段检查点不存在，无法继续旧任务。');
      throw checkpointError('DIRECTOR_QUICK_READ_FAILED', '自动分段检查点读取失败，请检查本地资料目录。');
    }
    try {
      const run = JSON.parse(source);
      assertRun(run, accountId, runId);
      return run;
    } catch {
      throw checkpointError('DIRECTOR_QUICK_CORRUPT', `自动分段任务 ${runId} 的检查点已损坏，无法继续；原有正式提示词仍保留。`);
    }
  }

  return {
    list() {
      const { accountId, directory } = scope();
      let names;
      try {
        names = fs.readdirSync(directory);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw checkpointError('DIRECTOR_QUICK_READ_FAILED', '自动分段任务列表读取失败，请检查本地资料目录。');
      }
      return names.filter((name) => name.endsWith('.json')).map((name) => {
        const runId = name.slice(0, -5);
        if (!RUN_ID.test(runId)) throw checkpointError('DIRECTOR_QUICK_CORRUPT', '自动分段任务目录含无效检查点文件。');
        return readRun(path.join(directory, name), accountId, runId);
      }).sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    },
    load({ runId } = {}) {
      assertRunId(runId);
      const { accountId, directory } = scope();
      return readRun(path.join(directory, `${runId}.json`), accountId, runId);
    },
    save({ run } = {}) {
      const { accountId, directory } = scope();
      assertRun(run, accountId);
      const json = JSON.stringify(run);
      const file = path.join(directory, `${run.id}.json`);
      const temporary = path.join(directory, `${run.id}.${crypto.randomUUID()}.tmp`);
      let descriptor;
      try {
        fs.mkdirSync(directory, { recursive: true });
        descriptor = fs.openSync(temporary, 'wx', 0o600);
        fs.writeFileSync(descriptor, json, 'utf8');
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.renameSync(temporary, file);
      } catch {
        throw checkpointError('DIRECTOR_QUICK_WRITE_FAILED', '自动分段检查点保存失败，已停止推进；请检查资料目录后继续。');
      } finally {
        if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch {} }
        try { fs.unlinkSync(temporary); } catch {}
      }
      return true;
    },
    remove({ runId } = {}) {
      assertRunId(runId);
      const { directory } = scope();
      try {
        fs.unlinkSync(path.join(directory, `${runId}.json`));
        return true;
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw checkpointError('DIRECTOR_QUICK_REMOVE_FAILED', '自动分段检查点清除失败，请检查本地资料目录。');
      }
    },
  };
}

function sameNativePath(first, second) {
  const normalize = (value) => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  return normalize(first) === normalize(second);
}

function pathWithin(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Walk existing ancestors as well as the final entry; checking only the final
// file would still follow a junction in its parent directory on Windows.
function assertNativePath(candidate) {
  const absolute = path.resolve(candidate);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stats;
    try { stats = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw checkpointError('DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH', '自动分段任务迁移遇到不可访问的资料路径，原目录已保留。');
    }
    if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
      throw checkpointError('DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH', '自动分段任务迁移不接受符号链接、junction 或特殊文件，原目录已保留。');
    }
    if (!sameNativePath(fs.realpathSync(current), current)) {
      throw checkpointError('DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH', '自动分段任务迁移发现资料路径重定向，原目录已保留。');
    }
  }
}

function migrateDirectorQuickCheckpoints(oldDataDir, newDataDir) {
  if (typeof oldDataDir !== 'string' || !oldDataDir.trim() || typeof newDataDir !== 'string' || !newDataDir.trim()) {
    throw new TypeError('自动分段任务迁移需要原资料目录和新资料目录。');
  }
  const sourceDir = path.resolve(oldDataDir, '导演工作台的项目', 'quick-generation');
  const targetDir = path.resolve(newDataDir, '导演工作台的项目', 'quick-generation');
  assertNativePath(sourceDir);
  assertNativePath(targetDir);
  for (const directory of [sourceDir, targetDir]) {
    if (fs.existsSync(directory) && !fs.lstatSync(directory).isDirectory()) {
      throw checkpointError('DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH', '自动分段任务迁移路径必须为资料目录，原目录已保留。');
    }
  }
  if (!sameNativePath(sourceDir, targetDir) && (pathWithin(sourceDir, targetDir) || pathWithin(targetDir, sourceDir))) {
    throw checkpointError('DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH', '自动分段任务迁移的来源和目标不能相互嵌套，原目录已保留。');
  }
  const result = { ok: true, copied: 0, unchanged: 0, sourceDir, targetDir };
  if (!fs.existsSync(sourceDir)) return result;
  const digest = (content) => crypto.createHash('sha256').update(content).digest('hex');
  const files = [];

  function collect(source) {
    if (!pathWithin(source, sourceDir)) throw checkpointError('DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH', '自动分段任务迁移来源超出指定目录。');
    assertNativePath(source);
    const stats = fs.lstatSync(source);
    if (stats.isDirectory()) {
      for (const name of fs.readdirSync(source)) collect(path.join(source, name));
      return;
    }
    const destination = path.resolve(targetDir, path.relative(sourceDir, source));
    if (!pathWithin(destination, targetDir)) throw checkpointError('DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH', '自动分段任务迁移目标超出指定目录。');
    assertNativePath(destination);
    const hash = digest(fs.readFileSync(source));
    if (fs.existsSync(destination)) {
      if (!fs.lstatSync(destination).isFile() || digest(fs.readFileSync(destination)) !== hash) {
        throw checkpointError('DIRECTOR_QUICK_MIGRATION_CONFLICT', '新资料目录已有不同内容的同名自动分段任务；迁移未覆盖任何任务，请选择其他目录。');
      }
      files.push({ source, destination, hash, unchanged: true });
    } else files.push({ source, destination, hash, unchanged: false });
  }

  // Finish validation/conflict detection before creating or copying anything.
  collect(sourceDir);
  for (const entry of files) {
    if (entry.unchanged) { result.unchanged += 1; continue; }
    assertNativePath(entry.source);
    assertNativePath(entry.destination);
    const content = fs.readFileSync(entry.source);
    if (digest(content) !== entry.hash) throw checkpointError('DIRECTOR_QUICK_MIGRATION_CONFLICT', '迁移期间原任务已发生变化，请暂停任务后重新切换目录。');
    let descriptor, created = false;
    try {
      fs.mkdirSync(path.dirname(entry.destination), { recursive: true });
      assertNativePath(path.dirname(entry.destination));
      descriptor = fs.openSync(entry.destination, 'wx', 0o600);
      created = true;
      fs.writeFileSync(descriptor, content);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      if (digest(fs.readFileSync(entry.destination)) !== entry.hash) throw new Error('checkpoint verification failed');
      result.copied += 1;
    } catch (error) {
      if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch {} }
      if (created && pathWithin(entry.destination, targetDir)) {
        // Only our exclusively created, verified in-scope file can be removed.
        try { assertNativePath(entry.destination); fs.unlinkSync(entry.destination); } catch {}
      }
      if (error.code === 'EEXIST') {
        assertNativePath(entry.destination);
        if (fs.lstatSync(entry.destination).isFile() && digest(fs.readFileSync(entry.destination)) === entry.hash) { result.unchanged += 1; continue; }
        throw checkpointError('DIRECTOR_QUICK_MIGRATION_CONFLICT', '迁移时目标出现不同内容的同名任务，原目录及已有目标任务均已保留。');
      }
      if (error.code?.startsWith('DIRECTOR_QUICK_')) throw error;
      throw checkpointError('DIRECTOR_QUICK_MIGRATION_FAILED', '自动分段任务迁移或核对失败，尚未切换资料目录；原任务已保留。');
    }
  }
  return result;
}

module.exports = { createDirectorQuickCheckpoints, migrateDirectorQuickCheckpoints };

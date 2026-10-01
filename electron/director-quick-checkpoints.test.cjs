const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDirectorQuickCheckpoints, migrateDirectorQuickCheckpoints } = require('./director-quick-checkpoints.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-quick-checkpoints-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let accountId = 'account-a';
  return { root, store: createDirectorQuickCheckpoints(root, () => accountId), setAccount: (id) => { accountId = id; } };
}

function run(id = 'run-1', accountId = 'account-a') {
  return { id, phase: 'generating', snapshot: { accountId, projectId: 'p-1', episodeId: 'e-1', sceneLabel: '1-1' }, segmentDrafts: [], updatedAt: '2026-10-02T01:00:00.000Z' };
}

test('检查点按主进程当前账号隔离，不能由 renderer 指定其他账号', (t) => {
  const { store, setAccount } = fixture(t);
  store.save({ run: run() });
  assert.deepEqual(store.list(), [run()]);
  setAccount('account-b');
  assert.deepEqual(store.list(), []);
  assert.throws(() => store.load({ runId: 'run-1' }), { code: 'DIRECTOR_QUICK_NOT_FOUND' });
  assert.throws(() => store.save({ run: run() }), { code: 'DIRECTOR_QUICK_ACCOUNT_MISMATCH' });
  store.save({ run: run('run-1', 'account-b') });
  assert.equal(store.load({ runId: 'run-1' }).snapshot.accountId, 'account-b');
  store.remove({ runId: 'run-1' });
  setAccount('account-a');
  assert.deepEqual(store.load({ runId: 'run-1' }), run());
  setAccount('');
  assert.throws(() => store.list(), { code: 'DIRECTOR_QUICK_ACCOUNT_REQUIRED' });
});

test('任意路径、遍历和不安全 run ID 均在文件 IO 之前拒绝', (t) => {
  const { store } = fixture(t);
  for (const runId of ['../outside', 'C:\\outside', '/tmp/outside', 'a/b', 'a\\b', '.', '..', 'run:1', '', 'x'.repeat(129)]) {
    assert.throws(() => store.load({ runId }), { code: 'DIRECTOR_QUICK_INVALID_RUN_ID' });
    assert.throws(() => store.remove({ runId }), { code: 'DIRECTOR_QUICK_INVALID_RUN_ID' });
    assert.throws(() => store.save({ run: run(runId) }), { code: 'DIRECTOR_QUICK_INVALID_RUN_ID' });
  }
});

test('临时写入或替换中断后上一份有效 JSON 仍然可读取', (t) => {
  const { store } = fixture(t);
  store.save({ run: run() });
  t.mock.method(fs, 'renameSync', () => { const error = new Error('simulated interruption'); error.code = 'EIO'; throw error; });
  assert.throws(() => store.save({ run: { ...run(), phase: 'ready-to-commit' } }), { code: 'DIRECTOR_QUICK_WRITE_FAILED' });
  assert.deepEqual(store.load({ runId: 'run-1' }), run());
  assert.deepEqual(store.list(), [run()]);
});

test('缺失或损坏的检查点不能作为空任务恢复', (t) => {
  const { root, store } = fixture(t);
  assert.throws(() => store.load({ runId: 'missing' }), { code: 'DIRECTOR_QUICK_NOT_FOUND' });
  store.save({ run: run() });
  const accountDir = fs.readdirSync(path.join(root, '导演工作台的项目', 'quick-generation'))[0];
  const file = path.join(root, '导演工作台的项目', 'quick-generation', accountDir, 'run-1.json');
  fs.writeFileSync(file, '{"id":');
  assert.throws(() => store.load({ runId: 'run-1' }), { code: 'DIRECTOR_QUICK_CORRUPT' });
  assert.throws(() => store.list(), { code: 'DIRECTOR_QUICK_CORRUPT' });
});

test('序列化前递归拒绝凭据字段，磁盘不会出现秘密', (t) => {
  const { root, store } = fixture(t);
  for (const field of ['apiKey', 'access_token', 'token', 'password', 'Authorization', 'clientSecret', 'refreshToken']) {
    assert.throws(() => store.save({ run: { ...run(), segmentDrafts: [{ nested: { [field]: 'must-not-be-written' } }] } }), { code: 'DIRECTOR_QUICK_CREDENTIAL_FIELD' });
  }
  assert.deepEqual(store.list(), []);
  assert.equal(fs.existsSync(path.join(root, '导演工作台的项目', 'quick-generation')), false);
  assert.doesNotThrow(() => store.save({ run: { ...run(), snapshot: { ...run().snapshot, profileId: 'api-1', profileHash: 'public-hash' } } }));
});

test('文件内身份不匹配、循环引用和非 JSON 值明确失败', (t) => {
  const { root, store } = fixture(t);
  const circular = run();
  circular.self = circular;
  assert.throws(() => store.save({ run: circular }), { code: 'DIRECTOR_QUICK_INVALID_RUN' });
  assert.throws(() => store.save({ run: { ...run(), revision: Number.NaN } }), { code: 'DIRECTOR_QUICK_INVALID_RUN' });
  store.save({ run: run() });
  const accountDir = fs.readdirSync(path.join(root, '导演工作台的项目', 'quick-generation'))[0];
  fs.writeFileSync(path.join(root, '导演工作台的项目', 'quick-generation', accountDir, 'run-1.json'), JSON.stringify(run('run-2')));
  assert.throws(() => store.load({ runId: 'run-1' }), { code: 'DIRECTOR_QUICK_CORRUPT' });
});

test('切换资料目录复制并验证全部账号检查点，保留旧目录且重复复制幂等', (t) => {
  const { root, store, setAccount } = fixture(t);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-quick-target-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  store.save({ run: run() });
  setAccount('account-b');
  store.save({ run: run('run-2', 'account-b') });
  const result = migrateDirectorQuickCheckpoints(root, target);
  assert.equal(result.copied, 2);
  assert.equal(result.unchanged, 0);
  assert.equal(createDirectorQuickCheckpoints(target, () => 'account-a').load({ runId: 'run-1' }).id, 'run-1');
  assert.equal(createDirectorQuickCheckpoints(target, () => 'account-b').load({ runId: 'run-2' }).id, 'run-2');
  assert.equal(store.load({ runId: 'run-2' }).id, 'run-2');
  const again = migrateDirectorQuickCheckpoints(root, target);
  assert.equal(again.copied, 0);
  assert.equal(again.unchanged, 2);
});

test('目标同名不同内容时迁移失败且不会覆盖目标任务', (t) => {
  const { root, store } = fixture(t);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-quick-conflict-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  store.save({ run: run() });
  const targetStore = createDirectorQuickCheckpoints(target, () => 'account-a');
  targetStore.save({ run: { ...run(), phase: 'completed' } });
  assert.throws(() => migrateDirectorQuickCheckpoints(root, target), { code: 'DIRECTOR_QUICK_MIGRATION_CONFLICT' });
  assert.equal(targetStore.load({ runId: 'run-1' }).phase, 'completed');
  assert.equal(store.load({ runId: 'run-1' }).phase, 'generating');
});

test('迁移拒绝源或目标目录中的符号链接和 junction，不跟随外部路径', (t) => {
  const { root, store } = fixture(t);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-quick-links-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-quick-outside-'));
  t.after(() => { fs.rmSync(target, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  store.save({ run: run() });
  const link = path.join(root, '导演工作台的项目', 'quick-generation', 'external');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => migrateDirectorQuickCheckpoints(root, target), { code: 'DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH' });
  fs.unlinkSync(link);
  const targetDirector = path.join(target, '导演工作台的项目');
  fs.symlinkSync(outside, targetDirector, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => migrateDirectorQuickCheckpoints(root, target), { code: 'DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH' });
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('目标落入来源检查点树时拒绝迁移，空来源迁移不创建文件', (t) => {
  const { root, store } = fixture(t);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-quick-empty-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  assert.equal(migrateDirectorQuickCheckpoints(root, target).copied, 0);
  assert.equal(fs.existsSync(path.join(target, '导演工作台的项目')), false);
  store.save({ run: run() });
  const nested = path.join(root, '导演工作台的项目', 'quick-generation', 'inside');
  assert.throws(() => migrateDirectorQuickCheckpoints(root, nested), { code: 'DIRECTOR_QUICK_MIGRATION_UNSAFE_PATH' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorPersistence } from './directorPersistence.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('延迟旧保存时合并排队快照，flush 等待最新两份文件落盘', async () => {
  const oldWrite = deferred();
  const newestProjects = deferred();
  const writes = [];
  const writer = createDirectorPersistence({
    saveState: async (state) => { writes.push(['state', state.id]); if (state.id === 1) await oldWrite.promise; },
    saveDirectorProjects: async (projects) => { writes.push(['projects', projects[0].id]); if (projects[0].id === 3) await newestProjects.promise; },
  });
  writer.enqueue({ id: 1, directorProjects: [{ id: 1 }] });
  await new Promise((resolve) => setImmediate(resolve));
  writer.enqueue({ id: 2, directorProjects: [{ id: 2 }] });
  writer.enqueue({ id: 3, directorProjects: [{ id: 3 }] });
  let flushed = false;
  const flushing = writer.flush().then(() => { flushed = true; });
  oldWrite.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flushed, false);
  assert.deepEqual(writes, [['state', 1], ['projects', 1], ['state', 3], ['projects', 3]]);
  newestProjects.resolve();
  await flushing;
  assert.equal(flushed, true);
});

test('两份文件失败都由 flush 报告，enqueue 不产生未处理 rejection', async () => {
  for (const failing of ['state', 'projects']) {
    let shouldFail = true;
    const writer = createDirectorPersistence({
      saveState: async () => { if (shouldFail && failing === 'state') throw new Error('state failed'); },
      saveDirectorProjects: async () => { if (shouldFail && failing === 'projects') return { ok: false, error: 'projects failed' }; },
    });
    assert.equal(writer.enqueue({ directorProjects: [] }), undefined);
    await assert.rejects(writer.flush(), new RegExp(`${failing} failed`));
    shouldFail = false;
    writer.enqueue({ directorProjects: [] });
    await assert.doesNotReject(writer.flush());
  }
});

test('flush 包括等待期间 enqueue 的新快照，严格禁止旧写覆盖新写', async () => {
  const first = deferred();
  const writes = [];
  const writer = createDirectorPersistence({
    saveState: async (state) => { writes.push(state.id); if (state.id === 1) await first.promise; },
    saveDirectorProjects: async () => {},
  });
  writer.enqueue({ id: 1 });
  const flushing = writer.flush();
  writer.enqueue({ id: 2 });
  first.resolve();
  await flushing;
  assert.deepEqual(writes, [1, 2]);
});

test('dispose 禁止新写但保留已有队列和可等待的 flush', async () => {
  const write = deferred();
  const writes = [];
  const writer = createDirectorPersistence({
    saveState: async (state) => { writes.push(state.id); await write.promise; },
    saveDirectorProjects: async () => {},
  });
  writer.enqueue({ id: 1 });
  writer.dispose();
  assert.throws(() => writer.enqueue({ id: 2 }), /已停止/);
  write.resolve();
  await writer.flush();
  assert.deepEqual(writes, [1]);
});

test('空队列 flush 不触发写入，并发 flush 都等待同一提交结果', async () => {
  let writes = 0;
  const writer = createDirectorPersistence({ saveState: async () => { writes += 1; }, saveDirectorProjects: async () => {} });
  await writer.flush();
  assert.equal(writes, 0);
  writer.enqueue({ directorProjects: [] });
  await Promise.all([writer.flush(), writer.flush()]);
  assert.equal(writes, 1);
});

test('最后写入结束到队列清理之间 enqueue 的快照仍会自动保存', async () => {
  const projects = deferred();
  const writes = [];
  const writer = createDirectorPersistence({
    saveState: async (state) => { writes.push(state.id); },
    saveDirectorProjects: (items) => items[0]?.id === 1 ? projects.promise : Promise.resolve(),
  });
  writer.enqueue({ id: 1, directorProjects: [{ id: 1 }] });
  await new Promise((resolve) => setImmediate(resolve));
  projects.promise.then(() => writer.enqueue({ id: 2, directorProjects: [{ id: 2 }] }));
  projects.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [1, 2]);
  await writer.flush();
});

test('目录切换屏障等待已有保存，挂起期间不写入，恢复采用新合并快照', async () => {
  const first = deferred();
  const writes = [];
  const writer = createDirectorPersistence({
    saveState: async (state) => { writes.push(['state', state.id]); if (state.id === 1) await first.promise; },
    saveDirectorProjects: async (projects) => { writes.push(['projects', projects[0].id]); },
  });
  writer.enqueue({ id: 1, directorProjects: [{ id: 1 }] });
  writer.enqueue({ id: 2, directorProjects: [{ id: 2 }] });
  let suspended = false;
  const barrier = writer.suspendAfterFlush().then(() => { suspended = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(suspended, false);
  first.resolve();
  await barrier;
  assert.deepEqual(writes, [['state', 1], ['projects', 1], ['state', 2], ['projects', 2]]);
  writer.enqueue({ id: 3, directorProjects: [{ id: 3 }] });
  writer.enqueue({ id: 4, directorProjects: [{ id: 4 }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 4);
  await assert.rejects(writer.flush(), { code: 'DIRECTOR_PERSISTENCE_SUSPENDED' });
  writer.resume({ id: 5, directorProjects: [{ id: 5 }] });
  await writer.flush();
  assert.deepEqual(writes, [['state', 1], ['projects', 1], ['state', 2], ['projects', 2], ['state', 5], ['projects', 5]]);
});

test('不指定恢复快照时只写挂起期间最后一次 enqueue，并允许重复挂起', async () => {
  const writes = [];
  const writer = createDirectorPersistence({ saveState: async (state) => writes.push(state.id), saveDirectorProjects: async () => {} });
  await writer.suspendAfterFlush();
  await writer.suspendAfterFlush();
  writer.enqueue({ id: 1 });
  writer.enqueue({ id: 2 });
  writer.resume();
  await writer.flush();
  assert.deepEqual(writes, [2]);
  writer.dispose();
  assert.throws(() => writer.resume({ id: 3 }), /已停止/);
});

test('flush 结束到挂起 continuation 之间启动的写入必须完整结束后才通过屏障', async () => {
  const first = deferred();
  const second = deferred();
  const writes = [];
  const writer = createDirectorPersistence({
    saveState: async (state) => { writes.push(['state', state.id]); await (state.id === 1 ? first.promise : second.promise); },
    saveDirectorProjects: async (projects) => { writes.push(['projects', projects[0].id]); },
  });
  writer.enqueue({ id: 1, directorProjects: [{ id: 1 }] });
  const beforeBarrier = writer.flush();
  let suspended = false;
  const barrier = writer.suspendAfterFlush().then(() => { suspended = true; });
  beforeBarrier.then(() => writer.enqueue({ id: 2, directorProjects: [{ id: 2 }] }));
  first.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(suspended, false);
  assert.deepEqual(writes, [['state', 1], ['projects', 1], ['state', 2]]);
  second.resolve();
  await barrier;
  assert.deepEqual(writes, [['state', 1], ['projects', 1], ['state', 2], ['projects', 2]]);
});

test('挂起边界新增保存失败时解除挂起，后续 enqueue 仍能自动保存', async () => {
  const first = deferred();
  const second = deferred();
  const boundaryError = new Error('boundary write failed');
  const writes = [];
  const writer = createDirectorPersistence({
    saveState: async (state) => {
      writes.push(['state', state.id]);
      if (state.id === 1) await first.promise;
      if (state.id === 2) { await second.promise; throw boundaryError; }
    },
    saveDirectorProjects: async (projects) => { writes.push(['projects', projects[0].id]); },
  });
  writer.enqueue({ id: 1, directorProjects: [{ id: 1 }] });
  const beforeBarrier = writer.flush();
  const barrier = writer.suspendAfterFlush();
  beforeBarrier.then(() => writer.enqueue({ id: 2, directorProjects: [{ id: 2 }] }));
  first.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  second.resolve();
  await assert.rejects(barrier, (error) => error === boundaryError);
  writer.enqueue({ id: 3, directorProjects: [{ id: 3 }] });
  await writer.flush();
  assert.deepEqual(writes, [['state', 1], ['projects', 1], ['state', 2], ['state', 3], ['projects', 3]]);
});

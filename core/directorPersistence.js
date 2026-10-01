/**
 * Both existing state files use this writer. A running snapshot finishes before
 * the most recent pending immutable React state is saved, so an old debounce
 * cannot finish after a confirmed generation commit.
 */
export function createDirectorPersistence({ saveState, saveDirectorProjects }) {
  if (typeof saveState !== 'function' || typeof saveDirectorProjects !== 'function') {
    throw new TypeError('导演资料保存需要两份本地文件的保存函数。');
  }
  let pending = null;
  let worker = null;
  let revision = 0;
  let lastOutcome = null;
  let disposed = false;
  let suspended = false;

  function assertSaved(result, label) {
    if (result === false || (result && typeof result === 'object' && result.ok === false)) {
      throw new Error(typeof result?.error === 'string' ? result.error : `${label}保存失败。`);
    }
  }

  async function drain() {
    while (pending && !suspended) {
      const next = pending;
      pending = null;
      try {
        assertSaved(await saveState(next.state), '本地资料');
        assertSaved(await saveDirectorProjects(next.state.directorProjects || []), '导演项目');
        lastOutcome = { revision: next.revision, error: null };
      } catch (error) {
        lastOutcome = { revision: next.revision, error: error instanceof Error ? error : new Error('导演资料保存失败。') };
      }
    }
  }

  function start() {
    if (!worker && pending && !suspended) {
      // drain catches storage failures: enqueue is safe from a debounce/effect
      // without the caller having to handle a promise rejection.
      worker = drain().finally(() => {
        worker = null;
        // An enqueue can arrive after drain's final loop condition but before
        // this microtask runs. Start that snapshot without requiring flush.
        start();
      });
    }
  }

  function queueSnapshot(state) {
    if (disposed) throw new Error('导演资料保存器已停止。');
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('导演资料快照无效。');
    pending = { state, revision: ++revision };
  }

  async function flush() {
    if (suspended) throw Object.assign(new Error('资料目录正在切换，保存器暂时挂起，请切换完成后再保存。'), { code: 'DIRECTOR_PERSISTENCE_SUSPENDED' });
    start();
    while (worker || pending) {
      if (suspended) throw Object.assign(new Error('资料目录正在切换，保存器暂时挂起，请切换完成后再保存。'), { code: 'DIRECTOR_PERSISTENCE_SUSPENDED' });
      if (worker) await worker;
      start();
    }
    if (lastOutcome?.error) throw lastOutcome.error;
  }

  return {
    enqueue(state) {
      queueSnapshot(state);
      start();
    },
    flush,
    async suspendAfterFlush() {
      if (suspended) return;
      await flush();
      suspended = true;
      // An enqueue may have started between flush resolving and this
      // continuation. Finish that active pair before the directory can change.
      try {
        if (worker) await worker;
        if (lastOutcome?.error) throw lastOutcome.error;
      } catch (error) {
        // The caller never acquired the barrier, so normal saving must remain
        // available after the directory switch is aborted.
        suspended = false;
        start();
        throw error;
      }
    },
    resume(state) {
      if (disposed) throw new Error('导演资料保存器已停止。');
      if (state !== undefined) queueSnapshot(state);
      suspended = false;
      start();
    },
    dispose() {
      disposed = true;
    },
  };
}

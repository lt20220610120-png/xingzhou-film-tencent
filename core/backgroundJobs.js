// Renderer-wide job state outlives individual pages/episodes. No API credentials
// or generated text are kept here; completed outputs belong to the project store.
export function createBackgroundJobs() {
  const jobs = new Map(), listeners = new Set();
  let version = 0;
  const emit = () => { version++; for (const listener of listeners) listener(); };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => version,
    get: key => jobs.get(key),
    entries: () => [...jobs.entries()],
    start(key, metadata = {}) {
      if (jobs.get(key)?.status === 'running') return false;
      // Only completed status records expire; never discard active work.
      for (const [id, job] of jobs) if (job.status !== 'running' && Date.now()-job.updatedAt>86400000) jobs.delete(id);
      jobs.set(key, {...metadata,status:'running',error:'',startedAt:Date.now(),updatedAt:Date.now()}); emit(); return true;
    },
    finish(key, error = '') {
      const job=jobs.get(key); if (!job) return;
      jobs.set(key, {...job,status:error?'failed':'completed',error,updatedAt:Date.now()}); emit();
    },
  };
}
export const directorJobs = createBackgroundJobs();

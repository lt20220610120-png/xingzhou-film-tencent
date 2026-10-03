const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the component's actual cloud loader and polling effect with controlled
// timers and responses, including a timer callback already queued at navigation.
const source = fs.readFileSync(path.join(__dirname, '../src/v06/DirectorWorkspace.jsx'), 'utf8');
const loaderStart = source.indexOf('  const loadCloudProjects = useCallback');
const loaderEnd = source.indexOf('  }, [api]);', loaderStart) + '  }, [api]);'.length;
const effectStart = source.indexOf('  React.useEffect(() => {', loaderEnd);
const effectEnd = source.indexOf('  }, [active, loadCloudProjects]);', effectStart) + '  }, [active, loadCloudProjects]);'.length;
assert.ok(loaderStart >= 0 && loaderEnd > loaderStart && effectEnd > effectStart);
const cloudCode = source.slice(loaderStart, loaderEnd) + '\n' + source.slice(effectStart, effectEnd);
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(api) {
  const timers = new Map(), calls = [], state = { cloud: [], collaboration: [], producer: false };
  let cleanup, nextTimer = 0;
  const context = vm.createContext({
    api,
    active: false,
    cloudActiveRef: { current: false },
    cloudRequestRef: { current: 0 },
    useCallback: fn => fn,
    React: { useEffect: fn => { cleanup = fn(); } },
    setInterval: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearInterval: id => timers.delete(id),
    setCloudProjects: rows => { state.cloud = rows; calls.push('cloud'); },
    setCollaborationProjects: rows => { state.collaboration = rows; calls.push('collaboration'); },
    setIsProducer: value => { state.producer = value; calls.push('producer'); },
  });
  const render = active => {
    cleanup?.(); cleanup = undefined;
    context.active = active; context.cloudActiveRef.current = active;
    vm.runInContext(`(() => { ${cloudCode} })()`, context);
  };
  return { render, timers, calls, state, queuedTick: () => [...timers.values()][0]?.fn };
}

test('a preserved inactive director view starts no cloud reads or timers', async () => {
  let reads = 0;
  const h = harness({
    directorCollabListProjects: async () => { reads++; return []; },
    collabListProjects: async () => { reads++; return []; },
    collabIsProducer: async () => { reads++; return false; },
  });
  h.render(false); await flush();
  assert.equal(reads, 0); assert.equal(h.timers.size, 0); assert.equal(h.calls.length, 0);
});

test('director activation reads immediately and polls; hiding clears and gates queued ticks', async () => {
  let reads = 0;
  const h = harness({
    directorCollabListProjects: async () => { reads++; return [{ id: 'director' }]; },
    collabListProjects: async () => { reads++; return [{ id: 'deleted', deleted_at: 'now' }, { id: 'linked' }]; },
    collabIsProducer: async () => { reads++; return true; },
  });
  h.render(true); await flush();
  assert.equal(reads, 3); assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 12000);
  assert.equal(h.state.collaboration.length, 1); assert.equal(h.state.collaboration[0].id, 'linked');
  const queuedTick = h.queuedTick(); await queuedTick();
  assert.equal(reads, 6);
  h.render(false); await queuedTick(); await flush();
  assert.equal(reads, 6); assert.equal(h.timers.size, 0);
  h.render(true); await flush(); assert.equal(reads, 9); assert.equal(h.timers.size, 1);
  h.render(false);
});

test('a cloud response from before hiding cannot replace the newly active view', async () => {
  let finishOld, requested = 0;
  const h = harness({
    directorCollabListProjects: () => ++requested === 1
      ? new Promise(resolve => { finishOld = resolve; })
      : Promise.resolve([{ id: 'current' }]),
    collabListProjects: async () => [],
    collabIsProducer: async () => false,
  });
  h.render(true); h.render(false);
  assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
  h.render(true); await flush();
  assert.equal(h.state.cloud[0].id, 'current');
  const count = h.calls.length;
  finishOld([{ id: 'stale' }]); await flush();
  assert.equal(h.state.cloud[0].id, 'current'); assert.equal(h.calls.length, count);
  h.render(false);
});

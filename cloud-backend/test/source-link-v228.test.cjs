const test = require('node:test');
const assert = require('node:assert/strict');
const {createRepository} = require('../src/postgres-repository.cjs');
const {extendRepository} = require('../src/repository-extras.cjs');

// SQL-boundary interleavings, not a substitute for a real PostgreSQL race test.
function sourcePool(mode = 'live', target = {}) {
  let live = true, authorized = true, sourceLocked = false;
  const queries = [];
  const source = {id:'source', owner_id:'owner', genre:'[DIRECTOR_PROJECT]', analysis_output:'local-source'};
  const copy = {id:'copy', owner_id:'owner', genre:'[COLLAB_PROJECT]', episodes:[{title:'第19集', content:'19-1 家 日 内'}], ...target};
  const query = async (sql, values = []) => {
    queries.push({sql, values});
    if (/^select .*from collab_projects/i.test(sql)) {
      if (/for update/i.test(sql) && values[0] === 'source') {
        sourceLocked = true;
        if (mode === 'deleted') live = false;
        if (mode === 'revoked') authorized = false;
        if (mode === 'recycled') source.genre += '\n[RECYCLE_UNTIL:2099-01-01]';
        return {rows:live ? [{...source}] : []};
      }
      if (/analysis_output=\$1/.test(sql)) {
        const found = live && authorized && ['local-source','source'].includes(values[0]);
        return {rows:found ? [{...source}] : []};
      }
      if (values[0] === 'copy') return {rows:[{...copy}]};
      return {rows:live && values[0] === 'source' ? [{...source}] : []};
    }
    if (/^insert into collab_projects/i.test(sql)) return {rows:[{id:'new-copy', genre:values[4], director_project_id:values[7]}]};
    if (/^update collab_projects/i.test(sql)) return {rows:[{...copy}]};
    if (/^select 1 as ok from collab_members/i.test(sql)) return {rows:authorized ? [{ok:1}] : []};
    return {rows:[]};
  };
  return {query, connect:async () => ({query, release(){queries.push({sql:'RELEASE', values:[]});}}), queries, sourceLocked:() => sourceLocked};
}
function assertLockedBeforeWrite(pool) {
  const lock = pool.queries.findIndex(q => /for update/i.test(q.sql) && q.values[0] === 'source');
  const auth = pool.queries.findIndex((q, i) => i > lock && /analysis_output=\$1/.test(q.sql));
  const write = pool.queries.findIndex(q => /^insert into collab_projects|^update collab_projects/i.test(q.sql));
  assert.ok(lock >= 0, 'source row must be locked');
  assert.ok(auth > lock && write > auth, 'new statement must validate live source and authorization after locking');
  assert.equal(pool.queries.at(-2).sql, 'COMMIT');
}

test('restore cannot reactivate a missing or unauthorized source in either legacy marker or column', async () => {
  for (const reference of [{director_project_id:'source'}, {genre:'[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]\n[RECYCLE_UNTIL:2099-01-01]'}, {director_project_id:'source', genre:'[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]'}]) {
    for (const mode of ['deleted','revoked','recycled']) {
      const pool = sourcePool(mode, {...reference, deleted_at:'2026-01-01', purge_after:'2099-01-01'});
      assert.equal(await extendRepository(pool).restoreProject('copy', 'owner'), null, mode);
      assert.equal(pool.queries.some(q => /^update /i.test(q.sql)), false);
      assert.equal(pool.queries.at(-2).sql, 'ROLLBACK');
    }
    const pool = sourcePool('live', {...reference, deleted_at:'2026-01-01', purge_after:'2099-01-01'});
    assert.ok(await extendRepository(pool).restoreProject('copy', 'owner'));
    assertLockedBeforeWrite(pool);
  }
  const unlinked = sourcePool('deleted', {deleted_at:'2026-01-01', purge_after:'2099-01-01'});
  assert.ok(await extendRepository(unlinked).restoreProject('copy', 'owner'));
  assert.equal(unlinked.sourceLocked(), false);
  for (const row of [{purge_after:'2000-01-01'}, {genre:'[COLLAB_PROJECT]\n[RECYCLE_UNTIL:2000-01-01]'}]) {
    const pool = sourcePool('live', row);
    assert.equal(await extendRepository(pool).restoreProject('copy', 'owner'), null);
    assert.equal(pool.queries.some(q => /^update /i.test(q.sql)), false);
  }
});

test('lock toggles read the destination under a row lock so a stale genre cannot resurrect an old source marker', async () => {
  const pool = sourcePool('live', {genre:'[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]'});
  assert.ok(await extendRepository(pool).setProjectLocked('copy', true, 'owner'));
  const reads = pool.queries.filter(q => /^select .*from collab_projects/i.test(q.sql));
  assert.match(reads[0].sql, /for update/i);
  assert.equal(pool.queries.at(-2).sql, 'COMMIT');
  for (const row of [{deleted_at:'2026-01-01'}, {genre:'[COLLAB_PROJECT]\n[RECYCLE_UNTIL:2099-01-01]'}]) {
    const blocked = sourcePool('live', row);
    assert.equal(await extendRepository(blocked).setProjectLocked('copy', false, 'owner'), null);
    assert.equal(blocked.queries.some(q => /^update /i.test(q.sql)), false);
  }
});

test('legacy domain promotion cannot silently establish an unguarded live source reference', async () => {
  const operations = [
    repo => repo.appendArtEpisode('copy', {episodeNumber:20, content:'20-1 家 日 内'}, 'owner'),
    repo => repo.publishAnalysis('copy', {episodeNumber:19, sourceContent:'19-1 家 日 内', output:'### 第19集\n人物：\n- 无\n场景：\n- 无\n道具：\n- 无', assets:[], fingerprint:'f'}, 'owner'),
    repo => repo.syncDirectorSnapshot('copy', {episodes:[]}, 'owner'),
    repo => repo.updateProjectFields('copy', {genre:'都市'}, 'owner'),
  ];
  for (const invoke of operations) {
    for (const mode of ['deleted','revoked','recycled']) {
      const pool = sourcePool(mode, {genre:'都市\n[COLLAB_SOURCE:local-source]'});
      assert.equal(await invoke(extendRepository(pool)), null, mode);
      assert.equal(pool.queries.some(q => /^update |^insert /i.test(q.sql)), false);
    }
    const pool = sourcePool('live', {genre:'都市\n[COLLAB_SOURCE:local-source]'});
    assert.ok(await invoke(extendRepository(pool)));
    assertLockedBeforeWrite(pool);
  }
});

test('link shares the source deletion lock and rechecks access before changing either reference', async () => {
  for (const mode of ['deleted','revoked','recycled']) {
    const pool = sourcePool(mode);
    assert.equal(await extendRepository(pool).linkDirectorProject('copy', 'local-source', 'owner'), null, mode);
    assert.equal(pool.queries.some(q => /^update /i.test(q.sql)), false);
    assert.equal(pool.queries.at(-2).sql, 'ROLLBACK');
  }
  const pool = sourcePool();
  assert.ok(await extendRepository(pool).linkDirectorProject('copy', 'source', 'owner'));
  assertLockedBeforeWrite(pool);
});

test('create locks its source through commit and refuses deletion/revocation observed after lock wait', async () => {
  for (const mode of ['deleted','revoked','recycled']) {
    const pool = sourcePool(mode);
    await assert.rejects(createRepository('', {pool}).createProject({ownerId:'owner', directorProjectId:'local-source'}), e => e.status === 403, mode);
    assert.equal(pool.queries.some(q => /^insert /i.test(q.sql)), false, mode);
    assert.equal(pool.queries.at(-2).sql, 'ROLLBACK');
  }
  for (const directorProjectId of ['source','local-source']) {
    const pool = sourcePool();
    assert.ok(await createRepository('', {pool}).createProject({ownerId:'owner', directorProjectId}));
    assertLockedBeforeWrite(pool);
  }
});
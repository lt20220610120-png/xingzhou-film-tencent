const directorRow = row => Boolean(row && String(row.genre||'').includes('[DIRECTOR_PROJECT]')
  && !String(row.genre||'').includes('[COLLAB_PROJECT]') && !row.deleted_at
  && !String(row.genre||'').includes('[RECYCLE_UNTIL:'));

async function readableDirector(query, source, uid) {
  if (typeof source !== 'string' || !source || source.length > 500 || /[\[\]\r\n]/.test(source) || !uid) return null;
  const rows = (await query(`select p.* from collab_projects p where (p.id::text=$1 or p.analysis_output=$1)
    and p.genre like '%[DIRECTOR_PROJECT]%' and p.deleted_at is null
    and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2))`, [source, uid])).rows;
  const directors = rows.filter(directorRow);
  return directors.length === 1 ? directors[0] : null;
}

// Call only inside the transaction that establishes the live reference. Deletion
// locks this same source row before checking links. Re-read in a NEW statement
// after a lock wait: the earlier snapshot may predate deletion or role revocation.
async function lockReadableDirector(client, source, uid) {
  const query = client.query.bind(client);
  const candidate = await readableDirector(query, source, uid);
  if (!candidate) return null;
  await client.query("set local lock_timeout='3s'");
  const locked = (await client.query('select p.* from collab_projects p where p.id=$1 for update', [candidate.id])).rows[0];
  if (!directorRow(locked)) return null;
  const current = await readableDirector(query, source, uid);
  return current?.id === locked.id ? current : null;
}

async function lockDirectorReferences(client, row, uid) {
  const sources = [...new Set([row.director_project_id, ...[...String(row.genre||'').matchAll(/\[COLLAB_SOURCE:([^\]]+)\]/g)].map(m=>m[1])].filter(Boolean))];
  if (!sources.length) return true;
  const director = await lockReadableDirector(client, sources[0], uid);
  if (!director) return false;
  // Historical column and marker can use different aliases, but must resolve to
  // the SAME locked row. Never acquire multiple source locks in alias order.
  for (const source of sources.slice(1)) {
    const other = await readableDirector(client.query.bind(client), source, uid);
    if (other?.id !== director.id) return false;
  }
  return true;
}

module.exports = {directorRow, readableDirector, lockReadableDirector, lockDirectorReferences};
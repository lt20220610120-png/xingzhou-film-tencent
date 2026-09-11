// Run explicitly against PostgreSQL. All data lives in transaction-local temporary tables.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { createRepository } = require('../src/postgres-repository.cjs');
const { handleAction } = require('../src/collab.cjs');
const { randomUUID } = require('node:crypto');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`create temp table collab_projects (id uuid primary key, name text, owner_id uuid, genre text default '', deleted_at timestamptz) on commit drop;
      create temp table collab_assets (id uuid primary key, project_id uuid, name text, description text, image_url text, updated_at timestamptz) on commit drop;
      create temp table collab_members (project_id uuid, user_id uuid, role text) on commit drop;`);
    const owner = randomUUID(), artist = randomUUID(), pid = randomUUID(), otherPid = randomUUID(), aid = randomUUID();
    await client.query('insert into collab_projects(id,name,owner_id) values($1,$2,$3),($4,$5,$3)', [pid, '测试项目', owner, otherPid, '另一项目']);
    await client.query('insert into collab_assets(id,project_id,name,description) values($1,$2,$3,$4)', [aid,pid,'门厅','旧描述']);
    await client.query('insert into collab_members values($1,$2,$3)', [pid,artist,'artist']);
    const repo = createRepository('', { pool: client });
    for (const uid of [owner,artist]) {
      const result = await handleAction('asset-update', {projectId:pid,assetId:aid,updates:{description:'手动与 AI 保存后的文字'}}, {id:uid}, repo);
      assert.equal(result.status,200);assert.equal(result.body.description,'手动与 AI 保存后的文字');assert.equal(result.body.name,'门厅');
    }
    assert.equal(await repo.updateAsset(aid,{description:'跨项目'},owner,otherPid),null);
    await client.query("update collab_projects set genre='[PROJECT_LOCKED]' where id=$1",[pid]);
    assert.equal(await repo.updateAsset(aid,{description:'锁定后修改'},owner,pid),null);
    console.log('POSTGRES_ASSET_SAVE_OK: owner, artist, project isolation, lock, nested updates');
  } finally { await client.query('rollback'); await client.end(); }
})().catch(error => { console.error('POSTGRES_ASSET_SAVE_FAILED',error.code || error.name,error.message);process.exitCode=1; });

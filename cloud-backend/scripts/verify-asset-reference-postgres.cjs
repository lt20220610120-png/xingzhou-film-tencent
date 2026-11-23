// This test requires a temporary PostgreSQL cluster created by pg_virtualenv.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {Pool} = require('pg');
const {createRepository} = require('../src/postgres-repository.cjs');
const {handleAction} = require('../src/collab.cjs');

async function run() {
  assert.match(process.env.PGPORT || '', /^\d+$/);
  assert.notEqual(process.env.PGPORT, '5432');
  assert.match(process.env.PG_CLUSTER_CONF_ROOT || '', /[\\/]pg_virtualenv\./, 'Use a throwaway pg_virtualenv cluster');
  const pool = new Pool();
  const repo = createRepository('', {pool});
  try {
    const schema = await fs.readFile(path.join(__dirname,'../schema.sql'),'utf8');
    await pool.query(schema.replace(/  no_reference_image boolean not null default false,\r?\n/i,''));
    const owner = {id:randomUUID(), username:'owner_fixture'}, artist = {id:randomUUID()}, viewer = {id:randomUUID()};
    const projectId = randomUUID(), foreign = randomUUID(), empty = randomUUID(), drawn = randomUUID(), external = randomUUID();
    await pool.query('insert into collab_projects(id,name,owner_id) values($1,$3,$4),($2,$3,$4)',[projectId,foreign,'隔离项目',owner.id]);
    await pool.query("insert into collab_members(project_id,user_id,username,role) values($1,$2,'artist_fixture','artist'),($1,$3,'viewer_fixture','collaborator')",[projectId,artist.id,viewer.id]);
    const existingImage = `projects/${projectId}/image/original.png`;
    await pool.query(`insert into collab_assets(id,project_id,category,name,image_url) values
      ($1,$4,'character','张三（便装）',''),($2,$4,'character','张三（制服）',$6),($3,$5,'prop','别的项目','')`,[empty,drawn,external,projectId,foreign,existingImage]);
    const migration = await fs.readFile(path.join(__dirname,'../migrations/20261123-asset-reference-image-preference.sql'),'utf8');
    await pool.query(migration);
    await pool.query(migration);
    const call = (action, values, user = artist) => handleAction(action,{projectId,...values},user,repo);
    assert.equal((await call('assets-list',{},viewer)).body.find(row=>row.id===empty).noReferenceImage,false);
    const mark = (assetIds, noReferenceImage, user) => call('asset-reference-image-preference',{assetIds,noReferenceImage},user);
    assert.equal((await mark([empty],true,viewer)).status,403);
    assert.deepEqual((await mark([drawn,empty,external],true)).body,{updatedIds:[empty],skippedIds:[drawn,external]});
    assert.equal((await call('assets-list',{},viewer)).body.find(row=>row.id===empty).noReferenceImage,true);
    assert.equal((await repo.listAssets(projectId,owner.id)).find(row=>row.id===drawn).image_url,existingImage);
    await mark([empty], false);
    assert.equal((await call('assets-list',{},viewer)).body.find(row=>row.id===empty).noReferenceImage,false);
    await mark([empty], true);
    const objectPath = `projects/${projectId}/image/new.png`;
    await Promise.all([mark([empty],true), call('asset-image-record',{assetId:empty,objectPath})]);
    const adopted = (await repo.listAssets(projectId,owner.id)).find(row=>row.id===empty);
    assert.equal(adopted.no_reference_image,false);
    assert.equal(adopted.image_url,objectPath);
    assert.equal((await repo.listAssets(foreign,owner.id))[0].no_reference_image,false);

    const localId = randomUUID(), invitee = randomUUID(), requestId = randomUUID(), localAsset = randomUUID(), localDrawn = randomUUID(), imageId = randomUUID();
    await pool.query("insert into app_users(id,username,email,password_hash,roles) values($1,'invitee_fixture','invitee@example.test','synthetic',array['director'])",[invitee]);
    const draft = {projectId:localId,requestId,invitation:{username:'invitee_fixture',role:'collaborator'}};
    const {revision} = await repo.prepareLocalProjectShare(draft,owner);
    const sharedObject = `projects/${localId}/image/shared.png`;
    await repo.shareLocalProject({...draft,revision,project:{id:localId,name:'本机项目',episodes:[]},assets:[
      {id:localAsset,category:'prop',name:'无需参考图',noReferenceImage:true},
      {id:localDrawn,category:'prop',name:'自动采用',noReferenceImage:true,adoptedImageId:imageId,image_url:sharedObject},
    ],media:[{id:imageId,assetId:localDrawn,kind:'asset-image',objectKey:sharedObject,filename:'shared.png',mime:'image/png'}]},owner);
    const reopened = await handleAction('assets-list',{projectId:localId},{id:invitee},repo);
    assert.equal(reopened.body.find(row=>row.id===localAsset).noReferenceImage,true);
    assert.equal(reopened.body.find(row=>row.id===localDrawn).noReferenceImage,false);
    console.log(JSON.stringify({existingRows:'preserved',reappliedMigration:true,mixedSelection:true,roleIsolation:true,concurrentAdoption:true,sharedSnapshot:true,otherAccountRead:true}));
  } finally { await pool.end(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

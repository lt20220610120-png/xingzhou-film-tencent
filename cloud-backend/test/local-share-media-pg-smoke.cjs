// Run with pg_virtualenv against an empty throwaway cluster. All HTTP traffic stays on loopback.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {Pool} = require('pg');
const {createRepository} = require('../src/postgres-repository.cjs');
const {createServer} = require('../src/server.cjs');
const {createCosSigner} = require('../src/cos.cjs');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

async function close(server) {
  if (!server?.listening) return;
  const closing = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await closing;
}

async function mockObjectStore() {
  const uploads = new Map();
  const downloads = new Map();
  const objects = new Map();
  const signer = createCosSigner({secretId:'isolated',secretKey:'isolated',bucket:'isolated',region:'isolated'});
  const server = http.createServer(async (request, response) => {
    const [pathname, signature] = request.url.split('?');
    const objectKey = pathname.slice(1);
    if (request.method === 'PUT' && uploads.get(objectKey) === request.headers.authorization && uploads.has(objectKey)) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(objectKey, Buffer.concat(chunks));
      response.writeHead(200).end();
    } else if (request.method === 'GET' && signature && downloads.get(objectKey) === signature && objects.has(objectKey)) {
      response.writeHead(200).end(objects.get(objectKey));
    } else {
      response.writeHead(403).end();
    }
  });
  const origin = await listen(server);
  return {
    server,
    signer: {
      ...signer,
      signUpload(input) {
        const signed = signer.signUpload(input);
        uploads.set(input.objectKey, signed.authorization);
        return {...signed, url: origin + '/' + input.objectKey};
      },
      signDownload(input) {
        const signed = signer.signDownload(input);
        downloads.set(input.objectKey, signed.authorization);
        return {...signed, url: origin + '/' + input.objectKey + '?' + signed.authorization};
      },
    },
  };
}

async function seedAccount(pool, repository, username, admin = false) {
  const id = randomUUID();
  await pool.query("insert into app_users(id,username,email,password_hash,roles,is_admin,is_producer) values($1,$2,$3,'fixture',array['director']::text[],$4,$4)",
    [id,username,username+'@example.invalid',admin]);
  await pool.query("insert into software_license_exemptions(user_id,reason) values($1,'isolated fixture')",[id]);
  const session = await repository.createSession(id, randomUUID());
  assert.ok(session, 'fixture session persisted');
  return {id, username, session};
}

function fixture(projectId, localDirector = '') {
  return {
    project: {id:projectId,name:'隔离共享项目',script:'第1集\n1-1 室内',director_project_id:localDirector,
      episodes:[{id:'ep1',title:'第1集',episodeNumber:1,content:'1-1 室内',
        storyboardPrompts:[{id:'shot1',label:'1-1-1',content:'甲推门。'}]}]},
    assets: [],
    media: [],
  };
}

async function verify() {
  assert.match(process.env.PG_CLUSTER_CONF_ROOT || '', /[\u002f\\]pg_virtualenv\./, 'use a throwaway pg_virtualenv cluster');
  assert.match(process.env.PGPORT || '', /^\d+$/);
  assert.notEqual(process.env.PGPORT, '5432');
  // An explicit loopback endpoint keeps PGHOST, PGHOSTADDR and service aliases out of this run.
  const pool = new Pool({host:'127.0.0.1',port:Number(process.env.PGPORT),database:process.env.PGDATABASE || process.env.PGUSER});
  const repository = createRepository('', {pool});
  let storage, gateway;
  try {
    assert.equal((await pool.query("select to_regclass('public.app_users') as users")).rows[0].users, null,
      'smoke test requires an empty database');
    await pool.query(await fs.readFile(path.join(__dirname,'../schema.sql'),'utf8'));
    const owner = await seedAccount(pool,repository,'fixture_owner',true);
    const first = await seedAccount(pool,repository,'fixture_first');
    const second = await seedAccount(pool,repository,'fixture_second');
    const outsider = await seedAccount(pool,repository,'fixture_outside_admin',true);
    storage = await mockObjectStore();
    gateway = createServer({API_SECRET:'local-test',DATABASE_URL:'postgres://127.0.0.1/unused',COS_SMALL_MEDIA_RELAY:'0'},
      {repository,mailer:null,cosSigner:storage.signer,referenceStore:{async prune() {}},logger:{error(action,details){console.error(action,details);}}});
    const origin = await listen(gateway);

    async function action(user, name, payload, expected = 200) {
      const result = await fetch(origin+'/api/gateway',{method:'POST',redirect:'error',
        headers:{authorization:'Bearer '+user.session,'content-type':'application/json'},
        body:JSON.stringify({action:name,...payload})});
      const body = await result.json();
      const statuses = Array.isArray(expected) ? expected : [expected];
      assert.ok(statuses.includes(result.status), `${name} as ${user.username}: expected ${expected}, got ${result.status} ${body.error || ''}`);
      return body;
    }

    async function put(reference, localShareRequestId, projectId) {
      const {kind,filename,mime} = reference;
      const signed = await action(owner,'media-upload-url',{projectId,kind:kind==='asset-image'?'image':kind,filename,mime,localShareRequestId});
      assert.equal(signed.method,'PUT');
      assert.match(signed.objectKey,new RegExp('^projects/'+projectId+'/'));
      const result = await fetch(signed.url,{method:signed.method,redirect:'error',
        headers:{authorization:signed.authorization,'content-type':signed.contentType},body:'bytes in '+filename});
      assert.equal(result.status,200);
      return {...reference,objectKey:signed.objectKey};
    }

    async function checkHidden(projectId) {
      for (const user of [owner,first,second,outsider]) {
        assert.ok(!(await action(user,'project-list',{summary:true})).some(row=>row.id===projectId));
        await action(user,'project-get',{projectId},404);
        const association = {projectId:'isolated-no-director',collaborationProjectId:projectId};
        const directors = await action(user,'director-project-list',{associations:[association]});
        assert.deepEqual(directors.associations,[{...association,status:'released'}]);
      }
      for (const user of [owner,outsider]) {
        await action(user,'assets-list',{projectId},403);
        await action(user,'media-list',{projectId},403);
        await action(user,'members-list',{projectId},403);
        await action(user,'project-update',{projectId,name:'不会保存'},403);
        await action(user,'asset-create',{projectId,category:'character',name:'不会保存'},403);
        await action(user,'media-commit',{projectId,kind:'image',objectKey:`projects/${projectId}/image/fixture.png`},403);
        await action(user,'media-upload-url',{projectId,kind:'image',filename:'asset.png'},403);
        await action(user,'member-add',{projectId,username:second.username,role:'collaborator'},403);
        await action(user,'director-member-add',{directorProjectId:projectId,username:second.username,role:'collaborator'},403);
      }
    }

    const projectId = randomUUID();
    const a = {projectId,requestId:randomUUID(),invitation:{username:first.username,role:'artist'}};
    const localDirector = '1795323477214-fixture';
    const data = fixture(projectId,localDirector);
    const prepared = await action(owner,'project-local-share-prepare',a);
    assert.equal(prepared.pending,true);
    await checkHidden(projectId);
    const imageSpec = {id:randomUUID(),kind:'asset-image',assetId:randomUUID(),filename:'asset.png',mime:'image/png'};
    const firstUpload = await put(imageSpec,a.requestId,projectId);
    await action(owner,'media-commit',{projectId,kind:'image',assetId:imageSpec.assetId,objectKey:firstUpload.objectKey,localShareRequestId:a.requestId},403);
    await action(outsider,'media-upload-url',{projectId,kind:'image',filename:'asset.png',localShareRequestId:a.requestId},404);
    await action(first,'media-upload-url',{projectId,kind:'image',filename:'asset.png',localShareRequestId:a.requestId},404);
    await action(owner,'media-upload-url',{projectId,kind:'image',filename:'asset.png',localShareRequestId:randomUUID()},409);
    const resumed = await action(owner,'project-local-share-prepare',a);
    assert.equal(resumed.revision,prepared.revision);
    assert.equal(resumed.pending,true);

    // A resumed placeholder may change recipient and role before the final commit.
    const b = {projectId,requestId:randomUUID(),invitation:{username:second.username,role:'artist_collaborator'}};
    const replaced = await action(owner,'project-local-share-prepare',b);
    assert.equal(replaced.pending,true);
    assert.notEqual(replaced.revision,prepared.revision);
    await action(owner,'media-upload-url',{projectId,kind:'image',filename:'asset.png',localShareRequestId:a.requestId},409);
    await action(owner,'project-local-share',{...a,...data,revision:prepared.revision},409);
    await checkHidden(projectId);

    data.media = await Promise.all([
      imageSpec,
      {id:randomUUID(),kind:'audio',filename:'voice.wav',mime:'audio/wav'},
      {id:randomUUID(),kind:'image',filename:'reference.png',mime:'image/png',note:'参考素材 本机场景'},
      {id:randomUUID(),kind:'video',filename:'reference.mp4',mime:'video/mp4',note:'参考素材 本机视频'},
    ].map(reference=>put(reference,b.requestId,projectId)));
    const [assetImage,voice,reference,video] = data.media;
    data.assets = [{id:imageSpec.assetId,category:'character',name:'甲',episodes:[1],adoptedImageId:assetImage.id}];
    data.project.episodes[0].storyboardPrompts[0].generationConfig = {references:[reference,video]};
    data.project.analysis_progress = {_sharedVoiceProfiles:{role:{confirmed:voice}}};
    const pending = await pool.query('select (select count(*) from collab_members where project_id=$1)::int as members, (select count(*) from collab_media where project_id=$1)::int as media, (select count(*) from collab_assets where project_id=$1)::int as assets',[projectId]);
    assert.deepEqual(pending.rows[0],{members:1,media:0,assets:0});

    const committed = await action(owner,'project-local-share',{...b,...data,revision:replaced.revision});
    assert.equal(committed.member.user_id,second.id);
    assert.equal(committed.member.role,b.invitation.role);
    const receipt = await action(owner,'project-local-share-receipt',b);
    assert.equal(receipt.completed.member.id,committed.member.id);
    const replay = await action(owner,'project-local-share',{...b,...data,revision:replaced.revision});
    assert.equal(replay.member.id,committed.member.id);
    await action(first,'project-get',{projectId},404);
    assert.ok((await action(second,'project-list',{summary:true})).some(row=>row.id===projectId));
    const project = await action(second,'project-get',{projectId});
    assert.equal(project.director_project_id,localDirector);
    assert.equal(project.script,data.project.script);
    assert.deepEqual(project.episodes[0].storyboardPrompts[0].generationConfig.references,[reference,video]);
    assert.equal(project.analysis_progress._sharedVoiceProfiles.role.confirmed.objectKey,voice.objectKey);
    const assets = await action(second,'assets-list',{projectId});
    assert.equal(assets[0].adoptedImageId,assetImage.id);
    const media = await action(second,'media-list',{projectId});
    assert.equal(media.length,4);
    for (const item of data.media) {
      const downloaded = await action(second,'media-download-url',{mediaId:item.id});
      const result = await fetch(downloaded.url,{redirect:'error'});
      assert.equal(result.status,200);
      assert.equal(await result.text(),'bytes in '+item.filename);
    }
    await action(owner,'media-upload-url',{projectId,kind:'image',filename:'asset.png',localShareRequestId:b.requestId},[404,409]);
    await action(second,'media-upload-url',{projectId,kind:'image',filename:'asset.png'});
    await action(outsider,'media-upload-url',{projectId,kind:'image',filename:'asset.png'},403);

    // The same initial request can resume with no changed invitation, then members can be managed normally.
    const emptyId = randomUUID();
    const empty = {projectId:emptyId,requestId:randomUUID(),invitation:a.invitation};
    const initialEmpty = await action(owner,'project-local-share-prepare',empty);
    const resumedEmpty = await action(owner,'project-local-share-prepare',empty);
    assert.deepEqual(resumedEmpty,initialEmpty);
    await action(owner,'project-local-share',{...empty,...fixture(emptyId),revision:resumedEmpty.revision});
    assert.equal((await action(first,'project-get',{projectId:emptyId})).id,emptyId);
    const added = await action(owner,'member-add',{projectId,username:first.username,role:'artist'});
    const changed = await action(owner,'member-role',{projectId,memberId:added.id,role:'collaborator'});
    assert.equal(changed.role,'collaborator');
    await action(owner,'member-remove',{projectId,memberId:added.id});
    await action(first,'project-get',{projectId},404);
    console.log(JSON.stringify({loopbackUploads:5,loopbackDownloads:4,pendingHidden:true,
      unauthorizedWritesRejected:true,resumeAndReplace:true,existingCloudMembers:true,paidRequests:0}));
  } finally {
    await close(gateway);
    await close(storage?.server);
    await pool.end();
  }
}

verify().catch(error=>{console.error(error);process.exitCode=1;});

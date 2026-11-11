const assert = require('node:assert/strict');
const test = require('node:test');
const { handleAction } = require('../src/collab.cjs');
const {
  createLocalShareRepository, validateSnapshot, snapshotRevision,
} = require('../src/local-project-share.cjs');

const projectId = 'e0173889-f867-4515-84fb-e3fb21179a80';
const ownerId = 'ef1130a6-d13f-4d67-9a5f-7c5f0edeb2a1';
const memberId = '34ef24fd-89ca-4a74-b9c9-5f27580a20c3';
const requestId = '4a7c8669-f2d8-4ea6-b8d6-63bc9850ae90';
const assetId = '2169ed8c-5664-4e9f-a2bf-53c2c402498d';
const mediaId = 'be10fd52-a50f-4a5e-8c51-e2a6933d9c22';
const owner = {id: ownerId, username: 'owner', display_name: '制片', roles: ['director']};
const target = {id: memberId, username: 'collaborator', display_name: '协作者', roles: ['creator']};
const invite = {username: target.username, role: 'collaborator'};
const objectKey = 'projects/' + projectId + '/image/12345-asset.png';
const prepare = {projectId, revision: null, requestId, invitation: invite};

function payload(revision) {
  return {
    ...prepare,
    revision,
    project: {
      name: '本地项目', genre: '短剧', script: '第一集',
      episodes: [{
        id: 'e1', title: '第1集', episodeNumber: 1, content: '1-1 外景',
        storyboardPrompts: [{
          id: 's1', label: '1-1-1', content: '保留此分镜',
          generationConfig: {
            apiKey: 'secret-key',
            references: [{id: mediaId, assetId, objectKey, filePath: 'D:/private.png', url: 'https://example.test/a?token=secret'}],
          },
        }],
      }],
      analysis_progress: {1: {output: '核实结果'}},
    },
    assets: [{id: assetId, category: 'character', name: '甲', adoptedImageId: mediaId, episodes: [1]}],
    media: [{id: mediaId, assetId, kind: 'asset-image', filename: '甲.png', mime: 'image/png', objectKey}],
  };
}

function database(project = null, {rejectMedia = false} = {}) {
  let state = {project, assets: [], media: [], members: []};
  const writes = [];
  const client = {
    release() {},
    async query(sql, values = []) {
      const rows = result => ({rows: structuredClone(result)});
      if (/^begin/i.test(sql)) { this.before = structuredClone(state); return rows([]); }
      if (/^rollback$/i.test(sql)) {state = this.before; return rows([]);}
      if (/^commit$|^set local/i.test(sql)) return rows([]);
      if (/^select .* from app_users/.test(sql)) return rows(values[0] === target.username ? [target] : []);
      if (/^select .* from collab_projects/.test(sql)) return rows(state.project ? [state.project] : []);
      for (const [table, name] of [['collab_assets','assets'],['collab_media','media'],['collab_members','members']]) {
        if (sql.startsWith('select * from ' + table)) return rows(state[name]);
      }
      writes.push(sql);
      if(sql.startsWith('delete from collab_media')) {state.media=state.media.filter(row=>row.project_id!==values[0]||!values[1].includes(row.id));return rows([]);}
      if (sql.startsWith('insert into collab_projects')) {
        state.project = {id: values[0], name: values[1], owner_id: values[2], owner_name: values[3], genre: values[4], episodes: [], updated_at: new Date(0)};
        return rows([state.project]);
      }
      if (sql.startsWith('insert into collab_assets')) {
        const [id, project_id, category, name, description, first_episode, episodes, image_url] = values;
        const entry = {id,project_id,category,name,description,first_episode,episodes,image_url};
        state.assets = [...state.assets.filter(a => a.id !== id), entry];
        return rows([entry]);
      }
      if (sql.startsWith('insert into collab_media')) {
        if (rejectMedia) return rows([]);
        const [id, project_id, asset_id, episode, scene, kind, object_path, filename, mime, note, user_id, username] = values;
        const entry = {id,project_id,asset_id,episode,scene,kind,object_path,filename,mime,note,user_id,username};
        state.media = [...state.media.filter(m => m.id !== id), entry];
        return rows([entry]);
      }
      if (sql.startsWith('insert into collab_members')) {
        const [project_id,user_id,username,display_name,role] = values;
        const entry = {project_id,user_id,username,display_name,role};
        state.members.push(entry);
        return rows([entry]);
      }
      if (sql.startsWith('update collab_projects set name=')) {
        const [,name,style,genre,script,episodes,analysis_output,analysis_progress,image_composition,director_project_id] = values;
        Object.assign(state.project, {name,style,genre,script,episodes:JSON.parse(episodes),analysis_output,analysis_progress:JSON.parse(analysis_progress),image_composition,director_project_id,updated_at:new Date(1)});
        return rows([state.project]);
      }
      if (sql.startsWith('update collab_projects set genre=')) {
        state.project.genre = values[1];
        return rows([state.project]);
      }
      throw Error('unexpected SQL in fixture: ' + sql);
    },
  };
  return {repo:createLocalShareRepository({connect:async()=>client}), get state(){return state;}, writes};
}

test('snapshot keeps references and adopted image IDs while dropping credentials and local paths', () => {
  const result = validateSnapshot(payload('0'.repeat(64)), projectId);
  const ref = result.project.episodes[0].storyboardPrompts[0].generationConfig.references[0];
  assert.equal(ref.id, mediaId);
  assert.equal(ref.objectKey, objectKey);
  assert.equal(result.assets[0].adoptedImageId, mediaId);
  assert.doesNotMatch(JSON.stringify(result), /secret|D:\/private|filePath|apiKey/);
});

test('snapshot rejects unrelated object keys, invalid media ownership and duplicate IDs', () => {
  const good = payload('0'.repeat(64));
  assert.throws(() => validateSnapshot({...good,media:[{...good.media[0],objectKey:'projects/other/image/1.png'}]}, projectId), /存储路径/);
  assert.throws(() => validateSnapshot({...good,media:[good.media[0],good.media[0]]}, projectId), /重复/);
  assert.throws(() => validateSnapshot({...good,media:[{...good.media[0],projectId: memberId}]}, projectId), /项目/);
});

test('first invite reserves same UUID and atomically publishes saved content and the member', async () => {
  const f = database();
  const pending = await handleAction('project-local-share-prepare', prepare, owner, f.repo);
  assert.equal(pending.status, 200);
  assert.equal(f.state.project.id, projectId);
  assert.equal(f.state.members.some(m => m.user_id === memberId), false);
  const share = await handleAction('project-local-share', payload(pending.body.revision), owner, f.repo);
  assert.equal(share.status, 200);
  assert.equal(share.body.project.id, projectId);
  assert.equal(share.body.project.name, '本地项目');
  assert.equal(share.body.member.user_id, memberId);
  assert.equal(share.body.project.myRole, 'producer');
  assert.doesNotMatch(share.body.project.genre, /LOCAL_SHARE/);
  assert.equal(f.state.assets[0].image_url, objectKey);
  assert.equal(f.state.media[0].id, mediaId);
  const writes = f.writes.length;
  const retry = await handleAction('project-local-share-prepare', prepare, owner, f.repo);
  assert.equal(retry.body.completed.project.id, projectId);
  assert.equal(retry.body.completed.member.user_id, memberId);
  const finalizeRetry = await handleAction('project-local-share', payload(pending.body.revision), owner, f.repo);
  assert.equal(finalizeRetry.body.member.user_id, memberId);
  assert.equal(f.writes.length, writes, 'lost acknowledgements must not repeat writes');
});

test('invalid invitee cannot create a placeholder and other accounts cannot read project-local-state', async () => {
  const f = database();
  const noUser = await handleAction('project-local-share-prepare', {...prepare,invitation:{username:'missing',role:'collaborator'}}, owner, f.repo);
  assert.equal(noUser.status, 404);
  assert.equal(f.state.project, null);
  await handleAction('project-local-share-prepare', prepare, owner, f.repo);
  const foreign = await handleAction('project-local-state', {projectId}, target, f.repo);
  assert.equal(foreign.status, 404);
});

test('remote media and member changes invalidate a previously checked solo snapshot', async () => {
  const project = {id:projectId,owner_id:ownerId,genre:'[COLLAB_PROJECT]',name:'原云端项目',updated_at:new Date(0),episodes:[]};
  const f = database(project);
  const captured = await handleAction('project-local-state', {projectId}, owner, f.repo);
  assert.equal(captured.status, 200);
  f.state.media.push({id:mediaId,object_path:objectKey,project_id:projectId});
  const stale = await handleAction('project-local-share-prepare',{...prepare,revision:captured.body.revision}, owner, f.repo);
  assert.equal(stale.status,409);
  const next = await handleAction('project-local-state',{projectId},owner,f.repo);
  const pending = await handleAction('project-local-share-prepare',{...prepare,revision:next.body.revision},owner,f.repo);
  assert.equal(pending.status,200);
  f.state.members.push({project_id:projectId,user_id:memberId,role:'collaborator'});
  const share = await handleAction('project-local-share', payload(pending.body.revision), owner, f.repo);
  assert.equal(share.status,409);
  assert.equal(f.state.project.name,'原云端项目');
  assert.equal(f.writes.length,0);
});

test('snapshot revision is deterministic across JSON property order and changes on asset edits', () => {
  const project = {id:projectId,name:'甲'};
  const a = [{id:assetId,description:'原稿'}];
  assert.equal(snapshotRevision(project,a,[],[]),snapshotRevision({name:'甲',id:projectId},[{description:'原稿',id:assetId}],[],[]));
  assert.notEqual(snapshotRevision(project,a,[],[]),snapshotRevision(project,[{...a[0],description:'新稿'}],[],[]));
});
test('owner can request the exact persisted project snapshot with its revision', async () => {
  const episodes = [{id:'e1',title:'第一集',storyboardPrompts:[{id:'s1',content:'现有云端稿'}]}];
  const project = {id:projectId,owner_id:ownerId,genre:'剧情\n[COLLAB_PROJECT]',name:'项目',updated_at:new Date(0),episodes};
  const f = database(project);
  const read = await handleAction('project-local-state',{projectId,includeProject:true},owner,f.repo);
  assert.equal(read.status,200);
  assert.equal(read.body.project.genre,'剧情');
  assert.equal(read.body.project.myRole,'producer');
  assert.deepEqual(read.body.project.episodes,episodes);
  const minimal = await handleAction('project-local-state',{projectId},owner,f.repo);
  assert.equal(minimal.body.revision,read.body.revision);
  assert.equal(Object.hasOwn(minimal.body,'project'),false);
});

test('unfinished placeholders are absent from project list and retain stable IDs when retrying a different invitation', async () => {
  const f = database();
  const first = await handleAction('project-local-share-prepare',prepare,owner,f.repo);
  const list = await handleAction('project-list',{},owner,{...f.repo,listProjects:async()=>[f.state.project]});
  assert.deepEqual(list.body,[]);
  const requestId = 'fb6cd5b6-8481-4a3d-bf60-7f00c04b7c2d';
  const next = await handleAction('project-local-share-prepare',{...prepare,requestId},owner,f.repo);
  assert.equal(next.status,200);
  assert.notEqual(next.body.revision,first.body.revision);
  assert.equal(f.state.project.id,projectId);
  const stale = await handleAction('project-local-share',payload(first.body.revision),owner,f.repo);
  assert.equal(stale.status,409);
  assert.equal(f.state.members.some(row=>row.user_id===memberId),false);
});
test('failed media insert rolls back the project assets and leaves the invitee outside the project', async () => {
  const f = database(null, {rejectMedia: true});
  const pending = await handleAction('project-local-share-prepare',prepare,owner,f.repo);
  const share = await handleAction('project-local-share',payload(pending.body.revision),owner,f.repo);
  assert.equal(share.status,409);
  assert.equal(f.state.project.name,'等待同步的本地项目');
  assert.deepEqual(f.state.assets,[]);
  assert.deepEqual(f.state.media,[]);
  assert.deepEqual(f.state.members.map(row=>row.user_id),[ownerId]);
});

test('locked and recycled projects cannot be adopted into editable local projects', async () => {
  for (const [attributes, status] of [
    [{genre:'[COLLAB_PROJECT]\n[PROJECT_LOCKED]'},423],
    [{deleted_at:new Date(0)},410],
    [{purge_after:new Date(0)},410],
  ]) {
    const f = database({id:projectId,owner_id:ownerId,genre:'[COLLAB_PROJECT]',episodes:[],...attributes});
    const local = await handleAction('project-local-state',{projectId,includeProject:true},owner,f.repo);
    assert.equal(local.status,status);
    assert.equal(Object.hasOwn(local.body,'project'),false);
    assert.deepEqual(f.writes,[]);
  }
});

test('shared projects have a stable exclusion code for solo adoption', async () => {
  const f = database({id:projectId,owner_id:ownerId,genre:'[COLLAB_PROJECT]',episodes:[]});
  f.state.members.push({project_id:projectId,user_id:memberId,role:'collaborator'});
  const local = await handleAction('project-local-state',{projectId,includeProject:true},owner,f.repo);
  assert.equal(local.status,409);
  assert.equal(local.body.code,'LOCAL_PROJECT_SHARED');
  assert.equal(Object.hasOwn(local.body,'project'),false);
});

test('historical local UUID directors remain local snapshots only when no matching cloud document exists',async()=>{
 const {resolveCreationSource,lockDirectorReferences}=require('../src/director-source.cjs');
 const localId='79043a60-9ca7-4e90-8215-85a981274f54';
 const client={query:async sql=>({rows:sql.startsWith('select 1')?[]:[]})};
 assert.deepEqual(await resolveCreationSource(client,localId,ownerId,{allowLocalUuid:true}),{id:localId,local:true});
 await assert.rejects(resolveCreationSource(client,localId,ownerId),/无权/);
 assert.equal(await lockDirectorReferences(client,{genre:'[COLLAB_PROJECT]\n[COLLAB_LOCAL_SOURCE]',director_project_id:localId},ownerId),true);
 const conflicting={query:async sql=>({rows:sql.startsWith('select 1')?[{found:1}]:[]})};
 await assert.rejects(resolveCreationSource(conflicting,localId,ownerId,{allowLocalUuid:true}),/无权/);
 assert.equal(await lockDirectorReferences(conflicting,{genre:'[COLLAB_PROJECT]\n[COLLAB_LOCAL_SOURCE]',director_project_id:localId},ownerId),false);
});

test('explicit locally deleted cloud media stays removed after invitation and cannot target foreign records',async()=>{
 const f=database();const first=await handleAction('project-local-share-prepare',prepare,owner,f.repo);
 const deletedId='953d1547-a473-4faa-a160-f2c451d66e39';
 f.state.media.push({id:deletedId,project_id:projectId,kind:'audio',object_path:`projects/${projectId}/audio/old.wav`});
 const revision=snapshotRevision(f.state.project,f.state.assets,f.state.media,f.state.members);
 const input={...payload(revision),deletedMediaIds:[deletedId]};
 const shared=await handleAction('project-local-share',input,owner,f.repo);assert.equal(shared.status,200);assert.equal(f.state.media.some(row=>row.id===deletedId),false);
 const g=database();const reserved=await handleAction('project-local-share-prepare',prepare,owner,g.repo);
 const bad=await handleAction('project-local-share',{...payload(reserved.body.revision),deletedMediaIds:[deletedId]},owner,g.repo);assert.equal(bad.status,409);assert.equal(g.state.members.some(m=>m.user_id===memberId),false);
});

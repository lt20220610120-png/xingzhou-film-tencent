const test = require('node:test');
const assert = require('node:assert/strict');
const {createRepository} = require('../src/postgres-repository.cjs');
const {handleAction} = require('../src/collab.cjs');
const {collabGenre} = require('../src/collab-episodes.cjs');

const cloudId = 'b550d811-dfc8-4d45-a3ab-272bf4c2c120';
const localIds = ['1789580000000-abc1234', 'mfodg1c0_abc123_0'];
const episode = {title:'第1集',content:'1-1 客厅 日 内',prompts:[{id:'shot',label:'1-1-1',content:'镜头原文'}]};
const snapshot = {name:'本地导演项目',script:'原始总剧本',episodes:[episode]};
function fixture(sources = []) {
  const rows = structuredClone(sources), queries = [];
  const query = async (sql, values = []) => {
    queries.push({sql,values});
    if (/^select .*from collab_projects/i.test(sql)) {
      let found = /analysis_output=\$1/.test(sql)
        ? rows.filter(row => row.id === values[0] || row.analysis_output === values[0])
        : rows.filter(row => row.id === values[0]);
      if (/genre like '%\[DIRECTOR_PROJECT\]%'/i.test(sql)) found = found.filter(row => row.genre.includes('[DIRECTOR_PROJECT]') && !row.deleted_at);
      if (/owner_id=\$2/.test(sql)) found = found.filter(row => row.owner_id === values[1]);
      return {rows:structuredClone(found)};
    }
    if (/^insert into collab_projects/i.test(sql)) {
      const [name,owner_id,owner_name,style,genre,script,episodes,director_project_id] = values;
      const row = {id:'copy',name,owner_id,owner_name,style,genre,script,episodes:JSON.parse(episodes),director_project_id};
      rows.push(row);return {rows:[structuredClone(row)]};
    }
    if (/^update collab_projects set genre=\$1, deleted_at=null/i.test(sql)) {
      const row = rows.find(row => row.id === values[1]);Object.assign(row,{genre:values[0],deleted_at:null,purge_after:null});return {rows:[structuredClone(row)]};
    }
    if (/^update collab_projects set episodes=\$2,script=\$3/i.test(sql)) {
      const row = rows.find(row => row.id === values[0]);Object.assign(row,{episodes:JSON.parse(values[1]),script:values[2]});return {rows:[structuredClone(row)]};
    }
    return {rows:[]};
  };
  const pool = {query,connect:async()=>({query,release(){}})};
  return {repo:createRepository('',{pool}),rows,queries};
}

for (const directorProjectId of localIds) test(`2.2.8 project-create accepts actual local ID ${directorProjectId} without creating a director`, async () => {
  const f = fixture();
  const response = await handleAction('project-create',{...snapshot,directorProjectId,ownerId:'attacker',genre:'都市\n[COLLAB_SOURCE:foreign]'}, {id:'owner',username:'owner'}, f.repo);
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.owner_id,'owner');
  assert.equal(response.body.director_project_id,directorProjectId);
  assert.equal(response.body.genre,'都市');
  assert.equal(response.body.myRole,'producer');
  assert.equal(f.rows.length,1);
  assert.match(f.rows[0].genre,/\[COLLAB_LOCAL_SOURCE\]/);
  assert.doesNotMatch(f.rows[0].genre,/\[COLLAB_SOURCE:/);
  assert.deepEqual(response.body.episodes,[episode]);
  assert.equal(response.body.script,snapshot.script);
  assert.equal(f.queries.at(-1).sql,'COMMIT');
});

test('local snapshot never auto-links to a later cloud alias and remains restorable and one-way syncable',async()=>{
  const f=fixture();
  const created=await f.repo.createProject({...snapshot,ownerId:'owner',directorProjectId:localIds[0]});
  const foreign={id:cloudId,owner_id:'other',genre:'[DIRECTOR_PROJECT]',analysis_output:localIds[0],script:'不得读取',episodes:[]};
  f.rows.push(foreign);
  assert.equal((await f.repo.refreshDirectorPrompts(created.id,'owner')).script,snapshot.script);
  const copy=f.rows.find(row=>row.id==='copy');copy.genre+='\n[RECYCLE_UNTIL:2099-01-01]';copy.deleted_at='2026-01-01';copy.purge_after='2099-01-01';
  assert.ok(await f.repo.restoreProject('copy','owner'));
  assert.ok(await f.repo.syncDirectorSnapshot('copy',{script:'本地更新',episodes:[episode]},'owner'));
  assert.equal(foreign.script,'不得读取');
  assert.equal(copy.director_project_id,localIds[0]);
  assert.match(collabGenre('喜剧',copy.genre),/\[COLLAB_LOCAL_SOURCE\]/);
  assert.equal(collabGenre('[COLLAB_LOCAL_SOURCE]\n喜剧'),'喜剧\n[COLLAB_PROJECT]');
});

test('cloud projection ID resolves through its real UUID with authorization and a source row lock',async()=>{
  const source={id:cloudId,owner_id:'owner',genre:'[DIRECTOR_PROJECT]',analysis_output:'original',script:'cloud script',episodes:[episode]};
  const f=fixture([source]);
  const response=await handleAction('project-create',{...snapshot,directorProjectId:`cloud-${cloudId}`},{id:'owner'},f.repo);
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.ok(f.queries.some(q=>/for update/.test(q.sql)&&q.values[0]===cloudId));
  assert.doesNotMatch(f.rows[1].genre,/COLLAB_LOCAL_SOURCE/);
  assert.equal((await f.repo.refreshDirectorPrompts('copy','owner')).script,'cloud script');
  assert.deepEqual(f.rows[0],source);
});

test('unknown/foreign/deleted/ambiguous cloud identities cannot downgrade into local imports',async()=>{
  const other={id:cloudId,owner_id:'other',genre:'[DIRECTOR_PROJECT]',analysis_output:localIds[0]};
  for(const [sources,directorProjectId] of [
    [[],cloudId],[[],`cloud-${cloudId}`],[[],'not-a-local-id'],[[],'1789580000000-abc1234\n'],[[],`${localIds[0]}][DIRECTOR_PROJECT]`],
    [[other],cloudId],[[other],`cloud-${cloudId}`],[[other],localIds[0]],
    [[{...other,owner_id:'owner',deleted_at:'2026-01-01'}],localIds[0]],
    [[{...other,owner_id:'owner'},{...other,id:'other-cloud',owner_id:'owner'}],localIds[0]],
  ]){
    const f=fixture(sources);
    const result=await handleAction('project-create',{...snapshot,directorProjectId,genre:'[COLLAB_LOCAL_SOURCE]'},{id:'owner'},f.repo);
    assert.equal(result.status,403,directorProjectId);
    assert.equal(f.queries.some(q=>/^insert /.test(q.sql)),false,directorProjectId);
  }
});

test('explicitly linking a local copy to a cloud projection removes the local marker and stores the real source ID',async()=>{
  const source={id:cloudId,owner_id:'owner',genre:'[DIRECTOR_PROJECT]',analysis_output:'another-source'};
  const f=fixture([source]);
  await f.repo.createProject({...snapshot,ownerId:'owner',directorProjectId:localIds[0]});
  await f.repo.linkDirectorProject('copy',`cloud-${cloudId}`,'owner');
  const write=f.queries.find(q=>/^update collab_projects set genre=\$2,director_project_id=\$3/.test(q.sql));
  assert.ok(write);
  assert.equal(write.values[2],cloudId);
  assert.equal(write.values[1],`[COLLAB_PROJECT]\n[COLLAB_SOURCE:${cloudId}]`);
});

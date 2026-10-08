const test=require('node:test'),assert=require('node:assert/strict');
const {handleAction}=require('../src/collab.cjs');
const {extendRepository}=require('../src/repository-extras.cjs');
const {sourceProtection,referencesDirector}=require('../src/cloud-recycle.cjs');
const at=Date.parse('2026-10-09T00:00:00Z'),date=t=>new Date(t).toISOString();
test('cloud source protection includes active and restorable references, releases expired ones and retains uncertain deadlines',()=>{
 assert.equal(sourceProtection({genre:'[COLLAB_PROJECT]'},at),'active');
 assert.equal(sourceProtection({deleted_at:date(at-1),purge_after:date(at+1)},at),'recycle');
 assert.equal(sourceProtection({genre:'[COLLAB_PROJECT]\n[RECYCLE_UNTIL:'+date(at+1)+']'},at),'recycle');
 assert.equal(sourceProtection({deleted_at:date(at-1),purge_after:date(at)},at),'expired');
 assert.equal(sourceProtection({deleted_at:date(at-1)},at),'unknown');
 assert.equal(sourceProtection({purge_after:'bad'},at),'unknown');
 assert.equal(sourceProtection({purge_after:date(at+1),genre:'[RECYCLE_UNTIL:'+date(at-1)+']'},at),'expired');
 for(const source of ['cloud-id','local-id','cloud-cloud-id'])assert.equal(referencesDirector({director_project_id:source},{id:'cloud-id',analysis_output:'local-id'}),true);
 assert.equal(referencesDirector({director_project_id:'unrelated'},{id:'cloud-id',analysis_output:'local-id'}),false);
});
test('delete director source is refused for three-day recovery references, allowed only after expiry',async()=>{
 for(const state of ['active','recycle','expired','unknown']){
  const source={id:'dir',owner_id:'owner',genre:'[DIRECTOR_PROJECT]',analysis_output:'local'};
  const link={id:'copy',genre:'[COLLAB_PROJECT]',director_project_id:'dir',...(state==='active'?{}:{deleted_at:date(at),purge_after:state==='unknown'?'bad':state==='expired'?'2000-01-01':'2099-01-01'})};
  const writes=[];const client={release(){},query:async(sql,args)=>{
   if(/select \* from collab_projects where/i.test(sql))return {rows:args[1]==='owner'?[source]:[]};
   if(/from collab_projects c/i.test(sql))return {rows:[link]};
   if(/^delete from collab_projects/i.test(sql)){writes.push(sql);return {rows:[{id:'dir'}]};}return {rows:[]};
  }};const repo=extendRepository({query:client.query,connect:async()=>client});
  if(state==='expired'){assert.ok(await repo.deleteDirectorProject('dir','owner'));assert.equal(writes.length,1);}else{await assert.rejects(repo.deleteDirectorProject('dir','owner'),e=>e.status===409);assert.equal(writes.length,0);}
  assert.equal(await repo.deleteDirectorProject('dir','invited'),null);
 }
});
test('director list marks recovery protection for both cloud-id and old local-id links',async()=>{
 const source={id:'dir',owner_id:'owner',genre:'[DIRECTOR_PROJECT]',analysis_output:'local'};
 for(const alias of ['dir','local','cloud-dir']){
  const repo={listDirectorProjectRows:async()=>[source],listCollabLinks:async()=>[{id:'copy',genre:'[COLLAB_PROJECT]',director_project_id:alias,purge_after:'2099-01-01',deleted_at:'2026-01-01'}],findMembership:async()=>({role:'producer'})};
  const r=await handleAction('director-project-list',{}, {id:'owner'},repo);assert.equal(r.body[0].collaborationLinked,true);assert.equal(r.body[0].collaborationProtection,'recycle');
 }
});
test('cloud restore distinguishes owner permission, expiry, and missing director source without changing data',async()=>{
 const row={id:'copy',owner_id:'owner',genre:'[COLLAB_PROJECT]\n[RECYCLE_UNTIL:2099-01-01]'};
 let calls=0;const repo={getProject:async()=>row,restoreProject:async()=>{calls++;return null;}};
 assert.equal((await handleAction('project-restore',{projectId:'copy'},{id:'invited',is_producer:true},repo)).status,403);assert.equal(calls,0);
 const missing=await handleAction('project-restore',{projectId:'copy'},{id:'owner'},repo);assert.equal(missing.status,409);assert.equal(missing.body.code,'DIRECTOR_SOURCE_UNAVAILABLE');
 row.genre='[COLLAB_PROJECT]\n[RECYCLE_UNTIL:2000-01-01]';assert.equal((await handleAction('project-restore',{projectId:'copy'},{id:'owner'},repo)).status,410);
});
test('authoritative stale local associations release only when no source or recoverable cloud copy remains',async()=>{
 const item={projectId:'local',collaborationProjectId:'copy'},past={genre:'[COLLAB_PROJECT]',purge_after:'2000-01-01',deleted_at:'2000-01-01'};
 for(const [rows,status] of [[[],'released'],[[past],'released'],[[{...past,purge_after:'2099-01-01'}],'protected'],[[{genre:'[DIRECTOR_PROJECT]'}],'protected']]){
  const repo=extendRepository({query:async()=>({rows})});const result=await repo.directorAssociationStates([item]);assert.equal(result[0].status,status);assert.equal(result[0].collaborationProjectId,'copy');
 }
});

test('director list opt-in association results preserve old-client array response and fail closed on lookup errors',async()=>{
 const repo={listDirectorProjectRows:async()=>[],listCollabLinks:async()=>[],directorAssociationStates:async items=>items.map(item=>({...item,status:'released'}))};
 assert.deepEqual((await handleAction('director-project-list',{}, {id:'owner'},repo)).body,[]);
 const associations=[{projectId:'local',collaborationProjectId:'copy'}];
 const r=await handleAction('director-project-list',{associations},{id:'owner'},repo);assert.equal(r.status,200);assert.equal(r.body.associations[0].status,'released');assert.deepEqual(r.body.projects,[]);
 repo.listCollabLinks=async()=>{throw Error('offline');};assert.equal((await handleAction('director-project-list',{associations},{id:'owner'},repo)).status,503);
 repo.listCollabLinks=async()=>[];repo.directorAssociationStates=async()=>{throw Error('offline');};assert.equal((await handleAction('director-project-list',{associations},{id:'owner'},repo)).status,503);
});

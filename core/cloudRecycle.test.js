import test from 'node:test';import assert from 'node:assert/strict';
import {canManageCloudProject,reconcileDirectorAssociations,reconcileDirectorLinks} from './cloudRecycle.js';
import {removeDirectorCloudProjection} from './directorCloudProjects.js';
import {isLocalRecyclableDirector} from './projectRecycle.js';
test('cloud project deletion and restoration require this project owner, regardless of global producer identity',()=>{
 assert.equal(canManageCloudProject({owner_id:'owner',myRole:'producer'},{id:'owner'}),true);
 assert.equal(canManageCloudProject({owner_id:'other',myRole:'collaborator'},{id:'owner',isProducer:true}),false);
 assert.equal(canManageCloudProject({owner_id:'other',myRole:'producer'},{id:'owner'}),false);
});
test('only matching server release decisions detach stale associations; missing/stale decisions leave protection',()=>{
 const p={id:'local',sourceType:'library',collaborationProjectId:'copy',groupId:'director-cloud',masterScript:'原稿',episodes:[]};
 assert.equal(isLocalRecyclableDirector(reconcileDirectorAssociations([p],[{projectId:'local',collaborationProjectId:'copy',status:'released'}])[0]),true);
 for(const decision of [[],[{projectId:'local',collaborationProjectId:'copy',status:'unknown'}],[{projectId:'local',collaborationProjectId:'different',status:'released'}]])assert.equal(isLocalRecyclableDirector(reconcileDirectorAssociations([p],decision)[0]),false);
 assert.equal(reconcileDirectorAssociations([{...p,cloudProjectId:'live-cloud'}],[{projectId:'local',collaborationProjectId:'copy',status:'released'}])[0].cloudProjectId,'live-cloud');
});
test('successful cloud-source deletion removes stale local collaboration binding while retaining original text',()=>{
 const p={id:'local',sourceType:'library',cloudProjectId:'cloud',collaborationProjectId:'copy',episodes:[],masterScript:'原稿'};
 const restored=removeDirectorCloudProjection([p],'cloud')[0];assert.equal(restored.masterScript,'原稿');assert.equal(isLocalRecyclableDirector(restored),true);
});

test('live and three-day recovery links protect local originals; expiry alone is not proof to detach',()=>{
 const p={id:'local',sourceType:'upload',masterScript:'正文',groupId:'director-workbench'};
 for(const row of [{id:'copy',director_project_id:'local'},{id:'copy',director_project_id:'local',deleted_at:'2026-01-01',purge_after:'2099-01-01'},{id:'copy',director_project_id:'local',deleted_at:'2026-01-01',purge_after:'bad'}]){
  const linked=reconcileDirectorLinks([p],[row])[0];assert.equal(linked.collaborationProjectId,'copy');assert.equal(isLocalRecyclableDirector(linked),false);
 }
 const linked={...p,collaborationProjectId:'copy',groupId:'director-cloud'};
 assert.equal(reconcileDirectorLinks([linked],[{id:'copy',director_project_id:'local',deleted_at:'2000-01-01',purge_after:'2000-01-02'}])[0],linked);
 const updated=reconcileDirectorLinks([linked],[{id:'new-copy',director_project_id:'local'}],[{projectId:'local',collaborationProjectId:'copy',status:'released'}])[0];assert.equal(updated.collaborationProjectId,'new-copy');
});

test('visible active or recoverable link overrides an inconsistent earlier release decision for the same ID',()=>{
 const p={id:'local',sourceType:'upload',collaborationProjectId:'copy',groupId:'director-cloud',masterScript:'正文'};
 for(const row of [{id:'copy',director_project_id:'local'},{id:'copy',director_project_id:'local',deleted_at:'2026-01-01',purge_after:'2099-01-01'}]){
  const result=reconcileDirectorLinks([p],[row],[{projectId:'local',collaborationProjectId:'copy',status:'released'}])[0];
  assert.equal(result.collaborationProjectId,'copy');assert.equal(isLocalRecyclableDirector(result),false);
 }
});

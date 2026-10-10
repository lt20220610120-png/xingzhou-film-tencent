import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDirectorMasterDraft,refreshDirectorCollaboration} from './directorCollaborationRefresh.js';
import {createDirectorCloudSync} from './directorCloudSync.js';
import {acknowledgeDirectorCloudSave,reconcileDirectorCloudProjects} from './directorCloudProjects.js';
import {threeWayMerge} from './threeWayMerge.js';

test('shared master updates replace clean text while preserving an unsubmitted human draft',()=>{
 const previous={id:'p',script:'旧剧本'},incoming={id:'p',script:'成员更新'};
 assert.equal(reconcileDirectorMasterDraft('旧剧本',previous,incoming),'成员更新');
 assert.equal(reconcileDirectorMasterDraft('我的未保存输入',previous,incoming),'我的未保存输入');
 assert.equal(reconcileDirectorMasterDraft('未保存',previous,{id:'other',script:'其他项目'}),'其他项目');
});

test('two members share independent edits only after explicit upload, while refresh remains read-only',async()=>{
 let revision=0,remote={id:'cloud',name:'共享',script:'原文',episodes:[{id:'e',content:'1-1 房 日 内',prompts:[],quickSceneEdits:{}}],updated_at:'2026-10-10T00:00:00.000Z'};
 const member=()=>{
  let projects=reconcileDirectorCloudProjects([], [structuredClone(remote)]);
  const sync=createDirectorCloudSync({getContext:()=>({accountId:'member',projects}),updateProject:async args=>{
   const doc={name:remote.name,script:remote.script,episodes:remote.episodes};
   remote={...remote,...threeWayMerge(args.base,args.updates,doc),updated_at:new Date(Date.UTC(2026,9,10,0,0,++revision)).toISOString()};return structuredClone(remote);
  },acknowledge:({cloud,submitted})=>{projects=acknowledgeDirectorCloudSave(projects,cloud,submitted);}});
  return {get:()=>projects[0],edit:patch=>{projects=[{...projects[0],...patch}];},refresh:()=>refreshDirectorCollaboration({getProject:()=>projects[0],flushEdits:()=>{},flushCloud:sync.flush,readCloud:async()=>structuredClone(remote),applyCloud:cloud=>{projects=reconcileDirectorCloudProjects(projects,[cloud]);}}),sync};
 };
 const a=member(),b=member();
 a.edit({episodes:[{...a.get().episodes[0],quickSceneEdits:{'1-1':'成员 A 修改场景'}}]});
 b.edit({episodes:[{...b.get().episodes[0],prompts:[{id:'prompt-b',text:'成员 B 提示词'}]}]});
 assert.equal(remote.episodes[0].prompts.length,0);
 await a.sync.flush(a.get().id);await b.sync.flush(b.get().id);await a.refresh();await b.refresh();
 for(const user of [a,b]){assert.equal(user.get().episodes[0].quickSceneEdits['1-1'],'成员 A 修改场景');assert.equal(user.get().episodes[0].prompts[0].text,'成员 B 提示词');user.sync.dispose();}
});

test('failed explicit upload retains local changes, retry recovers, and refresh can still read',async()=>{
 let fail=true,reads=0,message='',projects=[{id:'p',name:'项目',cloudProjectId:'c',masterScript:'新稿',episodes:[],cloudBase:{name:'项目',script:'旧稿',episodes:[]}}];
 const sync=createDirectorCloudSync({getContext:()=>({accountId:'a',projects}),updateProject:async p=>{if(fail)throw Error('模拟断网');return {id:'c',...p.updates};},acknowledge:({cloud,submitted})=>{projects=acknowledgeDirectorCloudSave(projects,cloud,submitted);},onConflict:e=>{message=e.message;}});
 const refresh=()=>refreshDirectorCollaboration({getProject:()=>projects[0],flushEdits:()=>{},flushCloud:sync.flush,readCloud:async()=>{reads++;return{id:'c',name:'项目',script:'新稿',episodes:[]};},applyCloud:c=>{projects=reconcileDirectorCloudProjects(projects,[c]);}});
 await assert.rejects(sync.flush('p'),/模拟断网/);assert.equal(reads,0);assert.equal(message,'模拟断网');assert.equal(projects[0].masterScript,'新稿');
 fail=false;await sync.flush('p');await refresh();assert.equal(reads,1);assert.equal(projects[0].cloudBase.script,'新稿');sync.dispose();
});

test('refresh reads locked shared content without submitting local edits',async()=>{
 let project={id:'p',cloudProjectId:'c',cloudBase:{},cloudLocked:true},writes=0;
 await refreshDirectorCollaboration({getProject:()=>project,flushEdits:()=>{},flushCloud:async()=>writes++,readCloud:async()=>({script:'共享只读稿'}),applyCloud:c=>{project={...project,masterScript:c.script};}});
 assert.equal(writes,0);assert.equal(project.masterScript,'共享只读稿');
});

test('read-only members can refresh shared documents without uploading their pending local changes',async()=>{
 let project={id:'p',cloudProjectId:'c',cloudBase:{},permissions:{canWrite:false}},writes=0,reads=0;
 await refreshDirectorCollaboration({getProject:()=>project,flushEdits:()=>{},flushCloud:async()=>writes++,readCloud:async()=>{reads++;return {script:'其他成员的新稿'};},applyCloud:c=>{project={...project,masterScript:c.script};}});
 assert.equal(writes,0);assert.equal(reads,1);assert.equal(project.masterScript,'其他成员的新稿');
});

test('an older list reply cannot roll back the acknowledged cloud baseline or resurrect old text',()=>{
 const fresh={id:'c',name:'项目',script:'新稿',episodes:[],updated_at:'2026-10-10T01:00:00Z'};
 const projects=reconcileDirectorCloudProjects([], [fresh]);
 const result=reconcileDirectorCloudProjects(projects,[{...fresh,script:'旧稿',updated_at:'2026-10-10T00:00:00Z'}]);
 assert.equal(result[0].masterScript,'新稿');assert.equal(result[0].cloudBase.script,'新稿');assert.equal(result[0].cloudConflict,'');
});

test('conflicting shared edits stay visible as a conflict and cannot be reported as synchronized',async()=>{
 let project={id:'p',cloudProjectId:'c',cloudBase:{},cloudConflict:'同一处双端修改'},writes=0;
 await assert.rejects(refreshDirectorCollaboration({getProject:()=>project,flushEdits:()=>{},flushCloud:async()=>writes++,readCloud:async()=>({}),applyCloud:()=>{}}),/协作版本存在冲突/);
 assert.equal(writes,0);
});

test('legacy links without a baseline retain different local manuscripts and require an explicit choice',async()=>{
 let projects=[{id:'p',cloudProjectId:'c',name:'项目',masterScript:'本地重要新稿',episodes:[{id:'e',content:'本地分集',prompts:[{id:'mine',text:'本地提示词'}]}]}],writes=0;
 await assert.rejects(refreshDirectorCollaboration({getProject:()=>projects[0],flushEdits:()=>{},flushCloud:async()=>writes++,readCloud:async()=>({id:'c',name:'项目',script:'远端旧稿',episodes:[{id:'e',content:'远端旧分集'}]}),applyCloud:cloud=>{projects=reconcileDirectorCloudProjects(projects,[cloud]);}}),/缺少同步基准/);
 assert.equal(projects[0].masterScript,'本地重要新稿');assert.equal(projects[0].episodes[0].prompts[0].text,'本地提示词');assert.equal(projects[0].cloudRemote.script,'远端旧稿');assert.equal(writes,0);assert.equal(projects[0].cloudBaselineMissing,true);
});

test('authoritative confirmation clears a lost-upload-response error once local and cloud documents match',()=>{
 const doc={name:'项目',script:'已送达新稿',episodes:[]},project={id:'p',cloudProjectId:'c',name:doc.name,masterScript:doc.script,episodes:[],cloudBase:doc,cloudSyncError:'上传回包中断'};
 const [confirmed]=reconcileDirectorCloudProjects([project],[{id:'c',...doc}]);
 assert.equal(confirmed.cloudSyncError,'');assert.equal(confirmed.masterScript,doc.script);
 const [pending]=reconcileDirectorCloudProjects([{...project,masterScript:'尚未上传的人工作文'}],[{id:'c',...doc}]);assert.equal(pending.cloudSyncError,'上传回包中断');assert.equal(pending.masterScript,'尚未上传的人工作文');
});

for(const field of ['quickSceneEdits','sceneVisions'])test(`legacy same-scene ${field} differences cannot silently overwrite a peer`,()=>{
 const ep={id:'e',content:'相同原文',prompts:[],[field]:{'1-1':'我的旧场次'}};
 const local={id:'p',cloudProjectId:'c',name:'项目',masterScript:'相同总稿',episodes:[ep]};
 const remote={id:'c',name:local.name,script:local.masterScript,episodes:[{...ep,[field]:{'1-1':'成员的新场次'}}]};
 const [result]=reconcileDirectorCloudProjects([local],[remote]);assert.equal(result.cloudBaselineMissing,true);assert.equal(result.episodes[0][field]['1-1'],'我的旧场次');assert.equal(result.cloudRemote.episodes[0][field]['1-1'],'成员的新场次');assert.equal(result.cloudBase,undefined);
});

test('empty local tombstone defaults are not an edit that conflicts with a peer replacing an episode',()=>{
 const original={id:'c',name:'项目',script:'旧稿',episodes:[{id:'e',content:'旧正文',prompts:[]}]};
 const initial=reconcileDirectorCloudProjects([], [original]);
 assert.deepEqual(initial[0].episodes[0].deletedPromptIds,[]);
 const [updated]=reconcileDirectorCloudProjects(initial,[{...original,script:'新稿',episodes:[{id:'new',content:'新正文',prompts:[]}]}]);
 assert.equal(updated.cloudConflict,'');assert.equal(updated.masterScript,'新稿');assert.equal(updated.episodes[0].id,'new');
});
test('adopting a member conflict clears its earlier error even with local empty plan and tombstone defaults',()=>{
 const cloud={id:'c',name:'项目',script:'制片已采用的稿',episodes:[{id:'e',content:'已采用正文',prompts:[]}]};
 const [initial]=reconcileDirectorCloudProjects([], [cloud]);
 const [confirmed]=reconcileDirectorCloudProjects([{...initial,cloudSyncError:'同处修改发生冲突，您的完整版本已上传保留，共享项目未被覆盖；请由制片在协作版本中选择'}],[cloud]);
 assert.equal(confirmed.cloudConflict,'');assert.equal(confirmed.cloudSyncError,'');
});

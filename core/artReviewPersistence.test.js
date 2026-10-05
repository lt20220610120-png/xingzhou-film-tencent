import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {editArtReview,newArtReview,reviewLedgerSignature,reviewRoster,reviewSceneSignature} from './artReview.js';
import {getArtReviewStore,summarizeArtReview} from './artReviewPersistence.js';

const {artReviewRepository}=createRequire(import.meta.url)('../cloud-backend/src/art-review-repository.cjs');
const episode=n=>({episodeNumber:n,title:`第${n}集`,content:`${n}-1 卧室 夜 内\n人物在卧室。\n\n${n}-2 学校 日 外\n人物在学校。`});
function generated(n=1){
 let r=newArtReview(episode(n));
 r.status='generated';r.inventory=`第${n}集完整清单`;r.rawOutput=`第${n}集完整回包`;
 r=editArtReview(r,{type:'roster-upsert',sceneIds:[`${n}-1`,`${n}-2`],item:{category:'prop',name:`【第${n}集台灯】`,description:'白色圆形灯罩台灯，金属灯座',ready:true}});
 return r;
}
const approved=n=>editArtReview(generated(n),{type:'approve-episode'},'owner');
function revise(record,description){
 const item=reviewRoster(record)[0];
 return {...editArtReview(record,{type:'roster-upsert',itemId:item.id,sceneIds:record.scenes.map(s=>s.id),item:{...item,description,note:'最新本地补充',ready:true}}),rawOutput:'最新模型完整回包',generation:{status:'saved',taskId:'new-local-task'}};
}
function fixture({count=1,disk=null,projectId=crypto.randomUUID(),accountId=crypto.randomUUID()}={}){
 let local=structuredClone(disk),failLocal=null,loseSaveAck=false,losePublishAck=false,backup;
 const saveCalls=[],publishCalls=[],localWrites=[];
 const project={id:projectId,owner_id:'owner',genre:'现代\n[COLLAB_PROJECT]',episodes:Array.from({length:count},(_,i)=>episode(i+1)),analysis_progress:{},analysis_output:'',assets:[]};
 const client={release(){},async query(sql,args=[]){
  if(sql==='BEGIN'){backup=structuredClone(project);return {rows:[]};}
  if(sql==='ROLLBACK'){Object.assign(project,backup);return {rows:[]};}
  if(sql==='COMMIT'||sql.startsWith('set local'))return {rows:[]};
  if(sql.startsWith('select p.*'))return {rows:[structuredClone(project)]};
  if(sql.startsWith('select * from collab_assets'))return {rows:project.assets.filter(a=>a.name===args[1])};
  if(sql.startsWith('insert into collab_assets')){
   let asset=project.assets.find(a=>a.name===args[2]);
   if(asset){asset.episodes=[...new Set([...asset.episodes,...args[5]])];asset.description||=args[3];}
   else project.assets.push({id:crypto.randomUUID(),category:args[1],name:args[2],description:args[3],first_episode:args[4],episodes:args[5],images:[]});
   return {rows:[]};
  }
  if(sql.startsWith('update collab_assets')){const asset=project.assets.find(a=>a.name===args[1]);if(asset)asset.episodes=asset.episodes.filter(n=>n!==args[2]);return {rows:[]};}
  if(sql.startsWith('update collab_projects set analysis_progress')){project.analysis_progress=JSON.parse(args[1]);project.analysis_output=args[2];return {rows:[]};}
  throw Error('Unexpected SQL '+sql);
 }};
 const repository=artReviewRepository({connect:async()=>client});
 const api={
  artReviewLoadLocal:async()=>structuredClone(local),analysisLoad:async()=>null,
  artReviewSaveLocal:async({data})=>{localWrites.push(structuredClone(data));if(failLocal?.(data))throw Error('本地资料写入失败');local=structuredClone(data);},
  collabArtReviewSave:async p=>{saveCalls.push(structuredClone(p));const saved=await repository.saveArtReview(project.id,p,'owner');if(loseSaveAck){loseSaveAck=false;throw Error('上传回执丢失');}return saved;},
  collabArtReviewPublish:async p=>{publishCalls.push(structuredClone(p));const saved=await repository.publishArtReview(project.id,p,'owner');if(losePublishAck){losePublishAck=false;throw Error('发布回执丢失');}return saved;},
 };
 const store=getArtReviewStore({api,projectId,accountId});
 return {api,store,project,accountId,saveCalls,publishCalls,localWrites,get disk(){return local;},set failLocal(v){failLocal=v;},set loseSaveAck(v){loseSaveAck=v;},set losePublishAck(v){losePublishAck=v;}};
}

test('all review edits, approvals and generation checkpoints stay local, including legacy sync options',async()=>{
 const f=fixture();await f.store.load(f.project);
 await f.store.update(1,()=>generated(1),{sync:true});
 await f.store.update(1,r=>({...r,generation:{taskId:'local-task',status:'running'}}));
 await f.store.update(1,r=>({...r,generation:{...r.generation,status:'received'},rawOutput:'完整回包'}));
 const item=reviewRoster(f.store.snapshot().episodes[1])[0];
 for(const action of [
  {type:'assign',itemId:item.id,sceneIds:['1-1']},
  {type:'remove',sceneId:'1-1',itemId:item.id},{type:'undo',sceneId:'1-1'},
  {type:'roster-remove',itemId:item.id},{type:'roster-undo'},
  {type:'approve',sceneId:'1-1'},{type:'unapprove',sceneId:'1-1'},
 ])await f.store.update(1,r=>editArtReview(r,action));
 await f.store.sync();await f.store.load(f.project);
 assert.equal(f.saveCalls.length,0);assert.equal(f.publishCalls.length,0);assert.equal(f.project.assets.length,0);
 assert.equal(f.disk.episodes[1].rawOutput,'完整回包');assert.equal(f.disk.episodes[1].generation.status,'received');
 assert.equal(f.disk.episodes[1].pending,true);assert.equal(f.disk.episodes[1].version,0);
 assert.deepEqual(f.store.snapshot(),f.disk);
});

test('periodic cloud refresh preserves old pending drafts, matching acknowledgements and unpublished legacy checkpoints',async()=>{
 for(const pending of [true,false]){
  const local={...generated(1),version:4,pending,writeId:'old-pending-write'};
  const f=fixture({disk:{episodes:{1:local}}});
  const remote={...approved(1),version:5,lastWriteId:local.writeId,rawOutput:'远端旧回包'};
  remote.published=Object.fromEntries(remote.scenes.map(s=>[s.id,{...s,signature:reviewSceneSignature(s)}]));
  f.project.analysis_progress[1]={review:remote};
  await f.store.load(f.project);await f.store.load(f.project);
  assert.deepEqual(f.disk.episodes[1],local);assert.equal(f.saveCalls.length,0);
 }
});

test('clean published checkpoints accept newer cloud publication, and first load can seed cached cloud review',async()=>{
 const r=approved(1);r.published=Object.fromEntries(r.scenes.map(s=>[s.id,{...s,signature:reviewSceneSignature(s)}]));
 const f=fixture({disk:{episodes:{1:{...r,version:2,pending:false}}}});
 f.project.analysis_progress[1]={review:{...r,version:3,rawOutput:'新版发布'}};await f.store.load(f.project);
 assert.equal(f.disk.episodes[1].rawOutput,'新版发布');assert.equal(f.disk.episodes[1].pending,false);
 const first=fixture();first.project.analysis_progress[1]={review:{...generated(1),version:1}};await first.store.load(first.project);
 assert.equal(first.disk.episodes[1].version,1);assert.equal(first.saveCalls.length,0);
});

test('failed local edits and cloud adoption preserve the prior memory and disk checkpoints',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>generated(1));
 const before=structuredClone(f.disk);let notifications=0;f.store.subscribe(()=>notifications++);
 f.failLocal=()=>true;
 await assert.rejects(f.store.update(1,r=>({...r,rawOutput:'未落盘的新回包'})),/本地资料写入失败/);
 f.project.analysis_progress[1]={review:{...approved(1),version:9}};
 await assert.rejects(f.store.useCloud(1,f.project),/本地资料写入失败/);
 assert.deepEqual(f.store.snapshot(),before);assert.deepEqual(f.disk,before);assert.equal(notifications,0);assert.equal(f.saveCalls.length,0);
 f.failLocal=null;await f.store.update(1,r=>({...r,rawOutput:'之后成功的回包'}));assert.equal(f.disk.episodes[1].rawOutput,'之后成功的回包');
});

test('failed initial checkpoint load can be retried without losing the existing file',async()=>{
 const local={episodes:{1:{...generated(1),pending:true,writeId:'migration-id'}}};const f=fixture({disk:local});
 f.failLocal=()=>true;await assert.rejects(f.store.load(f.project),/本地资料写入失败/);
 assert.deepEqual(f.store.snapshot(),{episodes:{}});assert.deepEqual(f.disk,local);
 f.failLocal=null;await f.store.load(f.project);assert.deepEqual(f.store.snapshot(),local);
});

test('explicit publication uploads only the selected episode; earlier references stay local',async()=>{
 const f=fixture({count:4});await f.store.load(f.project);
 await f.store.update(1,()=>approved(1));await f.store.update(2,()=>({...approved(2),dependencies:{1:reviewLedgerSignature(f.disk.episodes[1])}}));
 await f.store.update(3,()=>({...approved(3),dependencies:{1:reviewLedgerSignature(f.disk.episodes[1]),2:reviewLedgerSignature(f.disk.episodes[2])}}));
 await f.store.update(4,()=>approved(4));
 assert.equal(f.saveCalls.length,0);assert.equal(f.publishCalls.length,0);
 await f.store.publish(3,['3-1','3-2']);
 assert.deepEqual(f.saveCalls.map(p=>p.episodeNumber),[3]);assert.deepEqual(f.publishCalls.map(p=>p.episodeNumber),[3]);
 assert.deepEqual(Object.keys(f.project.analysis_progress),['3']);
 assert.deepEqual(f.project.assets.map(a=>a.name),['【第3集台灯】']);assert.deepEqual(f.project.assets[0].episodes,[3]);
 assert.equal(f.disk.episodes[1].pending,true);assert.equal(f.disk.episodes[2].pending,true);assert.equal(f.disk.episodes[3].pending,false);assert.equal(f.disk.episodes[4].version,0);
 assert.equal(summarizeArtReview(f.disk,f.project).published,1);assert.deepEqual(summarizeArtReview(f.disk,f.project).pendingEpisodes,[1,2,4]);
 assert.ok(f.saveCalls.every(p=>!p.data.publishRequest&&!p.data.uploadedWriteId&&!p.data.cloudReceipt));
 await f.store.publish(2,['2-1','2-2']);assert.deepEqual(f.saveCalls.map(p=>p.episodeNumber),[3,2]);
});

test('changed earlier episode does not block independently verified later episode',async()=>{
 const f=fixture({count:2});await f.store.load(f.project);await f.store.update(1,()=>approved(1));
 await f.store.update(2,()=>({...approved(2),dependencies:{1:reviewLedgerSignature(f.disk.episodes[1])}}));
 await f.store.update(1,r=>editArtReview(r,{type:'roster-remove',itemId:reviewRoster(r)[0].id}));
 await f.store.publish(2,['2-1']);
 assert.deepEqual(f.saveCalls.map(p=>p.episodeNumber),[2]);assert.equal(f.publishCalls.length,1);assert.equal(f.disk.episodes[1].pending,true);
});

test('legacy pending migration keeps its optimistic version and write ID; conflicts leave local edits intact',async()=>{
 const local={...approved(1),pending:true,version:0,writeId:'legacy-id'};const f=fixture({disk:{episodes:{1:local}}});
 await f.api.collabArtReviewSave({episodeNumber:1,baseVersion:0,writeId:'different-author',data:approved(1)});f.saveCalls.length=0;
 await f.store.load(f.project);await assert.rejects(f.store.publish(1,['1-1']),/其他核实修改/);
 assert.equal(f.saveCalls[0].baseVersion,0);assert.equal(f.saveCalls[0].writeId,'legacy-id');assert.equal(f.publishCalls.length,0);
 assert.deepEqual(f.disk.episodes[1].scenes,local.scenes);assert.equal(f.disk.episodes[1].pending,true);assert.equal(f.disk.episodes[1].version,0);
 await f.store.load(f.project);assert.deepEqual(f.disk.episodes[1].scenes,local.scenes);assert.match(f.disk.episodes[1].syncError,/其他核实修改/);
 await f.store.useCloud(1,f.project);assert.ok(f.disk.episodes[1].history.some(h=>h.previous?.writeId==='legacy-id'));
});

test('lost upload acknowledgement is replayed by write ID and refresh does not clear the local draft',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.loseSaveAck=true;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/上传回执丢失/);const writeId=f.disk.episodes[1].writeId;
 await f.store.load(f.project);assert.equal(f.disk.episodes[1].pending,true);assert.equal(f.disk.episodes[1].version,0);
 await f.store.publish(1,['1-2','1-1']);assert.equal(f.saveCalls.length,2);assert.equal(f.saveCalls[0].writeId,writeId);assert.equal(f.saveCalls[1].writeId,writeId);
 assert.equal(f.project.analysis_progress[1].review.version,2);assert.equal(f.project.assets.length,1);assert.equal(f.disk.episodes[1].pending,false);
});

test('lost publication acknowledgement uses the persisted publication ID, including after periodic refresh',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.losePublishAck=true;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/发布回执丢失/);
 const request=structuredClone(f.disk.episodes[1].publishRequest);await f.store.load(f.project);
 assert.equal(f.disk.episodes[1].pending,true);await f.store.publish(1,['1-2','1-1']);
 assert.equal(f.saveCalls.length,1);assert.equal(f.publishCalls.length,2);assert.ok(f.publishCalls.every(p=>p.writeId===request.writeId&&p.baseVersion===request.uploadedVersion));
 assert.equal(f.project.analysis_progress[1].review.version,2);assert.equal(f.project.assets.length,1);assert.equal(f.disk.episodes[1].pending,false);
});

test('publication retry after reopening loads the durable request and preserves a lost acknowledgement',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.losePublishAck=true;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/发布回执丢失/);const request=structuredClone(f.disk.episodes[1].publishRequest);
 const {getArtReviewStore:reopenedFactory}=await import(`./artReviewPersistence.js?restart=${crypto.randomUUID()}`);
 const reopened=reopenedFactory({api:f.api,projectId:f.project.id,accountId:f.accountId});await reopened.load(f.project);
 assert.equal(reopened.snapshot().episodes[1].pending,true);await reopened.publish(1,['1-1','1-2']);
 assert.equal(f.saveCalls.length,1);assert.ok(f.publishCalls.every(p=>p.writeId===request.writeId));assert.equal(f.project.analysis_progress[1].review.version,2);assert.equal(f.disk.episodes[1].pending,false);
});

test('changing requested scenes first resolves the old durable publication before publishing the new selection',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.losePublishAck=true;
 await assert.rejects(f.store.publish(1,['1-1']),/发布回执丢失/);const request=structuredClone(f.disk.episodes[1].publishRequest);
 await f.store.publish(1,['1-2']);assert.equal(f.saveCalls.length,1);assert.equal(f.publishCalls.length,3);
 assert.equal(f.publishCalls[1].writeId,request.writeId);assert.deepEqual(f.publishCalls[1].sceneIds,['1-1']);assert.deepEqual(f.publishCalls[2].sceneIds,['1-2']);
 assert.equal(summarizeArtReview(f.disk).published,1);assert.equal(f.disk.episodes[1].cloudReceipt,undefined);
});

test('local edits after lost upload acknowledgement retain the original payload and publish the newer draft without self-conflict',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.loseSaveAck=true;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/上传回执丢失/);const receipt=structuredClone(f.disk.episodes[1].cloudReceipt);
 await f.store.update(1,r=>revise(r,'最新蓝色灯罩台灯'));await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));
 const latestWrite=f.disk.episodes[1].writeId;assert.equal(f.saveCalls.length,1);assert.equal(f.publishCalls.length,0);assert.deepEqual(f.disk.episodes[1].cloudReceipt,receipt);
 await f.store.publish(1,['1-1','1-2']);
 assert.equal(f.saveCalls.length,3);assert.equal(f.saveCalls[1].writeId,receipt.params.writeId);assert.deepEqual(f.saveCalls[1].data,receipt.params.data);
 assert.equal(f.saveCalls[2].writeId,latestWrite);assert.equal(f.saveCalls[2].baseVersion,1);assert.equal(f.disk.episodes[1].version,3);
 assert.equal(f.disk.episodes[1].scenes[0].items[0].description,'最新蓝色灯罩台灯');assert.equal(f.disk.episodes[1].rawOutput,'最新模型完整回包');assert.equal(f.disk.episodes[1].generation.taskId,'new-local-task');
 assert.equal(f.project.assets[0].description,'最新蓝色灯罩台灯');assert.equal(f.disk.episodes[1].pending,false);assert.equal(f.disk.episodes[1].cloudReceipt,undefined);
});

test('local edits after lost publication acknowledgement recover the old cloud version and publish current approved scenes',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.losePublishAck=true;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/发布回执丢失/);const receipt=structuredClone(f.disk.episodes[1].cloudReceipt);
 await f.store.update(1,r=>revise(r,'更新后的红色台灯'));await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));
 const latestWrite=f.disk.episodes[1].writeId;assert.equal(f.saveCalls.length,1);assert.equal(f.publishCalls.length,1);assert.deepEqual(f.disk.episodes[1].cloudReceipt,receipt);
 await f.store.publish(1,['1-1','1-2']);
 assert.equal(f.publishCalls.length,3);assert.equal(f.publishCalls[1].writeId,receipt.params.writeId);assert.equal(f.publishCalls[1].baseVersion,1);assert.equal(f.publishCalls[2].baseVersion,3);
 assert.equal(f.saveCalls.length,2);assert.equal(f.saveCalls[1].writeId,latestWrite);assert.equal(f.saveCalls[1].baseVersion,2);assert.equal(f.disk.episodes[1].version,4);
 assert.equal(f.disk.episodes[1].rawOutput,'最新模型完整回包');assert.equal(f.disk.episodes[1].published['1-1'].items[0].description,'更新后的红色台灯');assert.equal(f.disk.episodes[1].scenes[0].items[0].note,'最新本地补充');
 assert.equal(f.disk.episodes[1].pending,false);assert.equal(f.disk.episodes[1].cloudReceipt,undefined);
});

test('cloud receipt survives post-ack disk failure, later local edits and reopening for either save or publish',async()=>{
 for(const kind of ['save','publish']){
  const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));
  f.failLocal=data=>kind==='save'?Boolean(data.episodes[1].uploadedWriteId):data.episodes[1].pending===false;
  await assert.rejects(f.store.publish(1,['1-1','1-2']),/本地资料写入失败/);const receipt=structuredClone(f.disk.episodes[1].cloudReceipt);assert.equal(receipt.kind,kind);
  f.failLocal=null;await f.store.update(1,r=>revise(r,`重启后${kind}草稿的绿色台灯`));await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));
  const callsBefore=f.saveCalls.length+f.publishCalls.length;
  const {getArtReviewStore:factory}=await import(`./artReviewPersistence.js?edited-restart=${crypto.randomUUID()}`);
  const reopened=factory({api:f.api,projectId:f.project.id,accountId:f.accountId});await reopened.load(f.project);
  assert.deepEqual(reopened.snapshot().episodes[1].cloudReceipt,receipt);assert.equal(f.saveCalls.length+f.publishCalls.length,callsBefore);
  await reopened.publish(1,['1-1','1-2']);
  assert.equal(f.disk.episodes[1].scenes[0].items[0].description,`重启后${kind}草稿的绿色台灯`);assert.equal(f.disk.episodes[1].pending,false);assert.equal(f.disk.episodes[1].cloudReceipt,undefined);
  assert.equal(f.disk.episodes[1].version,kind==='save'?3:4);
 }
});

test('failure saving a recovered acknowledgement keeps both the latest draft and original receipt for retry',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.loseSaveAck=true;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/上传回执丢失/);
 await f.store.update(1,r=>revise(r,'回执恢复后仍保留的黄色台灯'));await f.store.update(1,r=>editArtReview(r,{type:'approve-episode'}));const before=structuredClone(f.disk);
 f.failLocal=data=>data.episodes[1].version===1;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/本地资料写入失败/);assert.deepEqual(f.disk,before);assert.deepEqual(f.store.snapshot(),before);assert.equal(f.publishCalls.length,0);
 f.failLocal=null;await f.store.publish(1,['1-1','1-2']);assert.equal(f.disk.episodes[1].version,3);assert.equal(f.disk.episodes[1].published['1-1'].items[0].description,'回执恢复后仍保留的黄色台灯');
 assert.equal(f.saveCalls.length,4);assert.equal(f.saveCalls[0].writeId,f.saveCalls[2].writeId);
});

test('local persistence failure before publication causes no cloud calls',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));const before=structuredClone(f.disk);f.failLocal=()=>true;
 await assert.rejects(f.store.publish(1,['1-1']),/本地资料写入失败/);assert.deepEqual(f.disk,before);assert.deepEqual(f.store.snapshot(),before);assert.equal(f.saveCalls.length,0);assert.equal(f.publishCalls.length,0);
});

test('local checkpoint failure after upload retains its prior version and can replay the uploaded write',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));
 f.failLocal=data=>Boolean(data.episodes[1].uploadedWriteId);
 await assert.rejects(f.store.publish(1,['1-1']),/本地资料写入失败/);
 assert.equal(f.disk.episodes[1].version,0);assert.deepEqual(f.store.snapshot(),f.disk);assert.equal(f.project.analysis_progress[1].review.version,1);assert.equal(f.publishCalls.length,0);
 f.failLocal=null;await f.store.publish(1,['1-1']);assert.equal(f.saveCalls[0].writeId,f.saveCalls[1].writeId);assert.equal(f.disk.episodes[1].version,2);
});

test('local checkpoint failure after publication keeps the request for an idempotent retry',async()=>{
 const f=fixture();await f.store.load(f.project);await f.store.update(1,()=>approved(1));f.failLocal=data=>data.episodes[1].pending===false;
 await assert.rejects(f.store.publish(1,['1-1','1-2']),/本地资料写入失败/);
 assert.equal(f.disk.episodes[1].pending,true);assert.equal(f.disk.episodes[1].version,1);assert.deepEqual(f.store.snapshot(),f.disk);assert.equal(f.project.analysis_progress[1].review.version,2);
 f.failLocal=null;await f.store.publish(1,['1-1','1-2']);assert.equal(f.saveCalls.length,1);assert.equal(f.publishCalls[0].writeId,f.publishCalls[1].writeId);assert.equal(f.disk.episodes[1].pending,false);
});

test('store cache and local records remain isolated by account and project',async()=>{
 const projectId=crypto.randomUUID(),a=fixture({projectId,accountId:'account-a'}),b=fixture({projectId,accountId:'account-b'}),c=fixture({accountId:'account-a'});
 await Promise.all([a.store.load(a.project),b.store.load(b.project),c.store.load(c.project)]);
 await a.store.update(1,()=>generated(1));assert.equal(a.disk.episodes[1].status,'generated');assert.equal(b.disk.episodes[1].status,'empty');assert.equal(c.disk.episodes[1].status,'empty');assert.notEqual(a.store,b.store);
});

test('uploaded or partial reviews are not counted as fully published episodes',()=>{
 const r=approved(1),ledger={episodes:{1:{...r,pending:false,version:1}}};
 assert.equal(summarizeArtReview(ledger).published,0);assert.equal(summarizeArtReview(ledger).pending,1);
 ledger.episodes[1].published['1-1']={...r.scenes[0],signature:reviewSceneSignature(r.scenes[0])};assert.equal(summarizeArtReview(ledger).published,0);
 ledger.episodes[1].published['1-2']={...r.scenes[1],signature:reviewSceneSignature(r.scenes[1])};assert.equal(summarizeArtReview(ledger).published,1);
 ledger.episodes[1].pending=true;assert.equal(summarizeArtReview(ledger).published,0);assert.equal(summarizeArtReview(ledger).pending,1);
});

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
for(const phase of ['save','publish'])test(`local review stays responsive during slow cloud ${phase}; newer draft survives acknowledgement`,async()=>{
 const f=fixture({count:2});await f.store.load(f.project);await f.store.update(1,()=>approved(1));await f.store.update(2,()=>generated(2));
 const method=phase==='save'?'collabArtReviewSave':'collabArtReviewPublish',original=f.api[method],started=deferred(),release=deferred();
 f.api[method]=async p=>{started.resolve();await release.promise;return original(p);};
 const before=structuredClone(f.store.snapshot().episodes[1]),publishing=f.store.publish(1,['1-1','1-2']);await started.promise;
 try{
  await Promise.race([f.store.update(1,r=>editArtReview(revise(r,'并发审阅后的蓝色台灯'),{type:'approve-episode'})),new Promise((_,reject)=>setTimeout(()=>reject(Error('local edit blocked by cloud')),500))]);
  await f.store.updateMany([{number:2,reduce:r=>editArtReview(r,{type:'approve-episode'})}]);
  assert.equal(f.disk.episodes[1].scenes[0].items[0].description,'并发审阅后的蓝色台灯');assert.ok(f.disk.episodes[2].scenes.every(s=>s.approval));
 }finally{release.resolve();}
 await publishing;
 assert.equal(f.disk.episodes[1].pending,true);assert.equal(f.disk.episodes[1].scenes[0].items[0].description,'并发审阅后的蓝色台灯');
 assert.equal(f.disk.episodes[1].published['1-1'].items[0].description,before.scenes[0].items[0].description);
 await f.store.publish(1,['1-1','1-2']);assert.equal(f.disk.episodes[1].pending,false);
});
test('bulk local approval is atomic and preserves all drafts when the disk fails',async()=>{
 const f=fixture({count:2});await f.store.load(f.project);for(const n of [1,2])await f.store.update(n,()=>generated(n));
 const before=structuredClone(f.disk),writes=f.localWrites.length;f.failLocal=()=>true;
 const changes=[1,2].map(number=>({number,reduce:r=>editArtReview(r,{type:'approve-episode'})}));
 await assert.rejects(f.store.updateMany(changes),/本地资料写入失败/);assert.deepEqual(f.store.snapshot(),before);
 f.failLocal=null;await f.store.updateMany(changes);assert.equal(f.localWrites.length,writes+2);assert.ok([1,2].every(n=>f.disk.episodes[n].scenes.every(s=>s.approval)));assert.equal(f.saveCalls.length,0);
});

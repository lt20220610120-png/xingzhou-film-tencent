const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {deleteProjectVideos}=require('./project-video-delete.cjs');const {createGenerationJobs}=require('./generation-jobs.cjs');
test('project deletion is scoped, deduplicated, keeps active receipts and physical files, and remains hidden after completion',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-delete-video-'));try{
  const file=path.join(dir,'generation-jobs.json'),clip=path.join(dir,'clip.mp4');fs.writeFileSync(clip,'keep-video');
  const initial=[{id:'active',projectId:'p',kind:'video',status:'submitted',jobId:'upstream'},{id:'done',projectId:'p',kind:'video',status:'success',mediaId:'cloud',filePath:clip},{id:'other',projectId:'q',kind:'video',status:'success'}];fs.writeFileSync(file,JSON.stringify(initial));const store=createGenerationJobs(dir),deleted=[];
  const options={project:{id:'p',myRole:'producer'},jobs:store.list({includeArchived:true}),media:[{id:'cloud',kind:'video',projectId:'p'}],deleteMedia:async p=>deleted.push(p.mediaId),hideJobs:p=>store.hideProjectVideos(p)};
  const result=await deleteProjectVideos({...options,ids:[{jobId:'active'},{jobId:'done'},{mediaId:'cloud'},{jobId:'other'}]});assert.equal(result.removed,2);assert.equal(result.errors.length,1);assert.deepEqual(deleted,['cloud']);assert.equal(fs.readFileSync(clip,'utf8'),'keep-video');assert.deepEqual(store.list().map(j=>j.id),['other']);const active=store.list({includeArchived:true}).find(j=>j.id==='active');assert(active.projectVideoDeleted);assert.equal(active.jobId,'upstream');
  await assert.rejects(deleteProjectVideos({...options,project:{id:'p',myRole:'producer',locked:true},ids:[{jobId:'done'}]}),/锁定/);await assert.rejects(deleteProjectVideos({...options,project:{id:'p',myRole:'viewer'},ids:[{jobId:'done'}]}),/权限/);
  const {projectVideoRows}=await import('../core/projectVideoPool.js');assert.deepEqual(projectVideoRows({id:'p',episodes:[]},store.list({includeArchived:true}),[{id:'cloud',kind:'video',note:'[shot:s]'}]),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('cloud deletion failure does not hide the local record and account guard stops destructive work',async()=>{
 let hidden=0,calls=0;const options={project:{id:'p',myRole:'producer'},ids:[{jobId:'a'}],jobs:[{id:'a',projectId:'p',kind:'video',mediaId:'m'}],media:[{id:'m',kind:'video'}],deleteMedia:async()=>{calls++;throw Error('网络失败');},hideJobs:()=>hidden++};
 let result=await deleteProjectVideos(options);assert.equal(result.removed,0);assert.equal(hidden,0);assert.equal(calls,1);
 result=await deleteProjectVideos({...options,guard:()=>{throw Error('账号已切换')}});assert.equal(result.removed,0);assert.equal(calls,1);assert.equal(hidden,0);
});
test('deleting during a remote query cannot revive the receipt after the original task completes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-delete-live-'));try{
  fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([{id:'a',projectId:'p',kind:'video',provider:'likeai',status:'submitted',jobId:'original'}]));
  let release,started;const ready=new Promise(r=>started=r);const store=createGenerationJobs(dir,{likeService:{submit:async()=>{throw Error('never resubmit');},query:async()=>{started();return new Promise(r=>release=r);},download:async()=>({filePath:path.join(dir,'completed.mp4')})}});
  const query=store.refresh({id:'a'});await ready;store.hideProjectVideos({projectId:'p',ids:['a']});release({status:'success',taskId:'original'});await query;
  assert.deepEqual(store.list(),[]);const receipt=store.list({includeArchived:true})[0];assert.equal(receipt.status,'success');assert(receipt.projectVideoDeleted);assert(receipt.archived);assert.equal(receipt.jobId,'original');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

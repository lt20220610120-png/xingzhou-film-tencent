const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('sharing selected videos handles partial failure, skips duplicates and stops on account change',async()=>{
 const {shareProjectVideos}=require('./video-sharing.cjs'),calls=[];
 const share=async({owner,projectId,jobId})=>{
  assert.equal(owner,'member');assert.equal(projectId,'project');calls.push(jobId);
  if(jobId==='missing')throw Error('文件不存在');
  return {id:'media-'+jobId};
 };
 const result=await shareProjectVideos({owner:'member',projectId:'project',jobIds:['first','missing','first','last'],share});
 assert.deepEqual(calls,['first','missing','last']);
 assert.deepEqual(result,{shared:[{jobId:'first',mediaId:'media-first'},{jobId:'last',mediaId:'media-last'}],errors:[{jobId:'missing',message:'文件不存在'}]});
 const controller=new AbortController();
 await assert.rejects(shareProjectVideos({owner:'member',projectId:'project',jobIds:['first','last'],signal:controller.signal,share:async({jobId})=>{
  assert.equal(jobId,'first');controller.abort();return {id:'media'};
 }}),{name:'AbortError'});
});
test('ordinary video results are persisted as links without fetching the video; explicit automation still downloads',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-link-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let posts=0,downloads=0;
 t.mock.method(global,'fetch',async(url,init)=>{if(init?.method==='POST'){posts++;return Response.json({video_url:'https://cdn.test/movie.mp4'});}downloads++;return new Response('video',{headers:{'content-type':'video/mp4'}});});
 const jobs=require('./generation-jobs.cjs').createGenerationJobs(dir),input={kind:'video',endpoint:'https://provider.test/v1',apiKey:'fixture',model:'model',prompt:'test',duration:5,videoProtocol:'videos-json'};
 const link=await jobs.submit(input);assert.equal(link.status,'success');assert.equal(link.url,'https://cdn.test/movie.mp4');assert.equal(link.filePath,undefined);assert.equal(downloads,0);
 const restored=require('./generation-jobs.cjs').createGenerationJobs(dir).list()[0];assert.equal(restored.url,link.url);
 const local=await jobs.submit({...input,autoDownload:true});assert.equal(fs.readFileSync(local.filePath,'utf8'),'video');assert.equal(downloads,1);assert.equal(posts,2);
});
test('explicit sharing downloads once, preserves local recovery and reconciles an uncertain upload record',async()=>{
 let downloaded=0,uploaded=0,local,mediaId;const rows=[],job={id:'j',projectId:'p',kind:'video',status:'success',url:'https://cdn.test/video',episode:1};
 const share=require('./video-sharing.cjs').createVideoSharing({getJob:()=>({...job,filePath:local,mediaId}),getProject:async()=>({myRole:'producer'}),guard:async()=>{},listMedia:async()=>rows,download:async()=>{downloaded++;return 'local.mp4';},saveLocal:async(_,f)=>{local=f;},markRecorded:async(_,id)=>{mediaId=id;},upload:async p=>{uploaded++;const row={...p,id:'media'};rows.push(row);throw Error('lost receipt');}});
 await assert.rejects(share({jobId:'j',projectId:'p'}),/lost receipt/);assert.equal(local,'local.mp4');
 const result=await share({jobId:'j',projectId:'p'});assert.equal(result.id,'media');assert.equal(downloaded,1);assert.equal(uploaded,1);assert.equal(mediaId,'media');
 await assert.rejects(share({jobId:'j',projectId:'other'}),/这个项目/);
});
test('sharing enforces project lock and permission before downloading',async()=>{
 for(const project of [{myRole:'viewer'},{myRole:'producer',locked:true}]){
 const share=require('./video-sharing.cjs').createVideoSharing({getJob:()=>({id:'j',projectId:'p',kind:'video',status:'success'}),getProject:async()=>project,guard:async()=>{},download:()=>assert.fail('must not download')});
 await assert.rejects(share({projectId:'p',jobId:'j'}),/锁定|权限/);
 }
});

test('another account cannot see a generated link until explicit cloud sharing',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-private-video-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 t.mock.method(global,'fetch',async()=>Response.json({video_url:'https://cdn.test/private.mp4'}));
 const {createGenerationJobs}=require('./generation-jobs.cjs'),owner=createGenerationJobs(path.join(root,'owner')),guest=createGenerationJobs(path.join(root,'guest'));
 const job=await owner.submit({projectId:'p',kind:'video',endpoint:'https://provider.test/v1',apiKey:'fixture',model:'model',prompt:'test',duration:5,videoProtocol:'videos-json'}),cloud=[];
 assert.equal(job.status,'success');assert.equal(guest.list().length,0);assert.equal(cloud.length,0);
 const share=require('./video-sharing.cjs').createVideoSharing({getJob:()=>job,getProject:async()=>({myRole:'collaborator'}),guard:async()=>{},listMedia:async()=>cloud,download:async()=>path.join(root,'result.mp4'),saveLocal:async()=>{},markRecorded:async()=>{},upload:async p=>{const media={id:'shared',projectId:p.projectId,url:'https://cloud.test/shared.mp4'};cloud.push(media);return media}});
 await share({jobId:job.id,projectId:'p'});assert.equal(cloud.length,1);assert.equal(cloud[0].url,'https://cloud.test/shared.mp4');assert.equal(guest.list().length,0);
});

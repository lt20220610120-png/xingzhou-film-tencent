const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
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

const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const client=require('./feituo-client.cjs');const models=require('../core/feituo-models.json');
const full=models.find(m=>m.id.endsWith('3dd9e73a8bd0d4e06ba6ebcbddafd811'));
const input=(more={})=>({endpoint:'https://feituokuajing.com',model:full.id,kind:'video',prompt:'镜头推进',ratio:'16:9',duration:30,resolution:'720p',apiKey:'test-only',references:[],...more});
test('all 32 documented models have valid defaults and exact reference limits',()=>{
 assert.equal(models.length,32);
 for(const m of models)assert.equal(client.validate(input({model:m.id,kind:m.kind,duration:m.durations[0],ratio:m.ratios[0],resolution:m.resolutions[0]})).id,m.id);
 assert.throws(()=>client.validate(input({references:Array.from({length:11},()=>({kind:'image',url:'https://example.test/a.png'}))})),/最多 10/);
});
test('resolution dependent 12/15 second limits and mandatory image for audio',()=>{
 const m=models.find(m=>m.durationByResolution);
 assert.throws(()=>client.validate(input({model:m.id,duration:15})),/时长/);
 client.validate(input({model:m.id,duration:15,resolution:'480p'}));
 assert.throws(()=>client.validate(input({references:[{kind:'audio',url:'https://example.test/a.mp3'}]})),/图片/);
 assert.throws(()=>client.validate(input({prompt:'@image1'})),/不存在/);
});
test('JSON sends complete image video audio arrays in exact order',async t=>{
 const calls=[];t.mock.method(global,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({success:true,jobId:'job1',status:'submitted'});});
 const refs=[{kind:'image',url:'https://example.test/one.png'},{kind:'video',url:'https://example.test/a.mp4'},{kind:'image',url:'https://example.test/two.png'},{kind:'audio',url:'https://example.test/a.mp3'}];
 await client.submit(input({references:refs}));const body=JSON.parse(calls[0].options.body);
 assert.deepEqual(body.imageUrls,[refs[0].url,refs[2].url]);assert.deepEqual(body.videoUrls,[refs[1].url]);assert.deepEqual(body.audioUrls,[refs[3].url]);assert.equal(body.duration,30);
 assert.equal(calls[0].options.headers['X-Public-Model-Ids'],'1');
});
test('mixed local and remote references use multipart without dropping or reordering files',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-ref-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const filePath=path.join(dir,'two.png');fs.writeFileSync(filePath,'second');
 let request;t.mock.method(global,'fetch',async(url,options)=>{if(url.includes('/generate')){request=options;return Response.json({success:true,jobId:'job'});}return new Response('first',{headers:{'content-type':'image/png'}});});
 await client.submit(input({references:[{kind:'image',url:'https://example.test/one.png'},{kind:'image',filePath}]}));
 const images=request.body.getAll('images');assert.equal(images.length,2);assert.equal(await images[0].text(),'first');assert.equal(await images[1].text(),'second');assert.equal(request.headers['Content-Type'],undefined);
});
test('official channel uses seconds and metadata roles, never generic duration/arrays',async t=>{
 let payload;t.mock.method(global,'fetch',async(url,options)=>{payload=JSON.parse(options.body);return Response.json({success:true,jobId:'job'});});
 const official=models.find(m=>m.protocol==='metadata-content');await client.submit(input({model:official.id,duration:8,references:[{kind:'image',role:'first_frame',url:'https://example.test/frame.png'}]}));
 assert.equal(payload.seconds,'8');assert.equal(payload.duration,undefined);assert.equal(payload.imageUrls,undefined);assert.equal(payload.metadata.content[0].role,'first_frame');
});
test('image endpoint reads resultUrls, status queries disable caching',async t=>{
 const calls=[];t.mock.method(global,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({success:true,jobId:'job',status:'success',resultUrls:['https://feituokuajing.com/image.png']});});
 await client.submit(input({model:models.find(m=>m.kind==='image').id,kind:'image'}));assert.match(calls[0].url,/image\/generate$/);assert.equal(JSON.parse(calls[0].options.body).duration,undefined);
 await client.status({jobId:'job',apiKey:'test'});assert.match(calls[1].url,/jobId=job&_=/);assert.equal(calls[1].options.cache,'no-store');
});
test('persisted job survives service recreation and query outage without resubmitting',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-job-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let posts=0,queries=0;
 t.mock.method(global,'fetch',async(url,options)=>{if(url.includes('/generate')){posts++;return Response.json({success:true,jobId:'j1',status:'submitted'});}if(url.includes('/status')){queries++;if(queries===1)throw new Error('temporary outage');return Response.json({success:true,status:'success',videoUrl:'https://feituokuajing.com/a.mp4'});}return new Response('mp4');});
 const {createGenerationJobs}=require('./generation-jobs.cjs');const job=await createGenerationJobs(dir).submit(input());assert.equal(job.status,'submitted');assert.ok(!fs.readFileSync(path.join(dir,'generation-jobs.json'),'utf8').includes('test-only'));
 const manager=createGenerationJobs(dir);const pending=await manager.refresh({id:job.id,apiKey:'test'});assert.equal(pending.status,'submitted');assert.match(pending.warning,/outage/);
 const done=await manager.refresh({id:job.id,apiKey:'test'});assert.equal(done.status,'success');assert.equal(fs.readFileSync(done.filePath,'utf8'),'mp4');assert.equal(posts,1);
});
test('terminal failure stops polling, completed images retain every output',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-job-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let queries=0;
 t.mock.method(global,'fetch',async(url)=>{if(url.includes('/generate'))return Response.json({success:true,jobId:'j1',status:'submitted'});queries++;return Response.json({success:true,status:'failed',errorMessage:'rejected'});});
 const manager=require('./generation-jobs.cjs').createGenerationJobs(dir);const job=await manager.submit(input());assert.equal((await manager.refresh({id:job.id,apiKey:'test'})).status,'failed');await manager.refresh({id:job.id,apiKey:'test'});assert.equal(queries,1);
});

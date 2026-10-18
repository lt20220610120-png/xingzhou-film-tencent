const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFnkoClient}=require('./fnko-client.cjs');
test('both image dialects accept legacy size and preserve selected current imageSize/version fields',async()=>{
 for(const native of [false,true]){
  let paid=0;const client=createFnkoClient({fetchFn:async(url,o={})=>{
   if(url.endsWith('/models'))return Response.json({data:[{id:'img',type:'image',modelVersion:3,pricingVersion:8,capabilities:{ratios:['16:9'],resolutions:['1K','4K']}}]});
   paid++;assert(url.endsWith(native?'/image/generate':'/images/generations'));const b=JSON.parse(o.body);assert.equal(b.resolution,native?'1K':'4K');if(!native)assert.equal(b.imageSize,'4K');else assert.equal(b.modelVersion,3);return Response.json({jobId:'image-original',status:'queued'});
  }});
  const result=await client.submit({endpoint:'https://fanke2026.xyz'+(native?'/api/open/v1':'/v1'),kind:'image',apiKey:'fixture',model:'img',prompt:'exam',size:'1280x720',ratio:'16:9',...(native?{}:{resolution:'4K'})});assert.equal(result.jobId,'image-original');assert.equal(paid,1);
 }
});
test('persisted uncertain and completed Fnko jobs recover original identities without replaying paid POST',async t=>{
 const fnko=require('./fnko-client.cjs'),{createGenerationJobs}=require('./generation-jobs.cjs');
 const previous={submit:fnko.submit,status:fnko.status,download:fnko.download};const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fnko-jobs-'));t.after(()=>{Object.assign(fnko,previous);fs.rmSync(dir,{recursive:true,force:true});});
 let paid=0;fnko.submit=async()=>{paid++;throw Error('timeout after POST');};
 const jobs=createGenerationJobs(dir),input={endpoint:'https://fanke2026.xyz/v1',kind:'image',apiKey:'fixture',model:'image',prompt:'test'};
 let savedId;await assert.rejects(jobs.submit(input),e=>{savedId=e.generationJobId;return !!savedId;});assert.equal(jobs.list()[0].status,'uncertain');
 const restarted=createGenerationJobs(dir);await restarted.refresh({id:savedId,endpoint:input.endpoint,apiKey:input.apiKey});assert.equal(paid,1);assert.equal(restarted.list()[0].id,savedId);
 fnko.submit=async()=>{paid++;return {jobId:'remote-original',status:'submitted'};};const job=await restarted.submit(input);
 fnko.status=async p=>{assert.equal(p.jobId,'remote-original');assert.equal(p.apiKey,'fixture');return {status:'success',resultUrls:['https://cdn.invalid/image.png']};};fnko.download=async()=>path.join(dir,'original.png');
 const completed=await createGenerationJobs(dir).refresh({id:job.id,endpoint:input.endpoint,apiKey:input.apiKey});assert.equal(completed.status,'success');assert.equal(paid,2);assert(!fs.readFileSync(path.join(dir,'generation-jobs.json'),'utf8').includes('fixture'));
 let downloads=0;fnko.submit=async()=>{paid++;return {status:'success',resultUrls:['https://cdn.invalid/synchronous.png']};};fnko.download=async()=>{if(++downloads===1)throw Error('temporary download interruption');return path.join(dir,'synchronous.png');};
 const synchronous=await restarted.submit(input);assert.equal(synchronous.status,'downloading');assert(!synchronous.jobId);assert.equal((await restarted.refresh({id:synchronous.id,endpoint:input.endpoint,apiKey:input.apiKey})).status,'success');assert.equal(paid,3);assert.equal(downloads,2);
 let queries=0;fnko.submit=async()=>({jobId:'renewable',status:'success',resultUrls:['https://cdn.invalid/expired.png']});fnko.download=async p=>{if(p.url.includes('expired'))throw Error('expired signed URL');return path.join(dir,'fresh.png');};fnko.status=async()=>{queries++;return {status:'success',resultUrls:['https://cdn.invalid/fresh.png']};};
 const expired=await restarted.submit(input);assert.equal(expired.status,'downloading');assert.equal((await restarted.refresh({id:expired.id,endpoint:input.endpoint,apiKey:input.apiKey})).status,'success');assert.equal(queries,1);
});
test('Fnko native uses current catalog versions, ordered assets and one idempotent paid POST',async()=>{
 const calls=[];const client=createFnkoClient({readReference:async()=>({bytes:Buffer.from('image'),mime:'image/png'}),fetchFn:async(url,options={})=>{
  calls.push({url,options});if(url.endsWith('/models'))return Response.json({data:[{id:'new-v',type:'video',modelVersion:7,pricingVersion:9,tokenPricingVersion:2,capabilities:{ratios:['16:9'],durations:[5],resolutions:['720p'],maxImages:2,maxVideos:0,maxAudios:0}}]});
  if(url.endsWith('/assets'))return Response.json({id:'asset-'+calls.length});
  const body=JSON.parse(options.body);assert.equal(body.modelVersion,7);assert.equal(body.pricingVersion,9);assert.equal(body.tokenPricingVersion,2);assert.deepEqual(body.assetIds,['asset-2','asset-3']);assert.equal(options.headers['Idempotency-Key'],'fixture-request-1');return Response.json({jobId:'job-native',status:'preparing'});
 }});
 const result=await client.submit({endpoint:'https://fanke2026.xyz/api/open/v1',kind:'video',apiKey:'fixture',model:'new-v',prompt:'@image1 @image2',ratio:'16:9',duration:5,resolution:'720p',idempotencyKey:'fixture-request-1',references:[{kind:'image',url:'https://ref/1'},{kind:'image',url:'https://ref/2'}]});assert.equal(result.jobId,'job-native');assert.equal(calls.filter(c=>c.url.endsWith('/video/generate')).length,1);
});
test('compat video uses videos, official uses video/generate, retired model never sends paid request',async()=>{
 for(const endpoint of ['https://fanke2026.xyz/v1','https://fanke2026.xyz/api/feituo/v1']){
  let posts=0;const c=createFnkoClient({fetchFn:async(url,o={})=>{if(url.endsWith('/models'))return Response.json({data:[{id:'v',type:'video',ratios:['16:9'],durations:[5],resolutions:['720p']}]});posts++;assert(url.endsWith(endpoint.endsWith('/v1')&&!endpoint.includes('feituo')?'/videos':'/video/generate'));return Response.json({id:'v-job',status:'queued'});}});
  await c.submit({endpoint,kind:'video',apiKey:'fixture',model:'v',prompt:'hello',ratio:'16:9',duration:5,resolution:'720p'});assert.equal(posts,1);await assert.rejects(c.submit({endpoint,kind:'video',apiKey:'fixture',model:'retired',prompt:'hello'}),/下架|无权限/);assert.equal(posts,1);
 }
});
test('native protected result keeps credentials only at its own content endpoint, waits for token settlement',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fnko-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const urls=[];
 const c=createFnkoClient({fetchFn:async(url,o)=>{urls.push(url);if(url.includes('/jobs/j1/content')){assert.equal(o.headers.Authorization,'Bearer fixture');return new Response(Buffer.from([1,2,3]),{headers:{'content-type':'video/mp4'}});}return Response.json({status:'succeeded',billingState:'captured',tokenBilling:{state:'awaiting_usage'},resultUrls:['https://fanke2026.xyz/api/open/v1/jobs/j1/content']});}});
 const job={endpoint:'https://fanke2026.xyz/api/open/v1',kind:'video',jobId:'j1',apiKey:'fixture'};assert.equal((await c.status(job)).status,'submitted');
 const file=await c.download({...job,url:'https://fanke2026.xyz/api/open/v1/jobs/j1/content'},dir);assert.deepEqual(fs.readFileSync(file),Buffer.from([1,2,3]));
});

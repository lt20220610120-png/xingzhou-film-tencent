const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createGenerationJobs}=require('./generation-jobs.cjs');
global.fetch=async()=>{throw Error('Test forbids production network calls');};
test('preparing LibTV references has no node to poll and is kept separate from official generation failure',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-receipt-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([
  {id:'preparing',provider:'libtv',status:'submitting',kind:'video'},
  {id:'sent',provider:'libtv',status:'submitted',kind:'video',libtvNodeId:'n',libtvProjectId:'p'},
 ]));
 let reads=0;
 const jobs=createGenerationJobs(dir,{libtvService:{query:async()=>{
  reads++;return{data:{taskInfo:{status:'3',failedReason:'模型拒绝该请求 https://example.test/file?token=private Bearer hidden123'}}};
 }}});
 assert.equal((await jobs.refresh({id:'preparing'})).status,'submitting');
 assert.equal(reads,0);
 const failed=await jobs.refresh({id:'sent'});
 assert.equal(failed.status,'failed');
 assert.match(failed.error,/LibTV 生成失败 · 模型拒绝该请求/);
 assert.doesNotMatch(failed.error,/https:|private|hidden123/);
 assert.equal(reads,1);
});
test('official query taskInfo numeric failure is terminal and never downloads placeholders',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-status-'));fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([{id:'j',provider:'libtv',status:'submitted',kind:'video',libtvNodeId:'n',libtvProjectId:'p'}]));const jobs=createGenerationJobs(dir,{libtvService:{query:async()=>({nodeKey:'n',data:{taskInfo:{loading:false,status:3,failedReason:'model failed'},url:[]}}),download:async()=>{throw Error('must not download failed');}}});assert.equal((await jobs.refresh({id:'j',accountId:'user'})).status,'failed');});
const input={provider:'libtv',kind:'video',endpoint:'https://www.liblib.tv',model:'video',prompt:'隔离测试',accountId:'fixture',projectId:'p',shotId:'s'};
test('a preparing LibTV request is visible only to internal batch dedupe, and a reference failure preserves historical rows',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-hidden-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const historical={id:'older',provider:'libtv',status:'failed',submissionAttempted:false,kind:'video'};
 fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([historical]));
 const started=Promise.withResolvers(),prepare=Promise.withResolvers();
 const service={prepare:()=>{started.resolve();return prepare.promise;},run:async()=>assert.fail('paid run must not start')};
 const jobs=createGenerationJobs(dir,{libtvService:service});
 const requesting=jobs.submit(input);
 await started.promise;
 assert.deepEqual(jobs.list(),[historical]);
 assert.equal(jobs.list({includePreparing:true})[0].status,'submitting');
 await assert.rejects(jobs.submit(input),/正在准备/);
 const reason=Object.assign(Error('@audio2 上传参考素材失败（ECONNRESET） https://upload.example.invalid/path?token=root-private\nCookie: sid=fixture-session'),{code:'LIBTV_NETWORK'});
 prepare.reject(reason);
 await assert.rejects(requesting,error=>{
  assert.match(error.message,/@audio2 上传参考素材失败（ECONNRESET）/);
  assert.doesNotMatch(error.message,/upload\.example|root-private|fixture-session/);
  assert.equal(error.cause,undefined);
  return error.beforeSubmission&&error.code==='LIBTV_NETWORK';
 });
 assert.deepEqual(jobs.list({includePreparing:true}),[historical]);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'generation-jobs.json'),'utf8')),[historical]);
});
test('a LibTV run preflight failure returns the reason without creating a durable task',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-run-gate-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const jobs=createGenerationJobs(dir,{libtvService:{
  prepare:async()=>({jobId:'node',libtvNodeId:'node',libtvProjectId:'canvas'}),
  run:async()=>{throw Error('读取账号失败（TLS_TIMEOUT）');},
 }});
 await assert.rejects(jobs.submit(input),error=>/读取账号失败/.test(error.message)&&error.beforeSubmission);
 assert.deepEqual(jobs.list(),[]);
 assert.equal(fs.existsSync(path.join(dir,'generation-jobs.json')),false);
});
test('LibTV returns submitted job while official run is pending, downloads result and preserves project association',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-jobs-'));let finish,runs=0,downloads=0;
 const service={prepare:async()=>({jobId:'n',libtvNodeId:'n',libtvProjectId:'p',libtvOwnerKey:'o',libtvIdentity:'identity'}),run:async(_account,_task,{beforeRun})=>{beforeRun();runs++;return await new Promise(r=>finish=r);},download:async()=>{downloads++;const filePath=path.join(dir,'done.mp4');fs.writeFileSync(filePath,'video');return{filePath,files:[filePath]};},query:async()=>({data:{url:['https://cdn/result.mp4']}})};
 const jobs=createGenerationJobs(dir,{libtvService:service});const j=await jobs.submit({autoDownload:true,provider:'libtv',kind:'video',endpoint:'https://www.liblib.tv',model:'v',prompt:'x',accountId:'user',projectId:'collab',shotId:'shot'});
 assert.equal(j.status,'submitted');assert.equal(j.projectId,'collab');assert.equal(JSON.stringify(j).includes('accountId'),false);assert.equal(runs,1);
 await jobs.refresh({id:j.id,accountId:'user'});assert.equal(downloads,0,'do not independently poll/download while CLI runs');
 finish({});await new Promise(r=>setImmediate(r));assert.equal(jobs.list()[0].status,'success');assert.equal(downloads,1);assert.equal(runs,1);
});
test('restarted LibTV job recovery queries and downloads original node without --run',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-recovery-'));fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([{id:'j',provider:'libtv',status:'submitted',kind:'image',libtvNodeId:'n',libtvProjectId:'p'}]));let runs=0;
 const service={query:async()=>({nodes:[{nodeKey:'n',data:{url:['https://cdn/x.png']}}]}),run:async()=>runs++,download:async()=>({filePath:path.join(dir,'x.png')})};const jobs=createGenerationJobs(dir,{libtvService:service});const result=await jobs.refresh({id:'j',accountId:'user'});assert.equal(result.status,'success');assert.equal(runs,0);
});
test('download failure leaves identity recoverable and a retry never resubmits generation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-download-'));let fail=true,runs=0;const service={prepare:async()=>({libtvNodeId:'n',libtvProjectId:'p',jobId:'n'}),run:async(_account,_task,{beforeRun})=>{beforeRun();runs++;return{};},query:async()=>({data:{url:['https://cdn/x']}}),download:async()=>{if(fail)throw Error('下载失败');return{filePath:path.join(dir,'x.png')};}};const jobs=createGenerationJobs(dir,{libtvService:service});const j=await jobs.submit({autoDownload:true,provider:'libtv',kind:'image',endpoint:'https://www.liblib.tv',model:'m',prompt:'x',accountId:'user'});await new Promise(r=>setImmediate(r));assert.equal(jobs.list()[0].status,'downloading');fail=false;assert.equal((await jobs.refresh({id:j.id,accountId:'user'})).status,'success');assert.equal(runs,1);
});
test('restart does not mistake a newly created node placeholder for the paid result',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-placeholder-'));fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([{id:'j',provider:'libtv',status:'submitted',kind:'image',libtvNodeId:'n',libtvProjectId:'p',libtvInitialUrls:['https://cdn/placeholder.png']}]));let downloads=0;const jobs=createGenerationJobs(dir,{libtvService:{query:async()=>({data:{url:['https://cdn/placeholder.png']}}),download:async()=>{downloads++;return{filePath:'wrong.png'};}}});assert.equal((await jobs.refresh({id:'j',accountId:'user'})).status,'submitted');assert.equal(downloads,0);});

test('a scope change during provider preparation prevents the paid run itself',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-final-gate-'));let permitted=true,runs=0;const jobs=createGenerationJobs(dir,{beforeDispatch:async()=>{if(!permitted)throw Error('operator narrowed scope');},libtvService:{prepare:async()=>{permitted=false;return{jobId:'node',libtvNodeId:'node',libtvProjectId:'p'}},run:async()=>{runs++;return{};}}});await assert.rejects(jobs.submit({autoDownload:true,provider:'libtv',kind:'video',endpoint:'https://www.liblib.tv',model:'m',prompt:'test',accountId:'user'}),/operator narrowed scope/);assert.equal(runs,0);assert.deepEqual(jobs.list(),[]);fs.rmSync(dir,{recursive:true,force:true});});

test('a paid LibTV network failure only queries the original node during recovery',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-run-recovery-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let prepares=0,runs=0,reads=0;
 const service={
  prepare:async()=>{prepares++;return {jobId:'original',libtvNodeId:'original',libtvProjectId:'canvas'};},
  run:async(_account,_task,{beforeRun})=>{beforeRun();runs++;throw Object.assign(Error('模拟提交连接重置'),{code:'LIBTV_NETWORK',networkCode:'ECONNRESET'});},
  query:async(_account,job)=>{reads++;assert.equal(job.libtvNodeId,'original');return {data:{url:['https://cdn.example.invalid/result.mp4']}};},
 };
 const jobs=createGenerationJobs(directory,{libtvService:service});
 const job=await jobs.submit({provider:'libtv',kind:'video',endpoint:'https://www.liblib.tv',model:'video',prompt:'隔离测试',accountId:'fixture'});
 await assert.rejects(jobs.waitForCompletion(job.id),/原画布核对，不会自动重新生成/);
 assert.equal(jobs.list()[0].status,'submitted');
 const restarted=createGenerationJobs(directory,{libtvService:service});
 assert.equal((await restarted.refresh({id:job.id,accountId:'fixture'})).status,'success');
 assert.deepEqual({prepares,runs,reads},{prepares:1,runs:1,reads:1});
});

test('canvas-only submissions never run a node and recover its manually generated result after restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-draft-'));
 let runs=0,state='waiting',downloads=0;
 const service={
  prepare:async()=>({jobId:'node',libtvNodeId:'node',libtvProjectId:'canvas',libtvInitialUrls:['https://cdn/placeholder.mp4']}),
  run:async()=>{runs++;},
  query:async()=>({data:{taskInfo:{loading:state==='running'},url:[state==='done'?'https://cdn/generated.mp4':'https://cdn/placeholder.mp4']}}),
  download:async(_user,job)=>{assert.equal(job.libtvNodeId,'node');downloads++;return {filePath:path.join(dir,'generated.mp4')};},
 };
 try{
  const job=await createGenerationJobs(dir,{libtvService:service}).submit({autoDownload:true,provider:'libtv',kind:'video',endpoint:'https://www.liblib.tv',model:'m',prompt:'scene',libtvSubmissionMode:'canvas',accountId:'u'});
  assert.equal(job.remoteStatus,'awaiting-canvas');
  const restarted=createGenerationJobs(dir,{libtvService:service});
  const refresh=()=>restarted.refresh({id:job.id,accountId:'u'});
  assert.equal((await refresh()).remoteStatus,'awaiting-canvas');
  state='running';assert.equal((await refresh()).remoteStatus,'running');
  state='done';assert.equal((await refresh()).status,'success');
  assert.equal(downloads,1);assert.equal(runs,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

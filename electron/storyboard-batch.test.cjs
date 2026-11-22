const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture(t,overrides={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-sb-batch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const jobs=[],sent=[];let account='a';const mod=require('./storyboard-batch.cjs');const q=mod.createStoryboardBatchQueue({directory:dir,owner:()=>account,loadJobs:()=>jobs,guard:async()=>{},submit:async(item,run)=>{sent.push(item.shotId);const job={id:'j'+item.shotId,projectId:'p',shotId:item.shotId,storyboardBatchRunId:run.id,storyboardBatchItemId:item.id,status:'submitted'};jobs.push(job);return job;},...overrides});return {q,jobs,sent,dir,switchAccount:()=>account='b'};}
const items=()=>[1,2,3].map(n=>({shotId:'s'+n,label:`1-1-${n}`,value:{prompt:'原词'+n,references:[]}}));
test('settled queues roll over without removing an unresolved task or its original job',async t=>{
 const fixtureState=await fixture(t,{completedLimit:1});
 const {q,dir,jobs}=fixtureState;
 const begin=shotId=>q.start({projectId:'p',accountId:'a',items:[{shotId,label:shotId,value:{prompt:'test',references:[]}}]});
 const uncertain=begin('keep');await q.idle();jobs[0].status='uncertain';
 begin('first');await q.idle();jobs[1].status='success';
 const latest=begin('second');await q.idle();jobs[2].status='success';
 begin('trigger');await q.idle();
 const durable=JSON.parse(fs.readFileSync(path.join(dir,'batches.json'),'utf8'));
 assert(durable.some(run=>run.id===uncertain.id&&run.items[0].jobId==='jkeep'));
 assert(durable.some(run=>run.id===latest.id));
 assert(!durable.some(run=>run.items[0].shotId==='first'));
});
test('stop aborts the active batch request, and a retry receives a fresh signal',async t=>{
 let signal,started;
 const ready=new Promise(resolve=>started=resolve);
 const f=await fixture(t,{submit:async(_item,_run,currentSignal)=>{
  signal=currentSignal;started();
  if(!signal)return {id:'missing-signal',status:'submitted'};
  await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 }});
 const run=f.q.start({projectId:'p',accountId:'a',items:items()});
 await ready;
 assert.ok(signal);
 f.q.stop({id:run.id,accountId:'a'});
 assert.equal(signal.aborted,true);
 await f.q.idle();
 assert.equal(f.q.list({accountId:'a',projectId:'p'})[0].counts.stopped,3);
 const previous=signal;f.q.resume({id:run.id,accountId:'a'});await tick();
 assert.notEqual(signal,previous);assert.equal(signal.aborted,false);
 f.q.stopAll();await f.q.idle();assert.equal(signal.aborted,true);
});
test('interrupted submitting job remains uncertain after reconciliation and is never resumed',async t=>{const f=await fixture(t,{submit:async()=>new Promise(()=>{})});const r=f.q.start({projectId:'p',accountId:'a',items:items().slice(0,1)});await tick();const disk=JSON.parse(fs.readFileSync(path.join(f.dir,'batches.json'),'utf8')),item=disk[0].items[0];let sends=0;const recovered=require('./storyboard-batch.cjs').createStoryboardBatchQueue({directory:f.dir,owner:()=>'a',loadJobs:()=>[{id:'uncertain-original',status:'submitting',storyboardBatchRunId:r.id,storyboardBatchItemId:item.id}],guard:async()=>{},submit:async()=>{sends++;}});assert.equal(recovered.list({projectId:'p',accountId:'a'})[0].items[0].status,'uncertain');recovered.resume({id:r.id,accountId:'a'});await recovered.idle();assert.equal(sends,0);});
test('Fnko paid dispatch obeys the final batch stop/account guard',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-sb-fnko-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let paid=0;const fnko=require('./fnko-client.cjs');t.mock.method(fnko,'submit',async()=>{paid++;return {jobId:'paid',status:'submitted'}});const jobs=require('./generation-jobs.cjs').createGenerationJobs(dir,{beforeDispatch:async()=>{throw Error('批量已停止')}});await assert.rejects(jobs.submit({kind:'video',endpoint:'https://fanke2026.xyz',apiKey:'fixture',model:'video',prompt:'原词',storyboardBatchRunId:'r'}),/停止/);assert.equal(paid,0);assert.equal(jobs.list()[0].submissionAttempted,false);});
test('batch queues every item once, skips existing work, and reconciles durable original job progress',async t=>{const f=await fixture(t);f.jobs.push({id:'old',projectId:'p',shotId:'s2',kind:'video',status:'success'});const run=f.q.start({projectId:'p',accountId:'a',items:items()});await f.q.idle();assert.deepEqual(f.sent,['s1','s3']);assert.throws(()=>f.q.start({projectId:'p',accountId:'b',items:items()}),/账号/);f.jobs.find(j=>j.shotId==='s1').status='success';f.jobs.find(j=>j.shotId==='s3').status='downloading';let view=f.q.list({projectId:'p',accountId:'a'})[0];assert.equal(view.counts.success,1);assert.equal(view.counts.skipped,1);assert.equal(view.counts.downloading,1);assert.equal(view.percent,67);assert.equal(view.id,run.id);assert(!JSON.stringify(view).includes('原词'));});
test('stop cancels unsent work while retaining in-flight task and prevents duplicate starts',async t=>{let release;const f=await fixture(t,{submit:async()=>await new Promise(r=>release=r)});const r=f.q.start({projectId:'p',accountId:'a',items:items()});await tick();assert.throws(()=>f.q.start({projectId:'p',accountId:'a',items:items()}),/队列/);f.q.stop({id:r.id,accountId:'a'});release({id:'original',status:'submitted'});await f.q.idle();const view=f.q.list({projectId:'p',accountId:'a'})[0];assert.equal(view.counts.stopped,2);assert.equal(view.items[0].jobId,'original');});
test('preflight failure is isolated; account change stops remaining sends; restart never repeats an uncertain send',async t=>{let f;f=await fixture(t,{submit:async(item)=>{if(item.shotId==='s1')throw Error('素材不足');f.switchAccount();return {id:'original',status:'submitted'};}});f.q.start({projectId:'p',accountId:'a',items:items()});await f.q.idle();assert.deepEqual(f.q.list({projectId:'p',accountId:'a'}),[]);const data=JSON.parse(fs.readFileSync(path.join(f.dir,'batches.json'),'utf8'));assert.equal(data[0].items[0].status,'failed');assert.equal(data[0].items[2].status,'stopped');const saved=data[0];saved.items[1].status='preparing';fs.writeFileSync(path.join(f.dir,'batches.json'),JSON.stringify(data));const again=require('./storyboard-batch.cjs').createStoryboardBatchQueue({directory:f.dir,owner:()=>'a',loadJobs:()=>[],guard:async()=>{},submit:async()=>{throw Error('MUST NOT SEND')}});assert.equal(again.list({projectId:'p',accountId:'a'})[0].items[1].status,'uncertain');});

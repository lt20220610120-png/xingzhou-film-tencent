const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
test('FlyTo rechecks dispatch permission after preparing links and before the paid request',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-ft-prepare-'));
 const client=require('./feituo-client.cjs');
 t.after(()=>{client.configurePublicImagePreparation(undefined);fs.rmSync(dir,{recursive:true,force:true});});
 let held=false,posts=0;
 client.configurePublicImagePreparation(async input=>{held=true;return input;});
 t.mock.method(globalThis,'fetch',async()=>{posts++;return Response.json({jobId:'unexpected'});});
 const jobs=require('./generation-jobs.cjs').createGenerationJobs(dir,{
  beforeDispatch:async()=>{if(held)throw Error('停止提交');},
 });
 await assert.rejects(jobs.submit({
  kind:'image',apiKey:'mock',endpoint:'https://feituokuajing.com',model:require('../core/feituo-models.json').find(row=>row.kind==='image').id,prompt:'测试',
  ratio:'1:1',references:[{kind:'image',url:'https://fixture.example/image.png'}],
 }),/停止提交/);
 assert.equal(posts,0);
 assert.equal(jobs.list()[0].submissionAttempted,false);
});

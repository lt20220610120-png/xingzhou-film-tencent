const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {readJobs}=require('./generation-job-storage.cjs');
test('history polls reuse parsed rows, isolate a broken file unchanged, and observe a later replacement',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-jobs-isolate-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'generation-jobs.json'),original='[{"id":"truncated';
 fs.writeFileSync(file,original);
 const {createJobHistory}=require('./generation-job-storage.cjs'),isolated=[];
 const history=createJobHistory(file,{onIsolated:file=>isolated.push(file)});
 assert.deepEqual(history.read(),[]);assert.equal(fs.readFileSync(isolated[0],'utf8'),original);
 const live=[{id:'original',status:'submitted'}];history.write(live);
 const oldRead=fs.readFileSync;let reads=0;
 const reader=t.mock.method(fs,'readFileSync',(...args)=>{if(args[0]===file)reads++;return oldRead(...args);});
 try {
  assert.deepEqual(history.read(),live);assert.deepEqual(history.read(),live);assert.equal(reads,0);
  fs.writeFileSync(file,JSON.stringify([{id:'replacement',status:'success'}]));
  assert.equal(history.read()[0].id,'replacement');assert.equal(reads,1);
 } finally {reader.mock.restore();}
});
test('valid jobs survive invalid trailing bytes with a byte-identical backup; multiple documents fail closed',t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-jobs-recover-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'generation-jobs.json'),rows=[{id:'paid',status:'submitted',jobId:'original'}],bad=Buffer.from(JSON.stringify(rows)+'garbage"}]');fs.writeFileSync(file,bad);assert.deepEqual(readJobs(file),rows);const backup=fs.readdirSync(dir).find(n=>n.endsWith('.bak'));assert.deepEqual(fs.readFileSync(path.join(dir,backup)),bad);assert.deepEqual(JSON.parse(fs.readFileSync(file)),rows);fs.writeFileSync(file,JSON.stringify(rows)+JSON.stringify(rows));assert.throws(()=>readJobs(file),/文档/);fs.writeFileSync(file,JSON.stringify(rows)+JSON.stringify(rows)+'junk');assert.throws(()=>readJobs(file),/文档/);});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createAnalysisCheckpoints}=require('./analysis-checkpoints.cjs');
test('director baseline changes preserve raw offline cache once, while ordinary polls do not add backups',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-live-epoch-'));
 try{const store=createAnalysisCheckpoints(root,()=> 'member','director-live-local'),old={state:'legacy-unsent-state',pending:{update:'draft'}},p={projectId:'cloud'};await store.saveAsync({...p,data:old});await store.saveAsync({...p,data:{state:'new-state',protocol:3,epoch:'one'}});await store.saveAsync({...p,data:{state:'later-state',protocol:3,epoch:'one'}});
 const dir=path.join(root,'director-live-local'),files=await fs.readdir(dir),backups=files.filter(f=>f.endsWith('.baseline-backup'));assert.equal(backups.length,1);assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,backups[0]),'utf8')),old);assert.equal(store.load(p).state,'later-state');
 await store.saveAsync({...p,data:{state:'restored-state',protocol:3,epoch:'two'}});assert.equal((await fs.readdir(dir)).filter(f=>f.endsWith('.baseline-backup')).length,2);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

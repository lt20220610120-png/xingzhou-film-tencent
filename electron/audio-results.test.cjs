const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {createAudioResultStore}=require('./audio-results.cjs');
test('retained character sample survives result clear and concurrent records are preserved',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-retain-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,'语音生成');await fs.mkdir(dir);
 const store=createAudioResultStore({dataDir:root,resultsDir:()=>dir});
 await Promise.all(['a','b','c'].map(async name=>{const filePath=path.join(dir,name+'.wav');await fs.writeFile(filePath,name);await store.record({filePath});}));
 assert.equal((await store.list()).length,3);const saved=await store.retain((await store.list())[0].id);await store.clear();assert.equal((await fs.stat(saved.filePath)).isFile(),true);
});
test('audio result store lists, saves, deletes one and clears all managed files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-audio-results-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,'语音生成');await fs.mkdir(dir);
 const store=createAudioResultStore({dataDir:root,resultsDir:()=>dir});
 await fs.writeFile(path.join(dir,'a.wav'),'a');await fs.writeFile(path.join(dir,'b.wav'),'b');
 const a=await store.record({filePath:path.join(dir,'a.wav'),mime:'audio/wav',duration:1,bytes:1,text:'甲'}),b=await store.record({filePath:path.join(dir,'b.wav'),mime:'audio/wav',duration:2,bytes:1,text:'乙'});
 assert.equal((await store.list()).length,2);assert.equal((await store.list()).find(x=>x.id===a.id).saved,false);
 await store.save(a.id);assert.equal((await store.list()).find(x=>x.id===a.id).saved,true);
 await store.remove(b.id);assert.equal((await store.list()).length,1);await assert.rejects(fs.access(b.filePath));
 await fs.writeFile(path.join(dir,'legacy.wav'),'legacy');await store.clear();assert.deepEqual(await store.list(),[]);await assert.rejects(fs.access(a.filePath));await assert.rejects(fs.access(path.join(dir,'legacy.wav')));
});
test('audio result store rejects files outside its managed directory',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-audio-results-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,'语音生成');await fs.mkdir(dir);const outside=path.join(root,'x.wav');await fs.writeFile(outside,'x');
 const store=createAudioResultStore({dataDir:root,resultsDir:()=>dir});await assert.rejects(store.record({filePath:outside}),/目录/);
});

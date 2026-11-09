const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createDirectorQuickCheckpoints}=require('./director-quick-checkpoints.cjs');
test('paged recovery skips one corrupt and one invalid-name file, strict reads still reject, and paid responses survive async saves',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-recover-'));t.after(()=>{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'xingzhou-recover-'));fs.rmSync(root,{recursive:true,force:true});});
 const store=createDirectorQuickCheckpoints(root,()=> 'account');
 for(const id of ['a','b','c'])await store.saveAsync({run:{id,kind:id==='a'?'batch':'scene',phase:'paused',snapshot:{accountId:'account'},wholeSceneResponses:[{output:'already paid'}]}});
 const files=[];const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);e.isDirectory()?visit(f):files.push(f);}};visit(root);const dir=path.dirname(files[0]);fs.writeFileSync(path.join(dir,'b.json'),'broken');fs.writeFileSync(path.join(dir,'not valid.json'),'broken');
 assert.throws(()=>store.list());const one=store.list({recoverable:true,limit:1});assert.equal(one.runs[0].id,'a');assert.equal(one.issues.length,1);assert.equal(one.nextCursor,'a');
 const two=store.list({recoverable:true,limit:1,after:one.nextCursor});assert.equal(two.runs.length,0);assert.equal(two.issues[0].runId,'b');
 const three=store.list({recoverable:true,limit:1,after:two.nextCursor});assert.equal(three.runs[0].id,'c');assert.equal(three.nextCursor,null);assert.equal(three.runs[0].wholeSceneResponses[0].output,'already paid');assert(fs.existsSync(path.join(dir,'b.json')));
});

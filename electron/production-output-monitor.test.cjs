const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createOutputMonitor}=require('./production-output-monitor.cjs');
test('completed files are reused cheaply, changed/missing/outside files never count as complete',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-output-'));try{const file=path.join(dir,'clip.mp4');fs.writeFileSync(file,'verified');const hash=crypto.createHash('sha256').update('verified').digest('hex'),verify=createOutputMonitor();assert.equal((await verify(dir,file,hash)).cached,false);assert.equal((await verify(dir,file,hash)).cached,true);fs.writeFileSync(file,'changed bytes');await assert.rejects(verify(dir,file,hash),/变化/);await assert.rejects(verify(path.join(dir,'sub'),file,hash));fs.unlinkSync(file);await assert.rejects(verify(dir,file,hash));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

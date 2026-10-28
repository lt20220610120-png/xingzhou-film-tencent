const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const{createProductionHost}=require('./production-host.cjs');
test('completed post receipts survive host restart and changed outputs fail verification',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-post-'));try{const make=()=>createProductionHost({root:()=>root,authorize:async()=>({id:'admin',isAdmin:true})}),id=crypto.randomUUID(),run={id,accountId:'admin',name:'验收',status:'paused',items:[],config:{mode:'semi',outputRoot:root}};
 await make().save(run);const dir=path.join(root,'验收-'+id.slice(0,8));fs.mkdirSync(dir);const file=path.join(dir,'第1集.mp4');fs.writeFileSync(file,'verified fixture');const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(path.join(root,'admin',id+'.json.1.edit.json'),JSON.stringify({status:'done',result:{file,sha256}}));
 assert.equal((await make().postStatus({runId:id,episode:1,stage:'edit'})).status,'done');fs.writeFileSync(file,'changed');await assert.rejects(make().postStatus({runId:id,episode:1,stage:'edit'}),/文件已变化/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

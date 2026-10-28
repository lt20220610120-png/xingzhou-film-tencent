const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const{createProductionHost}=require('./production-host.cjs');
test('folder picker remembers location, allows creation, preserves cancellation and rechecks identity',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-picker-'));let options,owner='admin',cancel=false,switchOwner=false;
 try{const host=createProductionHost({authorize:async()=>({id:owner,isAdmin:true}),dialog:{showOpenDialog:async value=>{options=value;if(switchOwner)owner='other';return {canceled:cancel,filePaths:cancel?[]:[dir]};}}});
  assert.equal(await host.choose({kind:'folder',title:'背景音乐文件夹',defaultPath:dir}),fs.realpathSync(dir));
  assert.equal(options.title,'背景音乐文件夹');assert.equal(options.defaultPath,dir);assert(options.properties.includes('createDirectory'));
  cancel=true;assert.equal(await host.choose({kind:'folder'}),null);
  cancel=false;switchOwner=true;await assert.rejects(host.choose({kind:'folder'}),/账号已变化/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('completed post receipts survive host restart and changed outputs fail verification',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-post-'));try{const make=()=>createProductionHost({root:()=>root,authorize:async()=>({id:'admin',isAdmin:true})}),id=crypto.randomUUID(),run={id,accountId:'admin',name:'验收',status:'paused',items:[],config:{mode:'semi',outputRoot:root}};
 await make().save(run);const dir=path.join(root,'验收-'+id.slice(0,8));fs.mkdirSync(dir);const file=path.join(dir,'第1集.mp4');fs.writeFileSync(file,'verified fixture');const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(path.join(root,'admin',id+'.json.1.edit.json'),JSON.stringify({status:'done',result:{file,sha256}}));
 assert.equal((await make().postStatus({runId:id,episode:1,stage:'edit'})).status,'done');fs.writeFileSync(file,'changed');await assert.rejects(make().postStatus({runId:id,episode:1,stage:'edit'}),/文件已变化/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

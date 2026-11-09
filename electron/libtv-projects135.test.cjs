const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createLibTVService}=require('./libtv-service.cjs');
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('test:'+s),decryptString:b=>b.toString().slice(5)};
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv135-')),owner=crypto.createHash('sha256').update('alice').digest('hex').slice(0,32),calls=[];let created=0,space=1,denied=false;
 const config={root,safeStorage,ensureBinary:async()=>'/mock',runCLI:async args=>{calls.push(args);if(args[0]==='account')return{user:{uuid:'lib-user'},activeAccount:{accountId:space}};if(args[0]==='model')return{modelKey:'mock',modelName:'真实展示名',schema:{properties:{modeType:{items:{text2video:[0,0],image2image:[0,14]}}}}};if(args[0]==='project'){await new Promise(r=>setTimeout(r,5));return{projectMeta:{uuid:'project-'+(++created)}};}if(args[0]==='node'&&args[1]==='list'){if(denied)throw Error('无权访问');return{nodes:[]};}if(args[0]==='node'&&args[1]==='create')return{newNodeKey:crypto.randomUUID()};return{nodes:[]};}};
 const service=createLibTVService(config),input={libtvOwnerKey:owner,model:'mock',kind:'image',prompt:'mock'};t.after(()=>service.close());return{root,owner,calls,config,service,input,get created(){return created},setSpace:n=>space=n,setDenied:v=>denied=v};}
test('concurrent image/video preparations share one persistent canvas across software restart',async t=>{
 const f=fixture(t),tasks=await Promise.all(Array.from({length:12},(_,i)=>f.service.prepare('alice',{...f.input,kind:i%2?'video':'image'})));assert.equal(f.created,1);assert.equal(new Set(tasks.map(t=>t.libtvProjectId)).size,1);assert.equal(f.calls.some(c=>c.includes('--run')),false);
 await f.service.close();const restarted=createLibTVService(f.config);t.after(()=>restarted.close());const next=await restarted.prepare('alice',f.input);assert.equal(next.libtvProjectId,tasks[0].libtvProjectId);assert.equal(f.created,1);
});
test('explicitly named project switches future work and leaves older task queries on their original canvas',async t=>{
 const f=fixture(t),old=await f.service.prepare('alice',f.input),row=await f.service.createProject('alice','第二批');assert.equal(row.name,'第二批');const next=await f.service.prepare('alice',{...f.input,kind:'video'});assert.notEqual(next.libtvProjectId,old.libtvProjectId);await f.service.query('alice',old);assert.equal(f.calls.at(-1).at(-1),old.libtvProjectId);
 await f.service.useProject('alice',old.libtvCanvasUrl);assert.equal((await f.service.prepare('alice',f.input)).libtvProjectId,old.libtvProjectId);assert.equal(f.created,2);
});
test('project choices and defaults are isolated by LibTV account/team identity',async t=>{
 const f=fixture(t),one=await f.service.prepare('alice',f.input);f.setSpace(2);assert.equal((await f.service.projects('alice')).projects.length,0);const two=await f.service.prepare('alice',f.input);assert.notEqual(one.libtvProjectId,two.libtvProjectId);f.setSpace(1);assert.equal((await f.service.projects('alice')).selectedId,one.libtvProjectId);
});
test('connecting an inaccessible or invalid project cannot change the active project or create new canvases',async t=>{
 const f=fixture(t),old=await f.service.prepare('alice',f.input);f.setDenied(true);await assert.rejects(f.service.useProject('alice','foreign'),/无权访问/);await assert.rejects(f.service.useProject('alice','https://evil.test/canvas?projectId=x'),/官方/);assert.equal((await f.service.projects('alice')).selectedId,old.libtvProjectId);assert.equal(f.created,1);
});
test('reading project options never creates a canvas; broken local records do not silently make another',async t=>{
 const f=fixture(t);assert.equal((await f.service.projects('alice')).projects.length,0);assert.equal(f.created,0);await f.service.prepare('alice',f.input);const directory=path.join(f.root,'accounts',f.owner),file=fs.readdirSync(directory).find(n=>n.startsWith('projects-'));fs.writeFileSync(path.join(directory,file),'broken');await assert.rejects(f.service.prepare('alice',f.input),/原文件已保留/);assert.equal(f.created,1);
});

test('project creation blocks re-login, disconnect and storage switching throughout the transaction',async t=>{
 const f=fixture(t);let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let binaryCalls=0;
 const service=createLibTVService({...f.config,ensureBinary:async()=>{if(++binaryCalls===2){entered();await gate;}return '/mock';}});t.after(()=>service.close());const pending=service.createProject('alice','批次B');await started;assert.equal(service.hasRunning(),true);await assert.rejects(service.login('alice'),/运行/);await assert.rejects(service.logout('alice'),/运行/);release();await pending;assert.equal(f.created,1);
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createLibTVService}=require('./libtv-service.cjs');
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('test:'+s),decryptString:b=>b.toString().slice(5)};
function fixture(t,{project={projectMeta:{uuid:'real-canvas-uuid'}},detailName='lib-image-2.5-f',searchModels,options,readAccount,detail}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-contract-')),owner=crypto.createHash('sha256').update('alice').digest('hex').slice(0,32),dir=path.join(root,'accounts',owner);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'credentials.enc'),safeStorage.encryptString('{}'));
 const calls=[];
 const service=createLibTVService({root,safeStorage,ensureBinary:async()=>'/fixture',...options,runCLI:async (args,context)=>{
  calls.push(args);
  if(args[0]==='account')return readAccount?readAccount(context):{user:{uuid:'actual-user'},activeAccount:{accountId:1}};
  if(args[0]==='model'&&args[1]==='search')return{nodeType:args.at(-1),matches:searchModels?searchModels(args.at(-1)):(args.at(-1)==='image'?[{modelKey:'lib-image-2.5-f',modelName:'Lib Image 2.5 Fast'}]:[{modelKey:'star-video2.5',modelName:'Seedance 2.5'}])};
  if(args[0]==='model')return detail?detail(args[1]):{nameOrId:args[1],modelKey:args[1],modelName:typeof detailName==='function'?detailName(args[1]):detailName,modality:'image',schema:{properties:{modeType:{items:{image2image:[0,14]}},count:[1],ratio:{enum:['16:9'],default:'16:9'}},config:{settings:['ratio']}}};
  if(args[0]==='project')return project;
  if(args[0]==='node'&&args[1]==='create')return{nodeKey:'real-node-key',nodeType:'image',data:{url:[]}};
  if(args[0]==='node')return{nodeKey:'real-node-key',data:{url:[]}};
 }});
 t.after(async()=>{await service.close();fs.rmSync(root,{recursive:true,force:true});});
 return{service,calls,input:{libtvOwnerKey:owner,kind:'image',model:'lib-image-2.5-f',prompt:'A white ceramic teacup.',ratio:'16:9',references:[],id:'new-task'}};
}
test('actual CLI projectMeta.uuid response continues to create and track the image node without running it',async t=>{
 const f=fixture(t,{detailName:'Lib Image 2.5 Fast'}),task=await f.service.prepare('alice',f.input);
 assert.equal(task.libtvProjectId,'real-canvas-uuid');assert.equal(task.libtvNodeId,'real-node-key');
 assert.equal(f.calls.filter(a=>a[0]==='project'&&a[1]==='create').length,1);assert.ok(f.calls.find(a=>a[1]==='create'&&a[0]==='node').includes('real-canvas-uuid'));assert.equal(f.calls.some(a=>a.includes('--run')),false);
});
test('CLI detail modelName equal to model key resolves to the searchable display name before node creation',async t=>{
 const f=fixture(t,{project:{projectUuid:'real-canvas-uuid'}});await f.service.prepare('alice',f.input);
 const args=f.calls.find(a=>a[0]==='node'&&a[1]==='create');assert.ok(args.includes('model=Lib Image 2.5 Fast'));assert.equal(args.includes('model=lib-image-2.5-f'),false);
 assert.equal((await f.service.schema('alice',f.input.model,'image')).name,'Lib Image 2.5 Fast');
});
test('unconfirmed project response stops before node creation or paid generation',async t=>{
 const f=fixture(t,{project:{projectMeta:{uuid:1234}},detailName:'Lib Image 2.5 Fast'});await assert.rejects(f.service.prepare('alice',f.input),/画布创建未确认/);assert.equal(f.calls.some(a=>a[0]==='node'),false);
});
test('explicit model refresh replaces stale display-name lookup so newly available models can run',async t=>{
 const catalog=[{modelKey:'lib-image-2.5-f',modelName:'Lib Image 2.5 Fast'}];
 const f=fixture(t,{detailName:key=>key,searchModels:kind=>kind==='image'?[...catalog]:[{modelKey:'star-video2.5',modelName:'Seedance 2.5'}]});
 await f.service.schema('alice','lib-image-2.5-f','image');
 catalog.push({modelKey:'lib-image-2.5-s',modelName:'Lib Image 2.5 Pro'});
 const current=await f.service.models('alice');assert.ok(current.imageModels.some(m=>m.id==='lib-image-2.5-s'));
 assert.equal((await f.service.schema('alice','lib-image-2.5-s','image')).name,'Lib Image 2.5 Pro');
});
test('a missing authoritative display name blocks project creation and paid generation',async t=>{
 const f=fixture(t,{detailName:key=>key,searchModels:()=>[]});await assert.rejects(f.service.prepare('alice',f.input),/模型名称无法确认/);assert.equal(f.calls.some(a=>a[0]==='project'||a[0]==='node'),false);
});

test('an unusable directory is never cached and a forced parameter refresh rereads identity and schema',async t=>{
 let official=[];
 const f=fixture(t,{searchModels:()=>official});
 await assert.rejects(f.service.schema('alice',f.input.model,'image'),/模型/);
 official=[{modelKey:f.input.model,modelName:'Lib Image 2.5 Fast'}];
 assert.equal((await f.service.schema('alice',f.input.model,'image')).name,official[0].modelName);
 official=[{...official[0],modelName:'Lib Image 2.5 Fast Updated'}];
 assert.equal((await f.service.schema('alice',f.input.model,'image')).name,'Lib Image 2.5 Fast');
 const refreshed=await Promise.all([1,2].map(()=>f.service.refreshModelSchema('alice',f.input.model,'image')));
 assert.ok(refreshed.every(value=>value.name===official[0].modelName));
 assert.equal(f.calls.filter(args=>args[0]==='account').length,2);
 assert.equal(f.calls.filter(args=>args[1]==='search').length,3);
});

test('verified display name for a fresh matching detail can bridge a transient directory failure',async t=>{
 let official=[{modelKey:'lib-image-2.5-f',modelName:'Lib Image 2.5 Fast'}];
 const f=fixture(t,{searchModels:()=>official});
 assert.equal((await f.service.schema('alice',f.input.model,'image')).name,official[0].modelName);
 official=[];
 assert.equal((await f.service.refreshModelSchema('alice',f.input.model,'image')).name,'Lib Image 2.5 Fast');
 official=[{modelKey:f.input.model,modelName:'Lib Image 2.5 Fast Restored'}];
 assert.equal((await f.service.schema('alice',f.input.model,'image')).name,official[0].modelName);
});

test('Seedance 2.5 keeps its exact display name only for a matching authoritative detail',async t=>{
 let responseKey='star-video2.5';
 const f=fixture(t,{searchModels:()=>[null],detail:key=>({modelKey:responseKey,modelName:key,modality:'video',
  schema:{properties:{modeType:{items:{singleImage2video:[1,1]}},duration:{min:4,max:30},ratio:{enum:['16:9']}}}})});
 const model=await f.service.schema('alice','star-video2.5','video');
 assert.equal(model.name,'Seedance 2.5');
 assert.equal(model.durations.at(-1),30);
 responseKey='different-model';
 await assert.rejects(f.service.refreshModelSchema('alice','star-video2.5','video'),/模型参数无法确认/);
});

test('an invalid duration range cannot stall the renderer or be cached as a usable model',async t=>{
 let step=-1;
 const f=fixture(t,{detail:key=>({modelKey:key,modelName:'Official Model',modality:'video',
  schema:{properties:{duration:{min:4,max:30,step}}}})});
 await assert.rejects(f.service.schema('alice','star-video2.5','video'),/时长格式异常/);
 step=1;
 assert.equal((await f.service.schema('alice','star-video2.5','video')).durations.at(-1),30);
});

for (const mode of ['direct','system','custom']) test(`${mode}: first hung read leaves budget for a successful retry`,async t=>{
 let reads=0;
 const f=fixture(t,{options:{readAttemptTimeout:12,retryDelays:[1,2]},readAccount:({signal})=>{
  if(++reads>1)return{user:{uuid:'actual-user'},activeAccount:{accountId:1}};
  return require('node:timers/promises').setTimeout(150,null,{signal});
 }});
 await f.service.saveNetworkSettings({mode,proxyUrl:'socks5://localhost:7897'});
 const result=await f.service.schema('alice',f.input.model,'image');
 assert.equal(result.name,'Lib Image 2.5 Fast');
 assert.equal(reads,2);
 assert.equal(f.calls.some(args=>args.includes('--run')),false);
});

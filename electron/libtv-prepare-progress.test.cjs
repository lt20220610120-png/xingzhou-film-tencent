const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {setTimeout:wait}=require('node:timers/promises');
const {createLibTVService}=require('./libtv-service.cjs');

function fixture(t,{upload=async()=>{},onAccount}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-progress-'));
 const ownerKey=crypto.createHash('sha256').update('fixture').digest('hex').slice(0,32);
 const accountDir=path.join(root,'accounts',ownerKey);
 fs.mkdirSync(accountDir,{recursive:true});
 fs.writeFileSync(path.join(accountDir,'credentials.enc'),'{}');
 const wav=path.join(root,'fixture.wav');fs.writeFileSync(wav,'RIFF----WAVEfixture');
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:bytes=>bytes.toString()};
 const calls=[];let space=1;
 const service=createLibTVService({root,safeStorage,ensureBinary:async()=>'/fixture',runCLI:async(args,{signal})=>{
  calls.push(args);
  if(args[0]==='account'&&args[1]==='info'){await onAccount?.(signal);return {user:{uuid:'simulated'},activeAccount:{accountId:space}};}
  if(args[0]==='account'&&args[1]==='list')return {accounts:[{accountId:1},{accountId:2}]};
  if(args[0]==='account'&&args[1]==='use'){space=Number(args[2]);return {};}
  if(args[0]==='model')return {modelKey:'fixture',modelName:'示例',schema:{properties:{modeType:{items:{mixed2video:[0,8]}},ratio:{enum:['16:9']}},config:{settings:['ratio']}}};
  if(args[0]==='project')return {projectUuid:'fixture-canvas-'+space};
  if(args[0]==='upload'){await upload(args[1],signal);return {nodeKey:args[1]};}
  if(args[1]==='create')return {newNodeKey:'simulated-result'};
  return {nodeKey:'simulated-result'};
 }});
 t.after(async()=>{await service.close();fs.rmSync(root,{recursive:true,force:true});});
 const references=[...Array.from({length:6},(_,i)=>({kind:'image',filePath:path.join(root,'image-'+i+'.png')})),
  {kind:'audio',name:'角色甲',filePath:wav},{kind:'audio',name:'角色乙',filePath:wav}];
 return {accountDir,service,calls,prepare:options=>service.prepare('fixture',{libtvOwnerKey:ownerKey,kind:'video',model:'fixture',prompt:'@image1 @audio2',references,...options})};
}

test('window and shot reads coalesce, and warm prepare/run reuse the verified identity',async t=>{
 const f=fixture(t,{onAccount:()=>wait(15)});
 await Promise.all([f.service.projects('fixture'),f.service.status('fixture'),f.service.schema('fixture','fixture','video'),f.service.schema('fixture','fixture','video')]);
 assert.equal(f.calls.filter(a=>a[0]==='account'&&a[1]==='info').length,1);
 assert.equal(f.calls.filter(a=>a[0]==='model').length,1);
 const task=await f.prepare();await f.service.run('fixture',task);
 assert.equal(f.calls.filter(a=>a[0]==='account'&&a[1]==='info').length,1);
 assert.equal(f.calls.filter(a=>a.includes('--run')).length,1);
 await f.service.saveNetworkSettings({mode:'direct'});
 await f.service.status('fixture');
 assert.equal(f.calls.filter(a=>a[0]==='account'&&a[1]==='info').length,2);
 await f.service.useAccount('fixture','2');
 await assert.rejects(f.service.run('fixture',task),/账号|空间/);
 assert.equal(f.calls.filter(a=>a.includes('--run')).length,1);
});

test('cancelling preparation leaves a shared account read available to the projects panel',async t=>{
 const started=Promise.withResolvers(),result=Promise.withResolvers(),controller=new AbortController();
 let accountSignal;
 const f=fixture(t,{onAccount:signal=>{accountSignal=signal;started.resolve();return result.promise;}});
 const task=f.prepare({signal:controller.signal});
 const rejection=assert.rejects(task,error=>error.beforeSubmission===true&&/停止/.test(error.message));
 await started.promise;
 const projects=f.service.projects('fixture');
 await wait(0);
 controller.abort();
 result.resolve();
 await rejection;
 await projects;
 assert.equal(accountSignal.aborted,false);
 assert.equal(f.calls.filter(args=>args[0]==='account'&&args[1]==='info').length,1);
 assert.equal(f.calls.some(args=>args[0]==='upload'||args[0]==='node'),false);
});

test('reference upload overlaps globally at exactly two, reports progress and keeps node inputs ordered',async t=>{
 let active=0,peak=0;
 const f=fixture(t,{upload:async(label,signal)=>{peak=Math.max(peak,++active);try{await wait(label.endsWith('-1')?24:5,undefined,{signal});}finally{active--;}}});
 const reports=[[],[]];
 await Promise.all(reports.map(report=>f.prepare({onLibTVProgress:step=>report.push(step)})));
 assert.equal(peak,2);
 for(const report of reports){
  assert.equal(report[0].stage,'checking');
  assert.deepEqual(report.filter(step=>step.stage==='uploading').map(step=>[step.completed,step.total]),Array.from({length:9},(_,i)=>[i,8]));
  assert.equal(report.at(-1).stage,'creating');
 }
 const creates=f.calls.filter(args=>args[0]==='node'&&args[1]==='create');
 assert.equal(creates.length,2);
 for(const args of creates)assert.deepEqual(args.filter((_,i)=>args[i-1]==='--left'),Array.from({length:8},(_,i)=>'参考-'+(i+1)));
 assert.equal(f.calls.filter(args=>args.includes('--run')).length,0);
});

test('first broken reference aborts the sibling, drains both workers and never creates a node',async t=>{
 const both=Promise.withResolvers();let active=0,settled=0;
 const f=fixture(t,{upload:async(label,signal)=>{
  if(++active===2)both.resolve();
  try{
   await both.promise;
   if(label==='参考-1')throw Error('素材不可读');
   await wait(1000,undefined,{signal});
  }finally{settled++;}
 }});
 await assert.rejects(f.prepare(),error=>error.beforeSubmission===true&&/@image1.*素材不可读/.test(error.message));
 assert.equal(settled,2);
 assert.equal(f.calls.filter(args=>args[0]==='upload').length,2);
 assert.equal(f.calls.some(args=>args[0]==='node'),false);
 assert.equal(fs.existsSync(path.join(f.accountDir,'credentials.json')),false);
});

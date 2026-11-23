const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once,EventEmitter}=require('node:events');
const {createLibTVService,cliFailure}=require('./libtv-service.cjs');

function fixture(t,{onUpload,onRun}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-resilient-'));
 const owner=crypto.createHash('sha256').update('fixture').digest('hex').slice(0,32);
 const accountDir=path.join(root,'accounts',owner);
 fs.mkdirSync(accountDir,{recursive:true});
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:buffer=>buffer.toString()};
 fs.writeFileSync(path.join(accountDir,'credentials.enc'),'{}');
 const events=new EventEmitter(),uploads=[],runs=[],nodes=[],invalidations=[];
 const network={
  environment:async()=>({env:{}}),
  invalidate:hint=>{invalidations.push(hint);events.emit('invalidated');},
  close:async()=>{},
 };
 const runCLI=async(args,{signal})=>{
  if(args[0]==='account')return {user:{uuid:'fixture-user'},activeAccount:{accountId:1}};
  if(args[0]==='model')return {modelKey:'sample',modelName:'示例',schema:{properties:{modeType:{items:{mixed2video:[0,8]}},count:[1],ratio:{enum:['16:9']}},config:{settings:['ratio']}}};
  if(args[0]==='project')return {projectUuid:'fixture-canvas'};
  if(args[0]==='upload'){const [_,label]=args;uploads.push(label);await onUpload?.(label,signal,events);return {nodeKey:label};}
  if(args.includes('--run')){runs.push(args);return onRun?.()||{};}
  if(args[1]==='create'){nodes.push(args);return {newNodeKey:'generated-node'};}
  return {nodeKey:'generated-node'};
 };
 const service=createLibTVService({root,safeStorage,network,runCLI,ensureBinary:async()=>'/fixture'});
 t.after(async()=>{await service.close();fs.rmSync(root,{recursive:true,force:true});});
 const wav=path.join(root,'sample.wav');fs.writeFileSync(wav,Buffer.from('RIFF----WAVEfixture'));
 const references=[
  ...Array.from({length:6},(_,i)=>({kind:'image',filePath:path.join(root,'image-'+i+'.png')})),
  {kind:'audio',name:'角色甲',filePath:wav},{kind:'audio',name:'角色乙',filePath:wav},
 ];
 return {service,uploads,runs,nodes,invalidations,references,events,accountDir,
  prepare:signal=>service.prepare('fixture',{libtvOwnerKey:owner,kind:'video',model:'sample',prompt:'@image1 @audio2',references,signal})};
}

test('six image and two audio uploads recover individually from reset, bare fetch failure, and proxy 502; paid run stays single-shot',async t=>{
 const remaining=new Map([
  ['参考-3',['ECONNRESET']],['参考-6',['TypeError: fetch failed']],['参考-8',['Proxy response (502) !== 200 when HTTP Tunneling','request fail: 503']],
 ]);
 const f=fixture(t,{onUpload(label){const failure=remaining.get(label)?.shift();if(failure)throw cliFailure(failure,'upload');},
  onRun(){throw cliFailure('TypeError: fetch failed','node');}});
 const task=await f.prepare();
 assert.equal(task.libtvNodeId,'generated-node');
 assert.deepEqual(Array.from({length:8},(_,index)=>f.uploads.filter(label=>label==='参考-'+(index+1)).length),[1,1,2,1,1,2,1,3]);
 assert.equal(f.nodes.length,1);
 assert.deepEqual(f.nodes[0].filter((_,i,args)=>args[i-1]==='--left'),Array.from({length:8},(_,i)=>'参考-'+(i+1)));
 assert.equal(f.runs.length,0);
 await assert.rejects(f.service.run('fixture',task),/提交生成/);
 assert.equal(f.runs.length,1);
});

test('a persistent failure shows a sanitized network category and bounded attempt count',async t=>{
 const f=fixture(t,{onUpload(label){
  if(label==='参考-8')throw cliFailure("Fetch failed, code: ECONNRESET, host: 'libtv-resource-prod.oss-accelerate.aliyuncs.com' https://hidden.invalid/a?token=redact", 'upload');
 }});
 await assert.rejects(f.prepare(),error=>error.beforeSubmission===true&&/@audio2.*未提交生成.*连接被重置/.test(error.message)
  &&/ECONNRESET/.test(error.message)&&/3/.test(error.message)&&!/token|redact|hidden.invalid/.test(error.message));
 assert.equal(f.uploads.filter(label=>label==='参考-8').length,3);
 assert.equal(f.nodes.length,0);assert.equal(f.runs.length,0);
});

test('authorization, invalid certificate, and a missing local file fail without retrying reference uploads',async t=>{
 for(const reason of ['request fail: 403','fetch failed: ERR_TLS_CERT_ALTNAME_INVALID','ENOENT']){
  const f=fixture(t,{onUpload(){throw cliFailure(reason,'upload');}});
  await assert.rejects(f.prepare(),error=>error.beforeSubmission===true);
  assert.ok(f.uploads.length<=2,reason);
  assert.equal(new Set(f.uploads).size,f.uploads.length,reason);
 }
});

test('external cancel and service shutdown abort upload backoff without another command or plaintext credential',async t=>{
 for(const cancel of ['external','close']){
  const f=fixture(t,{onUpload(){throw cliFailure('ETIMEDOUT','upload');}}), controller=new AbortController();
  const invalidated=once(f.events,'invalidated');
  const observed=assert.rejects(f.prepare(controller.signal),error=>error.beforeSubmission===true&&/停止|取消/.test(error.message));
  await invalidated;
  if(cancel==='external')controller.abort();
  else await f.service.close();
  const outcome=await Promise.race([observed.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),150))]);
  assert.equal(outcome,true,'abort must interrupt backoff');
  assert.ok(f.uploads.length<=2);
  assert.equal(new Set(f.uploads).size,f.uploads.length);
  assert.equal(fs.existsSync(path.join(f.accountDir,'credentials.json')),false);
 }
});

test('earlier successful HTTP diagnostics do not hide a later bare fetch failure',()=>{
 const generic=cliFailure('model HTTP 200\nHTTP 302\nTypeError: fetch failed','upload');
 assert.equal(generic.networkCode,'FETCH_FAILED');
 assert.equal(generic.retryable,true);
});

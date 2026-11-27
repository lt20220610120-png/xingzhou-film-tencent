const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createLibTVService}=require('./libtv-service.cjs');
const owner=crypto.createHash('sha256').update('fixture').digest('hex').slice(0,32);

function fixture(t,runCLI,network){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-diagnostics-'));
 const dir=path.join(root,'accounts',owner);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'credentials.enc'),'fixture-private-value');
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:Buffer.from,decryptString:bytes=>bytes.toString()};
 const service=createLibTVService({root,safeStorage,runCLI,network,ensureBinary:async()=>'/fixture'});
 t.after(async()=>{await service.close();fs.rmSync(root,{recursive:true,force:true});});
 return {dir,root,service,safeStorage};
}

test('network settings are local, atomic, validated and persistent',async t=>{
 const {root,service,safeStorage}=fixture(t,async()=>assert.fail('no CLI for settings'));
 assert.deepEqual(service.networkSettings(),{mode:'system',proxyUrl:''});
 await service.saveNetworkSettings({mode:'custom',proxyUrl:'socks5://127.0.0.1:7897'});
 assert.equal(createLibTVService({root,safeStorage,runCLI:async()=>{}}).networkSettings().mode,'custom');
 await assert.rejects(service.saveNetworkSettings({mode:'custom',proxyUrl:'http://person:private@localhost:7897'}));
 assert.match(fs.readFileSync(path.join(root,'network-settings.json'),'utf8'),/socks5/);
 assert.doesNotMatch(fs.readFileSync(path.join(root,'network-settings.json'),'utf8'),/private/);
});

test('connection test verifies account and both model lists with a redacted result',async t=>{
 const calls=[];
 const {service}=fixture(t,async args=>{
  calls.push(args);
  if(args[0]==='account')return {user:{uuid:'fixture-private-uuid',nickname:'fixture-private-name'}};
  return {matches:[{modelKey:'fixture-key',modelName:'Fixture Model'}]};
 },{environment:async()=>({routeReport:()=>({route:'socks5',source:'system-proxy'})})});
 const result=await service.testConnection('fixture');
 assert.equal(result.ok,true);
 assert.deepEqual(result.steps.map(s=>[s.stage,s.ok,s.route]),[['account',true,'system-socks5'],['models',true,'system-socks5']]);
 assert.doesNotMatch(JSON.stringify(result),/uuid|private|fixture/);
 assert.deepEqual(calls,[['account','info'],['model','search','--type','image'],['model','search','--type','video']]);
});

test('a connection test rejects a missing or empty model directory',async t=>{
 const {service}=fixture(t,async args=>args[0]==='account'?{user:{uuid:'fixture'}}:{matches:[]});
 const result=await service.testConnection('fixture');
 assert.equal(result.ok,false);
 assert.equal(result.steps.at(-1).code,'MODELS_UNAVAILABLE');
});

test('diagnostics retry read failures with a route hint, redact raw text and cancel safely',async t=>{
 const calls=[];
 let fail=true;
 const network={
  environment:async opts=>{calls.push(opts.retryRoute);return {routeReport:()=>({route:opts.retryRoute?'direct':'http',source:opts.retryRoute?'direct':'system-proxy'})};},
  invalidate(){},
 };
 const {service,dir}=fixture(t,async()=>{
  if(fail)throw Object.assign(Error('Bearer fixture-private-secret'),{code:'LIBTV_NETWORK',networkCode:'ECONNRESET',retryable:true,routeHint:{host:'api.liblib.tv',mode:'system-proxy'}});
  return {user:{uuid:'fixture'}};
 },network);
 const result=await service.testConnection('fixture');
 assert.equal(result.ok,false);
 assert.equal(result.steps[0].code,'ECONNRESET');
 assert.doesNotMatch(JSON.stringify(result),/Bearer|fixture-private|liblib\.tv/);
 assert.ok(calls[1]?.host);
 fail=false;
 const pending=service.testConnection('fixture');
 await service.cancelConnectionTest('fixture');
 assert.equal((await pending).steps.at(-1).code,'CANCELLED');
 assert.equal(fs.existsSync(path.join(dir,'credentials.json')),false);
});

test('a cold connector download follows the local mode and stops when diagnostics is cancelled',{skip:process.platform!=='win32'||process.arch!=='x64'},async t=>{
 const {root,dir,safeStorage}=fixture(t,async()=>assert.fail('fixture must not run CLI'));
 const downloading=Promise.withResolvers(),stopped=Promise.withResolvers();
 const service=createLibTVService({root,safeStorage,fetchFn:async(_url,{signal},settings)=>{
  assert.deepEqual(settings,{mode:'direct',proxyUrl:''});
  downloading.resolve();
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{stopped.resolve();reject(signal.reason);},{once:true}));
 }});
 t.after(()=>service.close());
 await service.saveNetworkSettings({mode:'direct'});
 const result=service.testConnection('fixture');
 await downloading.promise;
 await service.cancelConnectionTest('fixture');
 await stopped.promise;
 assert.equal((await result).steps[0].code,'CANCELLED');
 assert.equal(fs.existsSync(path.join(dir,'credentials.json')),false);
});

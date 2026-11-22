const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {syncLikeExtension}=require('./like-extension.cjs');
test('Like extension upgrade keeps the registered directory and pairing files',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-like-upgrade-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(syncLikeExtension(root,{existingOnly:true}),null);
 const folder=syncLikeExtension(root);fs.writeFileSync(path.join(folder,'keep-pairing'),'fixture');fs.writeFileSync(path.join(folder,'main.js'),'old adapter');
 assert.equal(syncLikeExtension(root,{existingOnly:true}),folder);
 assert.match(fs.readFileSync(path.join(folder,'main.js'),'utf8'),/wb-snapshot-select/);assert.equal(fs.readFileSync(path.join(folder,'keep-pairing'),'utf8'),'fixture');
 assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))).version,'1.0.3');
});
test('the Like worker can resume the original tab asset and reply after suspension',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../browser-extension/like-connector/background.js'),'utf8');
 const vm=require('node:vm');
 const fixtureStore=values=>({
  async get(keys){return Object.fromEntries((keys===null?Object.keys(values):[keys].flat()).map(key=>[key,values[key]]));},
  async set(delta){Object.assign(values,delta);},async remove(keys){for(const key of [keys].flat())delete values[key];},
 });
 const local=fixtureStore({token:'fixture'}),session=fixtureStore({}),project='https://likeai.pro/projects/'+'a'.repeat(24);
 const command={id:'command-1',jobId:'job-1',op:'submitVideo',pageId:'page-1',references:[{kind:'image'}],deadline:Date.now()+30000};
 let commandSent=false,seenReply=false,issued=false;
 function startWorker(){
  let alarm,message;
  const chrome={
   storage:{local,session},
   alarms:{create(){},onAlarm:{addListener(fn){alarm=fn;}}},
   runtime:{id:'fixture-ext',getURL:p=>'chrome-extension://fixture-ext/'+p,onStartup:{addListener(){}},onInstalled:{addListener(){}},onMessage:{addListener(fn){message=fn;}}},
   tabs:{query:async()=>[{id:7,url:project}],sendMessage:async(_tab,value)=>{if(value.kind==='inspect')return{id:'page-1',url:project};commandSent=true;return {received:true};}},
  };
  const fetch=async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer fixture');
   if(url.endsWith('/poll')){const commands=issued?[]:[command];issued=true;return Response.json({commands});}
   if(url.endsWith('/reply')){seenReply=true;assert.equal(JSON.parse(options.body).id,command.id);return Response.json({ok:true});}
   if(url.includes('/asset?'))return new Response('a',{headers:{'X-Total-Length':'1','Content-Type':'image/png'}});
   assert.fail(url);
  };
  vm.runInNewContext(source,{chrome,fetch,AbortSignal,Date,URL,Uint8Array,btoa});
  return {alarm,send:(value,tabId=7)=>new Promise(resolve=>message(value,{id:'fixture-ext',tab:{id:tabId},url:project},resolve))};
 }
 await startWorker().alarm();
 assert.equal(commandSent,true);
 const worker=startWorker(),asset={kind:'asset',commandId:command.id,jobId:command.jobId,index:0,offset:0};
 assert.equal((await worker.send(asset,8)).ok,false);
 assert.equal((await worker.send(asset)).data,'YQ==');
 assert.equal((await worker.send({...asset,kind:'command-result',reply:{ok:true,result:{status:'submitted'}}})).ok,true);
 assert.equal(seenReply,true);
 assert.equal((await worker.send(asset)).ok,false);
});

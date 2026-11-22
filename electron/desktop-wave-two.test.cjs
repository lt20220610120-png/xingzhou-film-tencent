const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

function sandbox(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-wave-two-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}

test('refresh preserves a media association written concurrently while querying the original job',async t=>{
 const {createGenerationJobs}=require('./generation-jobs.cjs'),dir=sandbox(t);
 const id='job-id';
 fs.writeFileSync(path.join(dir,'generation-jobs.json'),JSON.stringify([{id,kind:'video',provider:'likeai',likeJobId:id,jobId:id,status:'submitted'}]));
 let release,started;
 const entered=new Promise(resolve=>started=resolve);
 const jobs=createGenerationJobs(dir,{likeService:{query:()=>{started();return new Promise(resolve=>release=resolve);}}});
 const pending=jobs.refresh({id});await entered;
 jobs.markRecorded({id,mediaId:'cloud-media'});
 release({status:'submitted',taskId:'remote-id'});
 await pending;
 assert.equal(jobs.list()[0].jobId,'remote-id');
 assert.equal(jobs.list()[0].mediaId,'cloud-media');
});

test('media export rejects an out-of-workspace source before prompting or reading it',async t=>{
 const {exportMediaFile}=require('./local-media.cjs');
 const root=sandbox(t),mediaRoot=path.join(root,'work'),filePath=path.join(root,'outside.mp4');
 fs.mkdirSync(mediaRoot);fs.writeFileSync(filePath,'fixture');
 await assert.rejects(exportMediaFile({filePath,kind:'video'},{
  dataDir:()=>mediaRoot,showSaveDialog:async()=>assert.fail('outside paths must not reach the save dialog'),
 }),/资料目录/);
});

test('explicitly exported text keeps duplicate names and existing files',async t=>{
 const {writeTextBatch}=require('./text-batch-export.cjs');
 const root=sandbox(t);
 const folder=writeTextBatch(root,'剧本',[{name:'第一集',content:'第一版'}]);
 writeTextBatch(root,'剧本',[{name:'第一集',content:'第二版'},{name:'第一集',content:'第三版'}]);
 assert.deepEqual(fs.readdirSync(folder).map(name=>fs.readFileSync(path.join(folder,name),'utf8').slice(1)).sort(),['第一版','第三版','第二版'].sort());
});

test('canvas protocol rejects an adjacent directory and malformed URL with no file fetch',async t=>{
 const {createCanvasProtocolHandler}=require('./canvas-protocol.cjs');
 const root=sandbox(t),appDir=path.join(root,'canvas-app');
 fs.mkdirSync(appDir);fs.writeFileSync(path.join(appDir,'index.html'),'fixture');
 const handler=createCanvasProtocolHandler({appDir,fetchFile:()=>assert.fail('no unauthorized fetch')});
 for(const url of ['xzapp://another/index.html','xzapp://canvas/..%2fcanvas-app-other%2fsecret','xzapp://canvas/%E0%A4','xzapp://canvas/..%5csecret']){
  assert.equal((await handler({url,method:'GET'})).status>=400,true);
 }
});

test('navigation guards use the URL carried by Electron event objects',()=>{
 const {protectWindow,safeExternalUrl}=require('./ipc-security.cjs');
 const listeners={};const permitted='http://127.0.0.1:5173/';
 protectWindow({webContents:{on:(name,fn)=>listeners[name]=fn,setWindowOpenHandler(){}}},{allowUrl:url=>url===permitted});
 for(const eventName of ['will-navigate','will-redirect']){
  listeners[eventName]({url:permitted,preventDefault:()=>assert.fail('trusted URL was blocked')});
  let blocked=false;listeners[eventName]({url:'file:///C:/private',preventDefault:()=>blocked=true});assert.equal(blocked,true);
 }
 assert.throws(()=>safeExternalUrl('mailto:a@example.invalid?subject=%0d%0a'),/链接/);
});

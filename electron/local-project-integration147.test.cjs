const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createLocalCollabService} = require('./local-collab-service.cjs');
const {createLocalProjectMedia} = require('./local-project-media.cjs');
const {createStoryboardBatchHost} = require('./storyboard-batch-host.cjs');
const {createSecureIpc} = require('./ipc-security.cjs');
const {pathToFileURL} = require('node:url');

test('real local file, storyboard save and native batch reach provider with cloud calls disabled',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xz147-integration-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const session={token:'fixture',account:{id:'owner',username:'owner',isProducer:true}},calls=[];
 const cloud=new Proxy({}, {get:(_,method)=>async()=>{calls.push(method);throw Error('cloud offline');}});
 const service=createLocalCollabService({cloud,getSession:()=>session,getDirectory:()=>dir,mediaFor:s=>createLocalProjectMedia({root:s.root})});
 const project=await service.createProject({name:'单人离线',episodes:[{id:'e1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内',prompts:[{id:'s1',label:'1-1-1',content:'原稿'}]}]});
 const voice=path.join(dir,'voice.wav');await fs.writeFile(voice,Buffer.from('RIFF-fixture-voice'));
 const uploaded=await service.uploadMedia({projectId:project.id,kind:'audio',filePath:voice,note:'参考素材 1-1-1'});
 const refs=[{...uploaded,name:'本机音色'}];
 await service.patchStoryboard({projectId:project.id,episodeId:'e1',shotId:'s1',editPolicy:'direct',updates:{content:'本地新分镜',generationConfig:{references:refs}}});
 const saved=await service.getProject({projectId:project.id});
 assert.equal(saved.episodes[0].storyboardPrompts[0].content,'本地新分镜');assert.equal(saved.storageMode,'local');
 assert.equal((await service.listMedia({projectId:project.id}))[0].userId,'owner');
 const state={mediaProfiles:[{id:'v',kind:'video',model:'fixture-video',endpoint:'https://fixture.invalid/v1',apiKey:'only-fixture',capabilities:{ratios:['16:9'],durations:[5],resolutions:['720p'],maxAudios:5}}]};
 const {storyboardBatchItems}=await import('../core/storyboardBatch.js');
 const items=storyboardBatchItems({project:saved,scope:'project',settings:{profileId:'v',model:'fixture-video',duration:5,resolution:'720p'},accountId:'owner'});
 const submitted=[];
 const host=createStoryboardBatchHost({directory:path.join(dir,'queue'),owner:()=>session.account.id,license:async()=>{},getProject:p=>service.getProject(p),listMedia:p=>service.listMedia(p),listJobs:()=>[],getState:()=>state,patchShot:p=>service.patchStoryboard(p),submit:async input=>{
  const {validateStoryboardSubmission}=await import('../core/storyboardPublication.js');await validateStoryboardSubmission({getProject:p=>service.getProject(p),value:input,accountId:'owner'});
  const resolved=await service.resolveLocalReferences(project.id,input.references);assert.equal(await fs.readFile(resolved[0].filePath,'utf8'),'RIFF-fixture-voice');
  submitted.push(input);return {...input,id:'simulated-task',status:'submitted'};
 }});
 await host.start({projectId:project.id,accountId:'owner',scope:'project',items});await host.idle();
 assert.equal(submitted.length,1);assert.equal(submitted[0].originalPrompt,'本地新分镜');assert.deepEqual(calls,[]);
 await service.setProjectLocked({projectId:project.id,locked:true});await assert.rejects(service.patchStoryboard({projectId:project.id}),/锁定/);
});

test('local project IPC uses current device session, still validates license and aborts on logout',async()=>{
 const handlers=new Map(),entryFile=path.resolve('dist/index.html'),frame={url:pathToFileURL(entryFile).href};
 const win={isDestroyed:()=>false,webContents:{mainFrame:frame}};let token='session',licenses=0;
 const guard=createSecureIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>win,entryFile,isDev:false,getAccessService:()=>({token:()=>token,session:async()=>assert.fail('project generation must not fetch cloud session')}),getLocalAccount:async(channel,p)=>p?.projectId==='local-project'?{id:'owner'}:null,getLicenseClient:()=>({needsLicense:()=>true,requireActive:async()=>licenses++})});
 const event=()=>({sender:win.webContents,senderFrame:frame});let begin;const begun=new Promise(r=>begin=r);
 guard.handle('generation-submit',e=>new Promise((_resolve,reject)=>{begin();e.securitySignal.addEventListener('abort',()=>reject(Error('stopped')),{once:true});}));
 guard.handle('auth-logout',()=>{token='';});
 const pending=handlers.get('generation-submit')(event(),{projectId:'local-project',prompt:'fixture'});const rejected=assert.rejects(pending,/stopped/);await begun;await handlers.get('auth-logout')(event());await rejected;assert.equal(licenses,2);
});

test('transport changes during migration can rebase only unchanged reference identities',async()=>{
 const {rebaseLocalStoryboardDraft}=await import('../core/storyboardDefaults.js');
 const old={duration:5,references:[{id:'media',kind:'audio',url:'https://fixture/a.wav?sign=old'}]};
 const draft={dirty:true,base:{content:'原文',generationConfig:old},value:{prompt:'手工新稿'}};
 const shot={content:'原文',generationConfig:{duration:5,references:[{id:'media',kind:'audio',localPath:'p/media/a.wav',filePath:'D:/a.wav',mediaId:'media',localUnavailable:false}]}};
 const next=rebaseLocalStoryboardDraft(draft,shot,{storageMode:'local'});assert.equal(next.value.prompt,'手工新稿');assert.deepEqual(next.base.generationConfig,shot.generationConfig);
 assert.equal(rebaseLocalStoryboardDraft(draft,{...shot,generationConfig:{...shot.generationConfig,duration:17}},{storageMode:'local'}),draft);
});

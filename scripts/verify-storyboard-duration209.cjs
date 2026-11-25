const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {setTimeout:pause} = require('node:timers/promises');

const temp=fs.realpathSync(os.tmpdir());
if(!process.versions.electron){
 const profile=fs.mkdtempSync(path.join(temp,'xz-storyboard-209-'));
 try{
  const child=require('node:child_process').spawnSync(require('electron'),[__filename,profile],{stdio:'inherit',windowsHide:true,timeout:120000});
  if(child.error)throw child.error;
  process.exitCode=child.status??1;
 }finally{fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}
 return;
}
const {app,BrowserWindow,ipcMain}=require('electron');
const {patchShot,mergeDirectorEpisodes}=require('../cloud-backend/src/storyboard-merge.cjs');
const {handleAction}=require('../cloud-backend/src/collab.cjs');
const {createCollabService}=require('../electron/collab-service.cjs');
const {createLocalCollabService}=require('../electron/local-collab-service.cjs');
const {createStoryboardBatchHost}=require('../electron/storyboard-batch-host.cjs');
const profile=fs.realpathSync(process.argv[2]);
assert.equal(path.dirname(profile),temp);
assert.match(path.basename(profile),/^xz-storyboard-209-[A-Za-z0-9]+$/);
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});

const account={id:'wave-three-isolated',username:'qa',isProducer:true};
const auth={account,token:'fixture-session-only'};
const page='scripts/fixtures/wave-three-ui.html';
const capability={ratios:['16:9','9:16'],resolutions:['720p','1080p'],durations:[5,10,15,20,25,30],maxImages:8,minImages:0};
const profiles=['original','updated'].map(id=>({id,name:id==='original'?'原测试接口':'新测试接口',kind:'video',model:id+'-model',endpoint:'https://fixture.invalid/v1',apiKey:'fixture-only',capabilities:capability}));
const pixel='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2240%22%20height=%2224%22/%3E';
const estimate=seconds=>({version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:seconds,recommendedSeconds:seconds,capacityStatus:'正常',needsResegment:false,breakdown:{speechSeconds:seconds-2,nonparallelActionSeconds:1,pauseBufferSeconds:0.9},reason:'隔离核对台词与动作。'});
const pending={version:'2.0.0',status:'pending',maxDurationSeconds:30,error:{code:'TIMEOUT',message:'隔离待补估'}};
const source=(label,id)=>`${label}\n【基础设定】\n${id==='s0'?'道具：台灯（参考@），桌上。钥匙（参考@）。\n':''}【分镜】\n林夏起身，慢慢走去门口。`;
const startingEpisodes=()=>[
 {id:'ep-1',number:1,episodeNumber:1,title:'第1集',content:'1-1 客厅 日 内\n林夏：隔离样本。\n1-2 玄关 日 内\n林夏：走吧。',labels:[['s0','1-1-1'],['s1','1-1-2'],['s2','1-1-3'],['s3','1-2-1']]},
 {id:'ep-2',number:2,episodeNumber:2,title:'第2集',content:'2-1 廊桥 日 外\n林夏：回家。',labels:[['s4','2-1-1']]},
].map(({labels,...episode})=>({...episode,storyboardWorkspacePolicy:'published',prompts:labels.map(([id,label])=>({id:`director-${id}`,label,content:source(label,id),durationEstimate:id==='s0'||id==='s2'?pending:estimate(11)})),
 storyboardPrompts:labels.map(([id,label])=>{
  const sourceContent=source(label,id);
  let index=0;
  const content=sourceContent.replace(/参考@/g,()=>`参考@image${++index}`);
  const references=id==='s0'?['台灯','钥匙'].map((name,index)=>({id:`test-image-${index}`,name,kind:'image',url:`${pixel}#${index}`})):[];
  return {id,label,content,sourceContent,sourcePromptId:`director-${id}`,storyboardPublicationId:'fixture-published',durationStatus:id==='s0'?'needs-review':undefined,
   durationEstimate:id==='s0'?{...estimate(11),status:'needs-review'}:id==='s2'?pending:estimate(11),
   generationConfig:{profileId:'original',model:'original-model',ratio:'16:9',duration:5,resolution:'720p',durationMode:'recommended',referenceBindingMode:'storyboard',
    bindingSourcePrompt:sourceContent,bindingCompiledPrompt:content,bindingExpectedReferences:references.map(ref=>ref.id),references}};
 })}));

async function setup(mode,directory){
 const {directorDurationTargets,applyDirectorDurationResult}=await import('../core/directorDurationWorkflow.js');
 const episodes=startingEpisodes(),id='20920920-9209-4920-8920-920920920920';
 let director={id:'1795650000000-fixture209',name:'隔离导演估时项目',masterScript:episodes.map(ep=>`${ep.title}\n${ep.content}`).join('\n'),
  episodes:episodes.map(({storyboardPrompts,storyboardWorkspacePolicy,...ep})=>ep)};
 const target=directorDurationTargets(director,{promptId:'director-s0',onlyPending:true})[0];
 assert.ok(target);
 director=applyDirectorDurationResult(director,target,new Map([['1-1-1',estimate(23)]]));
 let project={id,name:director.name,owner_id:account.id,owner_name:account.username,myRole:'producer',storageMode:mode,
  director_project_id:director.id,script:director.masterScript,episodes,analysis_progress:{},updated_at:'2026-11-26T00:00:00Z'};
 let service;
 if(mode==='local'){
  const noCloud=new Proxy({listProjects:async()=>[]},{get:(target,key)=>target[key]||(()=>{throw Error('本机测试意外走云端');})});
  service=createLocalCollabService({cloud:noCloud,getSession:()=>auth,getDirectory:()=>directory,mediaFor:()=>({materialize:structuredClone})});
  project=await service.createProject({name:director.name,script:director.masterScript,episodes,directorProjectId:director.id});
 }else{
  const repo={getProject:async pid=>pid===id?structuredClone(project):null,isProjectLocked:async()=>false,
   syncDirectorSnapshot:async(pid,updates,userId)=>{
    assert.equal(pid,id);assert.equal(userId,account.id);
    project={...project,script:updates.script,episodes:mergeDirectorEpisodes(project.episodes,updates.episodes)};
    return structuredClone(project);
   },
   patchStoryboard:async(pid,payload,userId)=>{
    assert.equal(pid,id);assert.equal(userId,account.id);
    project={...project,episodes:patchShot(project.episodes,payload)};
    return structuredClone(project);
   }};
  service=createCollabService(()=>auth,{callGateway:async(action,payload)=>{
   if(action==='project-list')return [structuredClone(project)];
   const result=await handleAction(action,payload,account,repo);
   if(result.status>=400)throw Error(result.body.error);
   return {...result.body,...(action==='project-get'||action==='project-update'||action==='storyboard-patch'&&result.body.episodes?{storageMode:mode}:{})};
  }});
 }
 const sent=[],patches=[];
 const read=()=>service.getProject({projectId:project.id});
 const patch=payload=>{patches.push(structuredClone(payload));return service.patchStoryboard(payload);};
 const host=createStoryboardBatchHost({directory:path.join(directory,'queue'),owner:()=>account.id,license:async()=>{},getProject:read,listMedia:async()=>[],listJobs:()=>[],getState:()=>({mediaProfiles:profiles,activeVideoApiId:profiles[0].id}),patchShot:patch,
  submit:async({shotId,duration,profileId,model,ratio,resolution})=>{
   sent.push({shotId,duration,profileId,model,ratio,resolution});
   return {id:`mock-upstream-${sent.length}`,status:'submitted'};
  }});
 return {director,profiles,sent,patches,read,mode:project.storageMode,
  call(method,payload){
   if(method==='start')return host.start(payload);
   if(method==='list')return host.list(payload);
   if(method==='patchStoryboard')return patch(payload);
   if(['listProjects','getProject','updateProject'].includes(method))return service[method](method==='listProjects'?{}:payload);
   throw Error('未知隔离调用');
  }};
}

app.whenReady().then(async()=>{
 let server,win,fixture,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root:path.join(__dirname,'..'),configFile:false,cacheDir:path.join(profile,'cache'),optimizeDeps:{entries:[page]},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
  await server.listen();
  const local=server.resolvedUrls.local[0],preload=path.join(profile,'preload.cjs');
  fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('storyboard209Fixture',{bootstrap:()=>ipcRenderer.invoke('board209-init'),call:(name,p)=>ipcRenderer.invoke('board209-call',name,p)});`);
  ipcMain.handle('board209-init',()=>({director:fixture.director,profiles:fixture.profiles}));
  ipcMain.handle('board209-call',(_,name,payload)=>fixture.call(name,payload));
  const reports=[],widths=process.env.XZ_209_FIRST_ONLY?[1280]:[1280,1600,1920];
  for(const width of widths)for(const mode of ['local','cloud']){
   fixture=await setup(mode,fs.mkdtempSync(path.join(profile,`${mode}-${width}-`)));
   const partition=`timing209-${mode}-${width}`,external=[];
   win=new BrowserWindow({width,height:920,show:false,useContentSize:true,webPreferences:{preload,partition,backgroundThrottling:false}});
   win.webContents.on('console-message',event=>{if(event.level==='error'||event.level>=3)console.error(event.message);});
   win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']},({url},done)=>{
    const blocked=/^(?:https?|wss?):/.test(url)&&!url.startsWith(local)&&!url.startsWith(local.replace(/^http/,'ws'));
    if(blocked)external.push(new URL(url).hostname);
    done({cancel:blocked});
   });
   const run=(fn,...args)=>win.webContents.executeJavaScript(`(${fn})(...${JSON.stringify(args)})`);
   const until=async(fn,...args)=>{
    for(let i=0;i<120;i++){const value=await run(fn,...args);if(value)return value;await pause(40);}
    throw Error(`${mode}/${width} timed out: ${fn} ${JSON.stringify(args)}`);
   };
   const click=(selector,label)=>until((selector,label)=>{
    const el=[...document.querySelectorAll(selector)].find(e=>!e.disabled&&e.getClientRects().length&&(!label||e.textContent.trim()===label||e.getAttribute('aria-label')===label));
    if(!el)return false;
    el.click();return true;
   },selector,label);
   const card=id=>`.collab-shot-card[data-shot-id="${id}"]`;
   const mention=(selector,value)=>until((selector,value)=>document.querySelector(selector)?.textContent.includes(value),selector,value);
   const select=async(selector,value)=>{
    await until((selector,value)=>[...document.querySelector(selector)?.options||[]].some(o=>o.value===value),selector,value);
    await run((selector,value)=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},selector,value);
   };
   const badge=id=>`${card(id)} :is(.duration-estimate-tag,.prompt-duration)`;
   const allShots=async()=>Object.fromEntries((await fixture.read()).episodes.flatMap(ep=>ep.storyboardPrompts).map(shot=>[shot.id,shot]));
   const references=`${card('s0')} .generation-references`;
   const referenceCount=count=>until((selector,count)=>document.querySelector(selector)?.querySelectorAll('figure').length===count,references,count);
   const generationEnabled=(id,enabled)=>until((selector,enabled)=>[...document.querySelectorAll(selector)].some(el=>el.disabled!==enabled&&el.textContent.trim()==='生成视频'),`${card(id)} .generation-controls button`,enabled);
   await win.loadURL(`${local}${page}?storyboard-duration209`);
   await click('#app-sidebar button','导演工作台');
   await click('.mode-switch button','快速模式');
   await mention('.director-stage','建议生成时长 23 秒');
   await click('#app-sidebar button','项目协作');
   await click('.collab-hub button','进入项目');
   await click('.collab-rail button','分镜');
   await click('.collab-episode-card');
   await mention(badge('s0'),'建议生成时长 23 秒');
   assert.equal((await allShots()).s0.durationEstimate.recommendedSeconds,23);
   await until(selector=>[...document.querySelectorAll(selector)].some(el=>el.disabled&&el.textContent.trim()==='保存分镜'),`${card('s0')} .storyboard-save-actions button`);
   await referenceCount(2);
   await click(`${card('s0')} .reference-remove`,'移除台灯');
   await referenceCount(1);
   await until(selector=>document.querySelector(selector)?.textContent.trim()==='@image1',`${references} .reference-alias`);
   await mention(badge('s0'),'建议生成时长 23 秒');
   await generationEnabled('s0',true);
   await run(selector=>{
    const el=document.querySelector(selector);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,el.value+'\n林夏：这句正文尚未保存。');
    el.dispatchEvent(new Event('input',{bubbles:true}));
   },`${card('s1')} textarea[aria-label="提示词"]`);
   await mention(badge('s1'),'待复核');
   await generationEnabled('s1',false);
   const scopes=[['scene',['s0']],['episode',['s0','s3']],['project',['s0','s3','s4']]];
   for(const [scope,expected] of scopes){
    await select('select[aria-label="默认生成接口"]','updated');
    await select('select[aria-label="默认画面比例"]','9:16');
    await select('select[aria-label="默认分辨率"]','1080p');
    await select('select[aria-label="批量生成范围"]',scope);
    await click('.storyboard-batch-controls button','按建议时长设置');
    await mention('.storyboard-timing-notice',`已按建议设置 ${expected.length} 条`);
    await mention('.storyboard-timing-notice','1-1-2');
    const shots=await allShots();
    for(const shotId of expected){
     const config=shots[shotId].generationConfig;
     assert.deepEqual([config.profileId,config.model,config.ratio,config.resolution,config.duration],['updated','updated-model','9:16','1080p',shotId==='s0'?25:15],`${mode} ${scope} ${shotId}`);
    }
    assert.equal(shots.s1.generationConfig.profileId,'original');
    assert.doesNotMatch(shots.s1.content,/尚未保存/);
    await mention(badge('s1'),'待复核');
    await referenceCount(1);
   }
   await click(`${card('s0')} details summary`,'恢复素材（1）');
   await click(`${card('s0')} .storyboard-reference-recovery button`,'全部恢复');
   await referenceCount(2);
   await mention(badge('s0'),'建议生成时长 23 秒');
   await generationEnabled('s0',true);
   await click('.storyboard-batch-controls button','一键生成');
   await click('.storyboard-batch-confirm button','确认并开始');
   for(let i=0;i<100&&fixture.sent.length<3;i++)await pause(50);
   assert.deepEqual(fixture.sent.map(row=>[row.shotId,row.duration]).sort(),[['s0',25],['s3',15],['s4',15]]);
   assert.ok(fixture.sent.every(row=>row.model==='updated-model'&&row.profileId==='updated'&&row.ratio==='9:16'&&row.resolution==='1080p'));
   await mention('.storyboard-batch-progress [role="status"]','1-1-2');
   await mention('.storyboard-batch-progress [role="status"]','1-1-3');
   assert.doesNotMatch((await allShots()).s1.content,/尚未保存/);
   assert.deepEqual(external,[]);
   assert.deepEqual(await run(()=>window.waveThree.attemptedPaid),[]);
   reports.push({mode,width,latestDirectorSeconds:23,materialRemoveAndRestore:true,dirtyShotSkipped:true,scopes:scopes.map(([scope,ids])=>[scope,ids.length]),simulatedSubmissions:fixture.sent.length});
   win.destroy();win=null;
  }
  console.log(JSON.stringify({reports,realPaidCalls:0}));
 }catch(error){
  exit=1;console.error(error);
  if(win&&!win.isDestroyed())console.error(await win.webContents.executeJavaScript(`document.body.innerText.slice(0,3500)`).catch(()=>null));
 }finally{win?.destroy();await server?.close();app.exit(exit);}
});

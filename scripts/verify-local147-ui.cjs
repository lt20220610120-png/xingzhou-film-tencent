const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createLocalCollabService}=require('../electron/local-collab-service.cjs');
const {createLocalProjectMedia}=require('../electron/local-project-media.cjs');
const {createStoryboardBatchHost}=require('../electron/storyboard-batch-host.cjs');
const {handleAction}=require('../cloud-backend/src/collab.cjs');
const {database}=require('./qa-local-share147.cjs');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5884/';
const out=path.resolve('output/playwright/local-2.8.147');fs.mkdirSync(out,{recursive:true});
const report={checks:[],providerCalls:0,projectCloudCalls:0,paidCalls:0};
let browser,page,temp;
(async()=>{
 temp=await fsp.mkdtemp(path.join(os.tmpdir(),'xz147-react-'));
 const account={id:'ef1130a6-d13f-4d67-9a5f-7c5f0edeb2a1',username:'qa-owner',displayName:'制片',roles:['director'],activeRole:'director',isProducer:true};
 const session={token:'qa-only',account};const db=database();let online=false;
 const source={name:'本机制作验收',directorProjectId:'1794400000000-qa',episodes:[{id:'e1',title:'第一集',episodeNumber:1,content:'1-1 房间 日 内\n林：回来吧。',prompts:[{id:'s1',label:'1-1-1',recommendedDurationSeconds:12,content:'第一条原稿'},{id:'s2',label:'1-1-2',recommendedDurationSeconds:17,content:'第二条原稿'}]}]};
 const jobs=[];let queue;
 const serverCall=async(action,p)=>{
  report.projectCloudCalls++;if(!online)throw Error('云项目服务不可达');
  const result=await handleAction(action,p,{...account,display_name:account.displayName},db.repo);
  if(result.status>=400)throw Object.assign(Error(result.body.error),{status:result.status,code:result.body.code});return result.body;
 };
 const cloud={
  prepareLocalShare:p=>serverCall('project-local-share-prepare',p),commitLocalShare:p=>serverCall('project-local-share',p),
  getProject:async()=>{report.projectCloudCalls++;if(!online)throw Error('cloud offline');const r=db.state.project;return {...r,myRole:'producer',genre:'',storageMode:'cloud'};},
  listProjects:async()=>{report.projectCloudCalls++;if(!online)throw Error('cloud offline');return db.state.project?[{...db.state.project,myRole:'producer'}]:[];},
  listAssets:async()=>db.state.assets.map(a=>({...a,images:db.state.media.filter(m=>m.asset_id===a.id).map(m=>({...m,assetId:a.id,projectId:m.project_id,url:'data:image/png;base64,'+png}))})),
  listMedia:async()=>db.state.media.map(m=>({...m,projectId:m.project_id,userId:m.user_id,objectKey:m.object_path,url:'data:audio/wav;base64,'+wav.toString('base64')})),
  listMembers:async()=>db.state.members,listTasks:async()=>[],listMessages:async()=>[],
  patchStoryboard:async p=>{db.state.project.episodes=require('../cloud-backend/src/storyboard-merge.cjs').patchShot(db.state.project.episodes,p);return cloud.getProject();},
 };
 const make=()=>createLocalCollabService({cloud,getSession:()=>session,getDirectory:()=>temp,mediaFor:s=>createLocalProjectMedia({root:s.root,upload:async(id,file)=>({objectKey:`projects/${id}/audio/123-asset.wav`})})});
 let service=make();const project=await service.createProject(source);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
 const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(1636,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
 const voice=path.join(temp,'本机参考.wav');await fsp.writeFile(voice,wav);
 const uploaded=await service.uploadMedia({projectId:project.id,filePath:voice,kind:'audio',episode:1,scene:'1-1',note:'参考素材 1-1-1'});
 const profiles=[{id:'qa',provider:'libtv',kind:'video',name:'验收模型',model:'qa-model',modelCatalog:[{id:'qa-model',kind:'video',name:'验收模型',durations:[5,12,17,30],ratios:['16:9'],resolutions:['720p'],maxAudios:4,maxImages:8,maxVideos:1,schema:{properties:{modeType:{items:{text2video:[0,0],image2video:[1,8],mixed2video:[0,8]},mixed2videoConfig:{imageMax:8,audioMax:4,videoMax:1}}},config:{settings:[]}}}]}];
 const state={directorProjects:[],apiProfiles:[],mediaProfiles:profiles,activeVideoApiId:'qa'};
 const submit=async input=>{const resolved=await service.resolveLocalReferences(project.id,input.references||[]);if(resolved.length)assert.equal((await fsp.readFile(resolved[0].filePath)).length,wav.length);const result={...input,id:'sim-'+jobs.length,status:'submitted',referenceAccountId:account.id};jobs.push(result);report.providerCalls++;return result;};
 const batch=()=>queue||(queue=createStoryboardBatchHost({directory:path.join(temp,'batch'),owner:()=>account.id,license:async()=>{},getProject:p=>service.getProject(p),listMedia:p=>service.listMedia(p),listJobs:()=>jobs,getState:()=>state,schema:async()=>profiles[0].modelCatalog[0],patchShot:p=>service.patchStoryboard(p),submit}));
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});const context=await browser.newContext({viewport:{width:1700,height:1100}});
 await context.route('**/*',async route=>{
  const url=route.request().url();if(!url.startsWith(base)&&!url.startsWith('data:'))return route.abort();
  if(!url.startsWith(base+'__qa/local'))return route.continue();
  try{
   const {method,payload}=route.request().postDataJSON();let result;
   if(method==='generationSubmit')result=await submit(payload);
   else if(method==='generationList')result=jobs;
   else if(method==='schema')result=profiles[0].modelCatalog[0];
   else if(method==='state')result=state;
   else if(method==='restart'){service=make();result=true;}
   else if(method==='upload')result=await service.uploadMedia({...payload,filePath:voice,kind:'audio'});
   else if(method.startsWith('batch'))result=await batch()[method.slice(5).toLowerCase()](payload);
   else result=await service[method](payload);
   const adapt=async value=>{
    if(Array.isArray(value))return Promise.all(value.map(adapt));if(!value||typeof value!=='object')return value;
    const row={};for(const [k,v]of Object.entries(value))row[k]=await adapt(v);
    if(row.filePath&&fs.existsSync(row.filePath)){row.url='data:'+(row.mime||'audio/wav')+';base64,'+(await fsp.readFile(row.filePath)).toString('base64');delete row.filePath;}
    return row;
   };
   await route.fulfill({json:await adapt(result)});
  }catch(error){report.routeErrors||=[];report.routeErrors.push(error.stack);await route.fulfill({status:400,json:{error:error.message}});}
 });
 page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];report.requests=[];page.on('request',r=>{if(report.requests.length<25)report.requests.push(r.url());});page.on('requestfailed',r=>report.requestError={url:r.url(),failure:r.failure()});page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',m=>{if(m.type()==='error'){report.consoleErrors||=[];report.consoleErrors.push(m.text());}});
 await page.addInitScript(({project,account,state})=>{
  if(!localStorage.getItem('qa147')){localStorage.clear();localStorage.setItem('qa147','1');localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project',project.id);localStorage.setItem('xz-collab-last-section','storyboard');}
  const ask=async(method,payload={})=>{const r=await fetch('/__qa/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,payload})});const v=await r.json();if(!r.ok)throw Error(v.error);return v;};window.__ask=ask;
  const empty=async()=>[],nothing=async()=>null;
  window.xingzhou={loadState:async()=>state,saveState:async()=>{},loadDirectorProjects:empty,authSession:async()=>account,appVersion:async()=>'2.8.147',storageInfo:async()=>({dataDir:'isolated147'}),onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),collabIsProducer:async()=>true,directorCollabListProjects:empty,
   analysisLoad:nothing,analysisSave:async()=>{},artReviewLoadLocal:nothing,artReviewSaveLocal:async()=>{},promptArtStatus:async()=>({enabled:false}),promptArtLoad:nothing,
   collabListProjects:p=>ask('listProjects',p),collabGetProject:p=>ask('getProject',p),collabListAssets:p=>ask('listAssets',p),collabListMedia:p=>ask('listMedia',p),collabPatchStoryboard:p=>ask('patchStoryboard',p),collabUpdateProject:p=>ask('updateProject',p),collabListMembers:p=>ask('listMembers',p),collabListMessages:p=>ask('listMessages',p),collabListTasks:p=>ask('listTasks',p),collabAddMember:p=>ask('addMember',p),collabUploadMedia:p=>ask('upload',p),collabDeleteMedia:p=>ask('deleteMedia',p),
   generationSubmit:p=>ask('generationSubmit',p),generationList:()=>ask('generationList'),libtvModelSchema:()=>ask('schema'),libtvProjects:async()=>({projects:[],selectedId:""}),
   storyboardBatchStart:p=>ask('batchStart',p),storyboardBatchList:p=>ask('batchList',p),storyboardBatchStop:p=>ask('batchStop',p),storyboardBatchResume:p=>ask('batchResume',p),
  };
 },{project,account,state});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.getByText('本机保存',{exact:true}).waitFor();await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();if(await page.locator('.collab-episode-card').count())await page.locator('.collab-episode-card').first().click();
 const first=page.locator('.collab-shot-card').first();const editor=first.getByLabel('提示词',{exact:true});await editor.fill('云项目服务不可达时的本机修改');await first.getByRole('button',{name:'保存分镜',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.collab-shot-card .storyboard-save-actions button')?.disabled);
 assert.equal((await service.getProject({projectId:project.id})).episodes[0].storyboardPrompts[0].content,'云项目服务不可达时的本机修改');
 await first.getByRole('button',{name:'参考音频',exact:true}).click();const picker=page.getByRole('dialog',{name:'选择项目参考素材'});const voiceChoice=picker.getByRole('button',{name:'选择本机参考.wav',exact:true});if(await voiceChoice.getAttribute('aria-pressed')!=='true')await voiceChoice.click();await picker.getByRole('button',{name:'确认引用',exact:true}).click();
 await first.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.generation-results').length>0).catch(()=>{});assert.equal(report.providerCalls,1);assert.equal(jobs[0].references[0].id,uploaded.id);
 const tools=page.getByRole('region',{name:'生成设置'});await tools.getByRole('button',{name:'按建议时长设置',exact:true}).click();await page.getByRole('status').filter({hasText:'已按建议设置 2 条'}).waitFor();
 await tools.getByRole('button',{name:'一键生成',exact:true}).click();await page.getByRole('dialog',{name:'确认批量生成'}).getByRole('button',{name:'确认并开始',exact:true}).click();await page.waitForTimeout(300);await batch().idle();assert.equal(report.providerCalls,2);assert.equal(jobs[1].duration,17);
 assert.equal(report.projectCloudCalls,0);report.checks.push('cloud project service unavailable: local save, selected audio and single video submit, per-shot timing and native batch all work with zero project-cloud calls');
 for(const width of [1280,1700,2232]){await page.setViewportSize({width,height:1100});await page.evaluate(()=>scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'local-storyboard-'+width+'.png')});}await page.getByRole('region',{name:'生成设置'}).getByRole('button',{name:/生成设置/}).click();await page.screenshot({path:path.join(out,'local-storyboard-collapsed.png')});await page.evaluate(()=>__ask('restart'));await page.reload();await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.getByText('本机保存',{exact:true}).waitFor();await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();if(await page.locator('.collab-episode-card').count())await page.locator('.collab-episode-card').first().click();assert.equal(await editor.inputValue(),'云项目服务不可达时的本机修改');report.checks.push('native service and page restart keep saved local storyboard and media');
 await page.locator('.collab-rail').getByRole('button',{name:'邀请协作',exact:true}).click();await page.getByText('邀请时将上传本机项目和素材，并开启云端协作。',{exact:true}).waitFor();
 const invite=page.getByPlaceholder('输入对方注册的账号名（唯一）');await invite.fill('collaborator');await page.getByRole('button',{name:'邀请进入项目',exact:true}).click();await page.getByText('云项目服务不可达',{exact:false}).first().waitFor();assert.equal(await service.isLocal(project.id),true);assert.equal(db.state.members.length,0);
 jobs.forEach(j=>j.status='success');online=true;await page.getByRole('button',{name:'邀请进入项目',exact:true}).click();await page.waitForTimeout(800);report.shareLocal=await service.isLocal(project.id);await page.getByText('云端协作',{exact:true}).waitFor();assert.equal(await service.isLocal(project.id),false);assert.equal(db.state.project.id,project.id);assert.equal(db.state.project.episodes[0].storyboardPrompts[0].content,'云项目服务不可达时的本机修改');assert(db.state.members.some(m=>m.user_id!==account.id));assert(db.state.media.length>=1);report.checks.push('failed invitation preserves local project; explicit retry atomically shares same project ID, saved storyboard, selected audio and collaborator');
 for(const width of [1280,1700,2232]){await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'invite-'+width+'.png')});}
 assert.deepEqual(errors,[]);report.passed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await fsp.rm(temp,{recursive:true,force:true});console.log(JSON.stringify(report));
})().catch(async error=>{report.error=error.stack;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(error);process.exitCode=1;});

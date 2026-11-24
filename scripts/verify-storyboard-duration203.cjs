const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');
const {patchShot}=require('../cloud-backend/src/storyboard-merge.cjs');
const {createStoryboardBatchHost}=require('../electron/storyboard-batch-host.cjs');

const root=path.resolve(__dirname,'..'),page='scripts/fixtures/storyboard-duration203.html';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'xz-storyboard-duration203-'));
app.setPath('userData',scratch);app.setPath('sessionData',scratch);app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});

const accountId='fixture-account';
const state={activeVideoApiId:'discrete',activeApiId:'text',apiProfiles:[{id:'text',name:'测试文本模型',model:'text-fixture'}],mediaProfiles:[
 {id:'discrete',name:'离散测试模型',kind:'video',model:'discrete-model',endpoint:'https://fixture.invalid/v1',apiKey:'fixture-only',capabilities:{ratios:['16:9'],resolutions:['720p'],durations:[5,10,15,20,30]}},
 {id:'continuous',name:'连续测试模型',kind:'video',model:'continuous-model',endpoint:'https://fixture.invalid/v1',apiKey:'fixture-only',capabilities:{ratios:['16:9'],resolutions:['720p'],durationRange:{min:4,max:30}}},
]};
const estimate=seconds=>({version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:seconds,recommendedSeconds:seconds,capacityStatus:'正常',needsResegment:false,breakdown:{speechSeconds:seconds-2,nonparallelActionSeconds:1,pauseBufferSeconds:0.9},reason:'对白与动作按先后估算。'});
const init=()=>({id:'p',myRole:'producer',storageMode:'local',episodes:[{id:'ep',title:'第一集',episodeNumber:1,content:'1-1 客厅 日 内\n她走进来。',storyboardPrompts:[11,14,null].map((seconds,index)=>({
 id:'s'+index,label:`1-1-${index+1}`,content:'进入房间 '+(index+1),durationSourceScript:'- 进入房间。',
 durationEstimate:seconds?estimate(seconds):{version:'2.0.0',status:'pending',maxDurationSeconds:30,error:{code:'TIMEOUT',message:'估时超时。'}},
 generationConfig:{profileId:'discrete',model:'discrete-model',duration:5,ratio:'16:9',resolution:'720p',references:[]},
 }))}]});
const widths=[1280,1600,1920];

app.whenReady().then(async()=>{
 let server,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(scratch,'vite-cache'),optimizeDeps:{entries:[page]},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
  await server.listen();const local=server.resolvedUrls.local[0];
  const preload=path.join(scratch,'preload.cjs');
  fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('storyboardDurationFixture',Object.fromEntries(['bootstrap','project','patch','estimate','start','list'].map(name=>[name,p=>ipcRenderer.invoke('timing-'+name,p)])));`);
  let project,host,sent,textCalls,iteration=0;
  const save=p=>{project={...project,episodes:patchShot(project.episodes,p)};return project;};
  ipcMain.handle('timing-bootstrap',()=>{
   project=init();sent=[];textCalls=0;
   host=createStoryboardBatchHost({directory:path.join(scratch,`run-${++iteration}`),owner:()=>accountId,license:async()=>{},getProject:async()=>project,listMedia:async()=>[],listJobs:()=>[],getState:()=>state,patchShot:async p=>save(p),submit:async input=>{sent.push(input.duration);return {id:`job-${sent.length}`,status:'submitted'};}});
   return {project,state};
  });
  ipcMain.handle('timing-project',()=>project);
  ipcMain.handle('timing-patch',(_,p)=>save(p));
  ipcMain.handle('timing-start',async(_,p)=>{const batch=await host.start(p);await host.idle();return batch;});
  ipcMain.handle('timing-list',(_,p)=>host.list(p));
  ipcMain.handle('timing-estimate',(_,p)=>{
   textCalls++;assert.equal(p.profileId,'text');
   const data=JSON.parse(p.messages.at(-1).content),segment=data.segments[0];
   assert.match(segment.script,/进入房间/);assert.match(segment.prompt,/修改后的正片/);
   return JSON.stringify({max_duration_seconds:30,limit_defaulted:false,schema_version:'1.0',results:[{
    segment_id:segment.segment_id,timing:{natural_seconds:3,recommended_seconds:3,needs_resegment:false},breakdown:{speech_seconds:0,nonparallel_action_seconds:2.2,pause_buffer_seconds:0.6},reason:'微动及气口。',capacity_status:'正常',
   }],errors:[]});
  });
  for(const width of widths){
   const win=new BrowserWindow({width,height:940,show:false,webPreferences:{preload,backgroundThrottling:false}});
   const requests=[];
   win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>{if(!url.startsWith(local))requests.push(url);done({cancel:!url.startsWith(local)});});
   const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
   const until=async(fn,...args)=>{for(let i=0;i<100;i++){const result=await run(fn,...args);if(result)return result;await pause(50);}throw Error('Timed out: '+fn+' '+JSON.stringify(args));};
   const button=(selector,label)=>until((selector,label)=>{const target=[...document.querySelectorAll(selector)].find(x=>x.textContent.trim()===label&&!x.disabled&&x.getClientRects().length);if(!target)return false;target.click();return true;},selector,label);
   const card=id=>`.collab-shot-card[data-shot-id="s${id}"]`;
   const mention=(selector,content)=>until((selector,content)=>document.querySelector(selector)?.textContent.includes(content),selector,content);
   const select=async(selector,value)=>{await until(selector=>Boolean(document.querySelector(selector)),selector);await run((selector,value)=>{const node=document.querySelector(selector);node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));},selector,value);};
   try{
    await win.loadURL(local+page);
    await until(()=>{const node=document.querySelector('.collab-episode-card');if(!node)return false;node.click();return true;});
    await mention(card(2),'待估时');
    await button('.storyboard-batch-controls button','一键生成');
    await button('.storyboard-batch-confirm button','确认并开始');
    await mention('.storyboard-batch .collab-error','批量生成未启动');assert.equal(sent.length,0);
    await button('.storyboard-batch-confirm button','取消');
    await select(card(1)+' select[aria-label="时长"]','10');await button(card(1)+' button','保存分镜');
    await until(async()=> (await window.storyboardDurationFixture.project()).episodes[0].storyboardPrompts[1].generationConfig.durationManuallyAdjusted===true);
    await run(selector=>{const node=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,'修改后的正片');node.dispatchEvent(new Event('input',{bubbles:true}));},card(2)+' textarea[aria-label="提示词"]');
    await button(card(2)+' button','重估时长');await mention(card(2),'建议生成时长 3 秒');assert.equal(textCalls,1);
    assert.match(project.episodes[0].storyboardPrompts[2].content,/修改后的正片/);
    await button('.storyboard-batch-controls button','按建议时长设置');
    await mention('.storyboard-timing-notice','已保护 1 条手调时长');
    assert.deepEqual(project.episodes[0].storyboardPrompts.map(row=>row.generationConfig.duration),[15,10,5]);
    await button('.storyboard-timing-notice button','重置手调时长');await button('.workspace-dialog button','确认');
    await mention('.storyboard-timing-notice','已按建议设置 3 条');
    assert.equal(project.episodes[0].storyboardPrompts[1].generationConfig.durationManuallyAdjusted,undefined);
    await select('select[aria-label="默认生成接口"]','continuous');
    await button('.storyboard-batch-controls button','按建议时长设置');
    await until(async()=> (await window.storyboardDurationFixture.project()).episodes[0].storyboardPrompts[0].generationConfig.profileId==='continuous');
    assert.deepEqual(project.episodes[0].storyboardPrompts.map(row=>row.generationConfig.duration),[11,14,4]);
    await button('.storyboard-batch-controls button','一键生成');await button('.storyboard-batch-confirm button','确认并开始');
    for(let i=0;i<100&&sent.length<3;i++)await pause(50);
    assert.deepEqual(sent,[11,14,4]);assert.deepEqual(requests,[]);
   } finally {await win.webContents.session.clearStorageData();win.destroy();}
  }
  console.log(JSON.stringify({widths,awaitingStopsScope:true,manualPreservedAndReset:true,editedShotReestimated:true,alignedDiscrete:[15,10,5],continuousBatch:[11,14,4],realPaidCalls:0}));
 }catch(error){exit=1;console.error(error);}
 finally{await server?.close();for(const win of BrowserWindow.getAllWindows())win.destroy();await fs.promises.rm(scratch,{recursive:true,force:true,maxRetries:8,retryDelay:100}).catch(error=>{console.error(error.message);exit=1;});app.exit(exit);}
});

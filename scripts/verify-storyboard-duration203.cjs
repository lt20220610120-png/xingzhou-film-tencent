const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const temp=fs.realpathSync(os.tmpdir());
if(!process.versions.electron){
 const scratch=fs.mkdtempSync(path.join(temp,'xz-storyboard-duration203-'));
 try{
  const {spawnSync}=require('node:child_process');
  const child=spawnSync(require('electron'),[__filename,scratch],{stdio:'inherit',windowsHide:true,timeout:120000});
  if(child.error)throw child.error;
  process.exitCode=child.status??1;
 }finally{
  fs.rmSync(scratch,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
 return;
}
const {app,BrowserWindow,ipcMain}=require('electron');
const {setTimeout:pause}=require('node:timers/promises');
const {patchShot}=require('../cloud-backend/src/storyboard-merge.cjs');
const {createStoryboardBatchHost}=require('../electron/storyboard-batch-host.cjs');
const {requestChat}=require('../electron/ai-service.cjs');

const root=path.resolve(__dirname,'..'),page='scripts/fixtures/storyboard-duration203.html';
const scratch=fs.realpathSync(process.argv[2]);
assert.equal(path.dirname(scratch),temp);
assert.match(path.basename(scratch),/^xz-storyboard-duration203-[A-Za-z0-9]+$/);
app.setPath('userData',scratch);app.setPath('sessionData',scratch);app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});

const accountId='fixture-account';
const state={activeVideoApiId:'discrete',activeApiId:'text',apiProfiles:[{id:'text',name:'测试文本模型',model:'cn:deepseek-v4.1-flash',endpoint:'https://fixture.invalid/v1',requiresApiKey:false}],mediaProfiles:[
 {id:'discrete',name:'离散测试模型',kind:'video',model:'discrete-model',endpoint:'https://fixture.invalid/v1',apiKey:'fixture-only',capabilities:{ratios:['16:9'],resolutions:['720p'],durations:[5,10,15,20,30]}},
 {id:'continuous',name:'连续测试模型',kind:'video',model:'continuous-model',endpoint:'https://fixture.invalid/v1',apiKey:'fixture-only',capabilities:{ratios:['16:9','9:16'],resolutions:['720p','1080p'],durationRange:{min:4,max:30}}},
 {id:'restricted',name:'短时测试模型',kind:'video',model:'restricted-model',endpoint:'https://fixture.invalid/v1',apiKey:'fixture-only',capabilities:{ratios:['9:16'],resolutions:['1080p'],durations:[5,15]}},
]};
const estimate=(seconds,cap=30,overload=false)=>({version:'2.0.0',status:'estimated',maxDurationSeconds:cap,naturalSeconds:seconds,recommendedSeconds:seconds,capacityStatus:overload?'超载需重分':'正常',needsResegment:overload,breakdown:{speechSeconds:seconds-2,nonparallelActionSeconds:1,pauseBufferSeconds:0.9},reason:overload?'对白和动作无法在上限内演完，需重新划分片段并重新生成提示词。':'对白与动作按先后估算。'});
const init=()=>({id:'p',myRole:'producer',storageMode:'local',episodes:[{id:'ep',title:'第一集',episodeNumber:1,content:'1-1 客厅 日 内\n她走进来。',storyboardPrompts:[11,14,null].map((seconds,index)=>({
 id:'s'+index,label:`1-1-${index+1}`,content:'进入房间 '+(index+1),durationSourceScript:'- 进入房间。',
 durationEstimate:seconds?estimate(seconds):{version:'2.0.0',status:'pending',maxDurationSeconds:30,error:{code:'TIMEOUT',message:'估时超时。'}},
 generationConfig:{profileId:'discrete',model:'discrete-model',durationMode:'recommended',duration:5,ratio:'16:9',resolution:'720p',references:[]},
 }))}]});
const policyProject=()=>{
 const project=init(),shots=project.episodes[0].storyboardPrompts;
 shots[0].durationEstimate=estimate(11,15);
 shots[1].durationEstimate=estimate(19,15,true);
 return project;
};
const widths=[1280,1600,1920];

app.whenReady().then(async()=>{
 let server,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(scratch,'vite-cache'),optimizeDeps:{entries:[page]},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
  await server.listen();const local=server.resolvedUrls.local[0];
  const preload=path.join(scratch,'preload.cjs');
  fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('storyboardDurationFixture',Object.fromEntries(['bootstrap','project','patch','estimate','submit','start','list'].map(name=>[name,p=>ipcRenderer.invoke('timing-'+name,p)])));`);
  const {validateStoryboardSubmission}=await import('../core/storyboardPublication.js');
  const {storyboardDurationPolicy}=await import('../core/storyboardTiming.js');
  let project,host,sent,singles,textAttempts,policyScenario=false,iteration=0;
  const save=p=>{project={...project,episodes:patchShot(project.episodes,p)};return project;};
  ipcMain.handle('timing-bootstrap',()=>{
   project=policyScenario?policyProject():init();sent=[];singles=[];textAttempts=[];
   host=createStoryboardBatchHost({directory:path.join(scratch,`run-${++iteration}`),owner:()=>accountId,license:async()=>{},getProject:async()=>project,listMedia:async()=>[],listJobs:()=>[],getState:()=>state,patchShot:async p=>save(p),submit:async input=>{sent.push(input.duration);return {id:`job-${sent.length}`,status:'submitted'};}});
   return {project,state};
  });
  ipcMain.handle('timing-project',()=>project);
  ipcMain.handle('timing-patch',(_,p)=>save(p));
  ipcMain.handle('timing-submit',async(_,value)=>{
   await validateStoryboardSubmission({getProject:async()=>project,value,accountId,resolveDurationPolicy:input=>{
    const {capabilities}=state.mediaProfiles.find(profile=>profile.id===input.profileId);
    return storyboardDurationPolicy(capabilities,capabilities,input.resolution);
   }});
   singles.push(value.duration);
  });
  ipcMain.handle('timing-start',async(_,p)=>{const batch=await host.start(p);await host.idle();return batch;});
  ipcMain.handle('timing-list',(_,p)=>host.list(p));
  ipcMain.handle('timing-estimate',async(_,p)=>{
   textAttempts.push(p.taskId);assert.equal(p.profileId,'text');assert.equal(p.resultEnvelope,true);
   const data=JSON.parse(p.messages.at(-1).content),segment=data.segments[0];
   assert.match(segment.script,/进入房间/);assert.match(segment.prompt,/修改后的正片/);
   const output=await requestChat(p,{fetchFn:async(_,options)=>{
    const body=JSON.parse(options.body);
    assert.equal(body.stream,true);assert.equal(Object.hasOwn(body,'thinking'),false);
    const content='```json\n'+JSON.stringify({results:textAttempts.length===1?[]:[{
     reason:'微动及气口。',tail_buffer_seconds:0.6,groups:[{visual_seconds:2.2}],kind:'transition',segment_id:segment.segment_id,
    }]})+'\n```';
    return new Response(`data: ${JSON.stringify({choices:[{delta:{reasoning_content:'模型推理'}}]})}\n\n`+
     `data: ${JSON.stringify({choices:[{delta:{content},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
   }});
   return {ok:true,output};
  });
  for(const [width,scenario] of widths.flatMap(width=>[[width,false],[width,true]])){
   policyScenario=scenario;
   const win=new BrowserWindow({width,height:940,show:false,webPreferences:{preload,backgroundThrottling:false}});
   const requests=[];
   win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>{if(!url.startsWith(local))requests.push(url);done({cancel:!url.startsWith(local)});});
   const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
   const until=async(fn,...args)=>{for(let i=0;i<100;i++){const result=await run(fn,...args);if(result)return result;await pause(50);}throw Error('Timed out: '+fn+' '+JSON.stringify(args));};
   const button=(selector,label)=>until((selector,label)=>{const target=[...document.querySelectorAll(selector)].find(x=>x.textContent.trim()===label&&!x.disabled&&x.getClientRects().length);if(!target)return false;target.click();return true;},selector,label);
   const card=id=>`.collab-shot-card[data-shot-id="s${id}"]`;
   const mention=(selector,content)=>until((selector,content)=>document.querySelector(selector)?.textContent.includes(content),selector,content);
   const select=async(selector,value)=>{await until(selector=>Boolean(document.querySelector(selector)),selector);await run((selector,value)=>{const node=document.querySelector(selector);node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));},selector,value);};
   const editPrompt=(index,value)=>run((selector,value)=>{const node=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));},card(index)+' textarea[aria-label="提示词"]',value);
   try{
    await win.loadURL(local+page);
    await until(()=>{const node=document.querySelector('.collab-episode-card');if(!node)return false;node.click();return true;});
    await mention(card(2),'待估时');
    if(scenario){
     const disabled=selector=>until(selector=>[...document.querySelectorAll(selector+' button')].some(node=>node.textContent.trim()==='生成视频'&&node.disabled),selector);
     const notices=['待复核','超载需重分','待估时'];
     await editPrompt(0,'进入房间，停一步。');
     await button(card(0)+' button','保存分镜');
     for(let i=0;i<3;i++){
      await mention(card(i),notices[i]);await mention(card(i),'重估时长');await disabled(card(i));
     }
     await button('.storyboard-batch-controls button','一键生成');await button('.storyboard-batch-confirm button','确认并开始');
     await mention('.storyboard-batch .collab-error','批量生成未启动');assert.deepEqual(sent,[]);
     await button('.storyboard-batch-confirm button','取消');
     for(let i=0;i<3;i++){
      await select(card(i)+' select[aria-label="时长"]','20');
      await button(card(i)+' button','生成视频');
      for(let j=0;j<100&&singles.length<=i;j++)await pause(50);
      assert.equal(singles[i],20);await mention(card(i),notices[i]);
     }
     await button('.storyboard-batch-controls button','一键生成');await button('.storyboard-batch-confirm button','确认并开始');
     for(let i=0;i<100&&sent.length<3;i++)await pause(50);
     assert.deepEqual(sent,[20,20,20]);sent.length=0;
     await select('select[aria-label="默认生成接口"]','restricted');
     await button('.storyboard-batch-controls button','按建议时长设置');
     await mention('.storyboard-timing-notice','已保护 3 条手调时长');
     assert.deepEqual(project.episodes[0].storyboardPrompts.map(({generationConfig:g})=>[g.profileId,g.model,g.ratio,g.resolution,g.duration]),Array.from({length:3},()=>['restricted','restricted-model','9:16','1080p',20]));
     await disabled(card(0));await mention(card(0),'手调时长不符合当前模型支持的秒数');
     await button('.storyboard-batch-controls button','一键生成');await button('.storyboard-batch-confirm button','确认并开始');
     await mention('.storyboard-batch .collab-error','批量生成未启动');assert.deepEqual(sent,[]);
     await button('.storyboard-batch-confirm button','取消');
     await select('select[aria-label="默认视频时长"]','15');
     await button('.storyboard-parameter-apply button','应用到全场景');
     await until(async()=> (await window.storyboardDurationFixture.project()).episodes[0].storyboardPrompts.every(shot=>shot.generationConfig.durationMode==='uniform'&&shot.generationConfig.duration===15));
     await button(card(0)+' button','生成视频');
     for(let i=0;i<100&&singles.length<4;i++)await pause(50);
     assert.deepEqual(singles,[20,20,20,15]);
     await button('.storyboard-batch-controls button','一键生成');await button('.storyboard-batch-confirm button','确认并开始');
     for(let i=0;i<100&&sent.length<3;i++)await pause(50);
     assert.deepEqual(sent,[15,15,15]);assert.deepEqual(requests,[]);
     continue;
    }
    await button('.storyboard-batch-controls button','一键生成');
    await button('.storyboard-batch-confirm button','确认并开始');
    await mention('.storyboard-batch .collab-error','批量生成未启动');assert.equal(sent.length,0);
    await button('.storyboard-batch-confirm button','取消');
    await select(card(1)+' select[aria-label="时长"]','10');await button(card(1)+' button','保存分镜');
    await until(async()=> (await window.storyboardDurationFixture.project()).episodes[0].storyboardPrompts[1].generationConfig.durationManuallyAdjusted===true);
    await editPrompt(2,'修改后的正片');
    await button(card(2)+' button','重估时长');await mention(card(2),'建议生成时长 3 秒');
    assert.equal(textAttempts.length,2);assert.equal(new Set(textAttempts).size,2);
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
  console.log(JSON.stringify({widths,strictRecommendedStatuses:true,manualAboveEstimateCap:[20,20,20],fixedBatch:[15,15,15],protectedParametersSync:true,unsupportedManualStopsScope:true,manualPreservedAndReset:true,fencedSemanticEstimatePersisted:true,deepSeekThinkingPreserved:true,missingShotRetriedOnce:true,alignedDiscrete:[15,10,5],continuousBatch:[11,14,4],realPaidCalls:0}));
 }catch(error){exit=1;console.error(error);}
 finally{await server?.close();for(const win of BrowserWindow.getAllWindows())win.destroy();app.exit(exit);}
});

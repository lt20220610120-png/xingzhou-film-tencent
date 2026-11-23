const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');
const {createGenerationJobs}=require('../electron/generation-jobs.cjs');
const {renewImageReferences}=require('../electron/generation-reference-recovery.cjs');

const root=path.resolve(__dirname,'..');
const fixture='scripts/fixtures/storyboard-libtv-preflight.html';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-preflight-'));
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();

app.whenReady().then(async()=>{
 let server,win,exit=0,phase='account',mockPaid=0,operation=null,activeController=null,adopted=false;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(profile,'vite-cache'),logLevel:'error',
   optimizeDeps:{entries:[fixture]},server:{host:'127.0.0.1',port:0,watch:null}});
  await server.listen();
  const local=server.resolvedUrls.local[0];
  const preload=path.join(profile,'preload.cjs');
  fs.writeFileSync(preload,`
    const {contextBridge,ipcRenderer}=require('electron');
    contextBridge.exposeInMainWorld('preflightFixture',{
      submit:payload=>ipcRenderer.invoke('fixture-submit',payload),
      list:()=>ipcRenderer.invoke('fixture-list'),
      cancel:payload=>ipcRenderer.invoke('fixture-cancel',payload),
      adopt:()=>ipcRenderer.invoke('fixture-adopt'),
      onProgress:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('fixture-progress',listener);return()=>ipcRenderer.removeListener('fixture-progress',listener);},
    });
  `);
  const mediaDir=path.join(profile,'isolated-jobs');
  fs.mkdirSync(mediaDir);
  fs.writeFileSync(path.join(mediaDir,'generation-jobs.json'),JSON.stringify([{
   id:'historical',provider:'libtv',kind:'video',projectId:'fixture-project',shotId:'fixture-shot',
   status:'failed',submissionAttempted:false,prompt:'历史结果保留',
  }]));
  const jobs=createGenerationJobs(mediaDir,{libtvService:{
   prepare:async(_account,{signal,references,prompt,libtvSubmissionMode})=>{
    const images=references.filter(ref=>ref.kind==='image');
    assert.equal(images.length,adopted?7:6);
    assert.equal(images.at(-1).assetId,'fixture-warehouse');
    assert.match(prompt,adopted?/冷链重卡（参考@image6）、仓库（参考@image7）/:/冷链重卡、仓库（参考@image6）/);
    if(!adopted)assert.doesNotMatch(prompt,/@image7/);
    if(phase==='account')throw Error('读取账号失败（TLS_TIMEOUT）');
    if(phase==='upload')throw Error('@audio1 上传参考素材失败（ECONNRESET）');
    if(phase==='image'){
     const number=images.findIndex(ref=>ref.assetId==='fixture-warehouse')+1;
     throw Error('@image'+number+'「仓库」 上传参考素材失败（ECONNRESET）');
    }
    if(phase==='canvas')assert.equal(libtvSubmissionMode,'canvas');
    if(phase==='paid')assert.match(prompt,/手动改稿：聚焦 @image7。/);
    if(phase==='cancel'){
     const send=(stage,details={})=>win.webContents.send('fixture-progress',{operationId:operation,stage,...details});
     send('checking');await pause(90,undefined,{signal});
     win.webContents.send('fixture-progress',{operationId:'unrelated',stage:'uploading',completed:7,total:9});
     send('uploading',{completed:2,total:8});
     try{await pause(10000,undefined,{signal});}
     catch{throw Error('已取消准备，未提交生成');}
    }
    return {jobId:'fixture-node',libtvNodeId:'fixture-node',libtvProjectId:'fixture-canvas'};
   },
   run:async(_account,_task,{beforeRun})=>{
    beforeRun();
    mockPaid++;
    return {data:{taskInfo:{status:3,failedReason:'隔离上游已提交任务失败'}}};
   },
  }});
  ipcMain.handle('fixture-submit',async(_event,payload)=>{
   assert.equal(payload.references.length,9);
   operation=payload.libtvOperationId;const controller=new AbortController();activeController=controller;
   try{
    const prepared=await renewImageReferences(payload,{
     resolveLocalReferences:async()=>null,
     resolveAssetImage:async({assetId})=>{
      if(assetId==='fixture-truck'&&!adopted)throw Object.assign(Error('空位'),{code:'ASSET_SLOT_EMPTY'});
      return {id:assetId+'-adopted',url:'data:image/png;base64,iVBORw0KGgo='};
     },
    });
    return await jobs.submit({...prepared,accountId:'fixture-owner',signal:controller.signal});
   }
   finally{activeController=null;}
  });
  ipcMain.handle('fixture-adopt',()=>{adopted=true;});
  ipcMain.handle('fixture-cancel',(_event,{operationId})=>{
   if(!activeController||operationId!==operation)return false;
   activeController.abort();return true;
  });
  ipcMain.handle('fixture-list',()=>jobs.list());
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{preload,backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>done({cancel:!url.startsWith(local)}));
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  const wait=async(fn,...args)=>{
   for(let i=0;i<120;i++){const result=await run(fn,...args);if(result)return result;await pause(40);}
   throw Error('Timed out: '+fn+' '+JSON.stringify(args));
  };
  const click=label=>wait(label=>{
   const button=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label&&!el.disabled);
   button?.click();
   return Boolean(button);
  },label);
  const cardCount=()=>run(()=>document.querySelectorAll('.generation-result-grid article').length);
  const imageChips=()=>run(()=>[...document.querySelectorAll('.reference-alias')].map(el=>el.textContent.trim()).filter(value=>value.startsWith('@image')));
  const submissionMode=value=>run(value=>{
   const select=document.querySelector('[aria-label="LibTV 提交方式"]');
   select.value=value;
   select.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
  await win.loadURL(local+fixture);
  await wait(()=>document.querySelector('.generation-result-prompt')?.textContent==='历史结果保留');
  assert.equal(await cardCount(),1);
  assert.deepEqual(await imageChips(),Array.from({length:6},(_,index)=>'@image'+(index+1)));
  assert.match(await run(()=>document.querySelector('textarea[aria-label="提示词"]').value),/冷链重卡、仓库（参考@image6）/);
  await wait(()=>document.querySelector('[aria-label="LibTV 项目"]')?.value==='fixture-canvas');
  assert.deepEqual(await run(()=>[libTV201Fixture.projects,libTV201Fixture.schemas]),[1,1]);
  await run(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));});
  await pause(120);
  assert.deepEqual(await run(()=>[libTV201Fixture.projects,libTV201Fixture.schemas]),[1,1]);
  await run(()=>libTV201Fixture.remount());await pause(180);
  assert.equal(await run(()=>document.querySelector('[aria-label="LibTV 项目"]').value),'fixture-canvas');
  assert.deepEqual(await run(()=>[libTV201Fixture.projects,libTV201Fixture.schemas]),[1,1]);
  await run(()=>{libTV201Fixture.failProjects=true;libTV201Fixture.refreshProjects();});
  await wait(()=>libTV201Fixture.projects===2);
  await pause(100);
  assert.equal(await run(()=>document.querySelector('[aria-label="LibTV 项目"]').value),'fixture-canvas');
  assert.doesNotMatch(await run(()=>document.querySelector('.libtv-project-control').textContent),/Error invoking remote method/);
  assert.equal(await run(()=>document.querySelector('.libtv-project-control [role=alert]')),null);
  await run(()=>{libTV201Fixture.failProjects=false;document.querySelector('[aria-label="刷新 LibTV 项目"]').click();});
  await wait(()=>libTV201Fixture.projects===3);
  await pause(80);
  assert.equal(await run(()=>document.querySelector('.libtv-project-control [data-libtv-read-status]')),null);
  await run(()=>{libTV201Fixture.failSchema=true;libTV201Fixture.refreshSchema();});
  await wait(()=>[...document.querySelectorAll('.generation-controls [role=status]')].some(el=>el.textContent.includes('模型参数暂未刷新')));
  assert.ok(await run(()=>[...document.querySelectorAll('.generation-controls button')].some(el=>el.textContent.trim()==='生成视频'&&!el.disabled)));
  assert.equal(await run(()=>document.querySelector('.generation-controls [role=alert]')),null);
  await run(()=>{libTV201Fixture.failSchema=false;[...document.querySelectorAll('.generation-controls button')].find(el=>el.textContent.trim()==='重试').click();});
  await wait(()=>![...document.querySelectorAll('.generation-controls [role=status]')].some(el=>el.textContent.includes('模型参数暂未刷新')));
  await run(()=>libTV201Fixture.changeNetwork());
  await wait(()=>libTV201Fixture.projects===4&&libTV201Fixture.schemas===4);
  const probes=[['account','TLS_TIMEOUT',1280],['upload','ECONNRESET',1600]];
  for(const [step,code,width] of probes){
   win.setContentSize(width,900);
   phase=step;
   await click('生成视频');
   await wait(code=>[...document.querySelectorAll('.generation-composer [role=alert]')].some(el=>el.textContent.includes(code)&&el.textContent.includes('未提交生成')),code);
   assert.equal(await cardCount(),1);
   assert.equal(jobs.list().length,1);
   assert.equal(mockPaid,0);
  }
  phase='cancel';
  await click('生成视频');
  await wait(()=>document.querySelector('.generation-composer [aria-live="polite"]')?.textContent.includes('2 / 8'));
  await click('取消准备');
  await wait(()=>document.querySelector('.generation-composer [role=alert]')?.textContent.includes('已取消准备'));
  assert.ok(operation);
  assert.equal(await cardCount(),1);
  assert.equal(mockPaid,0);
  phase='image';
  await click('生成视频');
  await wait(()=>document.querySelector('.generation-composer [role=alert]')?.textContent.includes('@image6「仓库」'));
  assert.equal(await cardCount(),1);
  await run(()=>{
   const editor=document.querySelector('textarea[aria-label="提示词"]');
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,editor.value+'\n手动改稿：聚焦 @image6。');
   editor.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await click('保存分镜');
  await wait(()=>libTV201Fixture.savedPrompt.includes('手动改稿：聚焦 @image7。'));
  await run(()=>libTV201Fixture.remount());
  await wait(()=>document.querySelector('textarea[aria-label="提示词"]').value.includes('手动改稿：聚焦 @image6。'));
  phase='canvas';
  await submissionMode('canvas');
  await click('上传到 LibTV 画布');
  await wait(()=>document.querySelector('.generation-result-grid').textContent.includes('待在 LibTV 生成'));
  assert.equal(mockPaid,0);
  assert.equal(jobs.list().find(job=>job.remoteStatus==='awaiting-canvas')?.libtvRunStarted,false);
  await submissionMode('auto');
  await run(()=>libTV201Fixture.adopt());
  await wait(()=>document.querySelector('textarea[aria-label="提示词"]').value.includes('冷链重卡（参考@image6）、仓库（参考@image7）'));
  assert.deepEqual(await imageChips(),Array.from({length:7},(_,index)=>'@image'+(index+1)));
  assert.match(await run(()=>document.querySelector('textarea[aria-label="提示词"]').value),/手动改稿：聚焦 @image7。/);
  win.setContentSize(1920,900);
  phase='paid';
  await click('生成视频');
  await wait(()=>document.querySelectorAll('.generation-result-grid .status-failed').length===2);
  assert.equal(await cardCount(),3);
  assert.equal(await run(()=>document.querySelector('.generation-composer [role=alert]')),null);
  assert.equal(mockPaid,1);
  const paid=jobs.list().find(job=>job.submissionAttempted===true);
  assert.equal(paid.libtvNodeId,'fixture-node');
  assert.equal(paid.submissionAttempted,true);
  assert.match(paid.error,/隔离上游已提交任务失败/);
  console.log(JSON.stringify({widths:[1280,1600,1920],cacheOnFocusAndRemount:true,silentRefreshPreservesConfiguration:true,realtimeProgressAndCancellation:true,compactImages:[6,7],imageErrorAlias:'@image6',manualEditPreserved:true,manualCanvasVerified:true,preflightAlerts:['TLS_TIMEOUT','ECONNRESET'],historicalCardsPreserved:1,newPreflightCards:0,newPaidFailureCards:1,mockPaid,paidCalls:0}));
 }catch(error){
  console.error(error,await win?.webContents.executeJavaScript("Array.from(document.querySelectorAll('[role=alert],.collab-error')).map(el=>el.textContent)"));
  exit=1;
 }
 finally{
  win?.destroy();
  ipcMain.removeHandler('fixture-submit');
  ipcMain.removeHandler('fixture-list');
  ipcMain.removeHandler('fixture-cancel');
  ipcMain.removeHandler('fixture-adopt');
  await server?.close();
  assert.equal(path.dirname(fs.realpathSync(profile)),fs.realpathSync(os.tmpdir()));
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200}).catch(()=>{});
  app.exit(exit);
 }
});

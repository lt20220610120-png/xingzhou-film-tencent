const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');
const {createGenerationJobs}=require('../electron/generation-jobs.cjs');

const root=path.resolve(__dirname,'..');
const fixture='scripts/fixtures/storyboard-libtv-preflight.html';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-libtv-preflight-'));
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();

app.whenReady().then(async()=>{
 let server,win,exit=0,phase='account',mockPaid=0;
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
    });
  `);
  const mediaDir=path.join(profile,'isolated-jobs');
  fs.mkdirSync(mediaDir);
  fs.writeFileSync(path.join(mediaDir,'generation-jobs.json'),JSON.stringify([{
   id:'historical',provider:'libtv',kind:'video',projectId:'fixture-project',shotId:'fixture-shot',
   status:'failed',submissionAttempted:false,prompt:'历史结果保留',
  }]));
  const jobs=createGenerationJobs(mediaDir,{libtvService:{
   prepare:async()=>{
    if(phase==='account')throw Error('读取账号失败（TLS_TIMEOUT）');
    if(phase==='upload')throw Error('@audio1 上传参考素材失败（ECONNRESET）');
    return {jobId:'fixture-node',libtvNodeId:'fixture-node',libtvProjectId:'fixture-canvas'};
   },
   run:async(_account,_task,{beforeRun})=>{
    beforeRun();
    mockPaid++;
    return {data:{taskInfo:{status:3,failedReason:'隔离上游已提交任务失败'}}};
   },
  }});
  ipcMain.handle('fixture-submit',(_event,payload)=>jobs.submit({...payload,accountId:'fixture-owner'}));
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
  await win.loadURL(local+fixture);
  await wait(()=>document.querySelector('.generation-result-prompt')?.textContent==='历史结果保留');
  assert.equal(await cardCount(),1);
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
  win.setContentSize(1920,900);
  phase='paid';
  await click('生成视频');
  await wait(()=>document.querySelectorAll('.generation-result-grid .status-failed').length===2);
  assert.equal(await cardCount(),2);
  assert.equal(await run(()=>document.querySelector('.generation-composer [role=alert]')),null);
  assert.equal(mockPaid,1);
  const paid=jobs.list().find(job=>job.id!=='historical');
  assert.equal(paid.libtvNodeId,'fixture-node');
  assert.equal(paid.submissionAttempted,true);
  assert.match(paid.error,/隔离上游已提交任务失败/);
  console.log(JSON.stringify({widths:[1280,1600,1920],preflightAlerts:['TLS_TIMEOUT','ECONNRESET'],historicalCardsPreserved:1,newPreflightCards:0,newPaidFailureCards:1,mockPaid,paidCalls:0}));
 }catch(error){
  console.error(error,await win?.webContents.executeJavaScript("Array.from(document.querySelectorAll('[role=alert],.collab-error')).map(el=>el.textContent)"));
  exit=1;
 }
 finally{
  win?.destroy();
  ipcMain.removeHandler('fixture-submit');
  ipcMain.removeHandler('fixture-list');
  await server?.close();
  assert.equal(path.dirname(fs.realpathSync(profile)),fs.realpathSync(os.tmpdir()));
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200}).catch(()=>{});
  app.exit(exit);
 }
});

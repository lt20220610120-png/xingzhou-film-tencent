const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');

const root=path.join(__dirname,'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-art-background-ui-'));
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();

app.whenReady().then(async()=>{
 let server,win,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(profile,'vite-cache'),
   optimizeDeps:{entries:['scripts/fixtures/wave-three-ui.html']},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
  await server.listen();
  const url=server.resolvedUrls.local[0];
  win=new BrowserWindow({width:1280,height:920,show:false,webPreferences:{backgroundThrottling:false}});
  const external=[];
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{
   const blocked=!details.url.startsWith(url);
   if(blocked)external.push(details.url);
   callback({cancel:blocked});
  });
  const run=script=>win.webContents.executeJavaScript(script,true);
  const wait=async script=>{
   for(let i=0;i<100;i++){const result=await run(script);if(result)return result;await pause(60);}
   throw Error('界面等待超时 '+script);
  };
  const click=async (selector,label,partial=false)=>{
   await wait(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>!n.disabled&&n.getClientRects().length&&
    (n.getAttribute('aria-label')===${JSON.stringify(label)}||(${partial}?n.textContent.includes(${JSON.stringify(label)}):n.textContent.trim()===${JSON.stringify(label)})));
    if(!button)return false;button.click();return true;})()`);
  };
  const open=async mode=>{
   await win.loadURL(url+'scripts/fixtures/wave-three-ui.html?art-background&mode='+mode);
   await click('#app-sidebar button','项目协作');
   await wait("!!document.querySelector('.collab-hub, .collab-rail')");
   if(!await run("!!document.querySelector('.collab-rail')"))await click('.collab-hub button, .collab-hub [role=button]','进入项目');
   await click('.collab-rail button','信息读取');
   await click('.collab-analyze-btn','分析 / 继续未完成');
   await wait("document.body.innerText.includes('模拟背景服务 503')");
   assert.equal(await run('waveThree.backgroundCalls.length'),3);
   assert.deepEqual(await run('waveThree.backgroundCalls.map(call=>call.correction)'),[false,true,true]);
  };
  await open('cloud');
  await run("waveThree.backgroundMode='success'");
  await click('.collab-analyze-btn','重试背景分析');
  await wait("waveThree.backgroundCheckpoint().scriptContext?.complete");
  const summary=await run('waveThree.backgroundCheckpoint().scriptContext.summary');
  assert.match(summary.era,/1988 年上海港/);
  assert.match(summary.population,/待核对/);
  assert.ok(await run("waveThree.backgroundCalls.some(call=>call.input.untrustedScript?.includes('一九八八年'))"));
  await open('local');
  await click('.art-background-recovery summary','手动确认背景');
  await run(`(()=>{const textarea=document.querySelector('.art-background-recovery textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,'1988 年上海港，依据仓库墙上的装卸日历。');textarea.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('.art-background-recovery button','确认背景并继续');
  await wait('waveThree.backgroundCheckpoint().scriptContext?.manual===true');
  assert.equal(await run('waveThree.backgroundCalls.length'),3);
  assert.deepEqual(await run('waveThree.attemptedPaid'),[]);
  assert.deepEqual(external,[]);
  console.log(JSON.stringify({threeAttempts:true,manualRecovery:true,lateEvidence:true,paidCalls:0}));
 }catch(error){
  console.error(error);
  if(win&&!win.isDestroyed())console.error(await win.webContents.executeJavaScript('document.body.innerText.slice(0,2300)').catch(()=>null));
  exit=1;
 }finally{
  win?.destroy();
  await server?.close();
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{}
  app.exit(exit);
 }
});

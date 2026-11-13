const {app,BrowserWindow,ipcMain,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerUpdateHandlers}=require('../electron/update-ipc.cjs');
const {fetchUpdateManifest}=require('../electron/update-manifest.cjs');
const {TRUSTED_MANIFEST_URL}=require('../electron/update-trust.cjs');
const {downloadInstaller,safeName,verifyInstaller}=require('../electron/update-service.cjs');
const {createUpdateFetch,UPDATE_MIRRORS}=require('../electron/update-transport.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');
fs.mkdirSync(out,{recursive:true});
const isolated=fs.mkdtempSync(path.join(out,'xz-155-ui-'));
app.setPath('userData',isolated);
const installed=process.env.XZ_VERIFY_INSTALLED||'2.8.153',expected=process.env.XZ_VERIFY_EXPECTED||'2.8.154';
let server,win,attempts=0,checks=0,installer=null,verifiedDownload=null,source;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=expr=>win.webContents.executeJavaScript(expr);
async function waitFor(expr,tries=150){
 for(let i=0;i<tries;i++){const result=await run(expr);if(result)return result;await pause(100);}
 throw Error('Timeout: '+expr);
}
app.whenReady().then(async()=>{
 let failed=false;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0,watch:null},logLevel:'warn'});
  await server.listen();
  const base=server.resolvedUrls.local[0]||`http://127.0.0.1:${server.httpServer.address().port}/`;
  win=new BrowserWindow({width:1520,height:1000,show:false,webPreferences:{preload:path.join(root,'electron/preload.cjs')}});
  await win.loadURL(base+'scripts/fixtures/director-auto154.html?extendedPace');
  const budget="document.querySelector('.quick-budget-readout')?.innerText";
  const before=await waitFor(budget);
  await run("document.querySelector('input[aria-label=短剧节奏梯度]').focus()");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Home'});
  await waitFor("document.querySelector('input[aria-label=短剧节奏梯度]').value==='-100'");
  const after=await run(budget);
  assert.match(after,/极紧凑/);
  assert.ok(Number(after.match(/预计\s*(\d+)\s*秒/)[1])<Number(before.match(/预计\s*(\d+)\s*秒/)[1]));
  assert.ok(Number(after.match(/预计\s*(\d+)\s*条/)[1])<Number(before.match(/预计\s*(\d+)\s*条/)[1]));
  assert.deepEqual(await run('window.__calls'),[]);
  await run("document.querySelector('.quick-scene-card .primary').click()");
  await waitFor("window.__quick?.runs.some(r=>r.phase==='completed')");
  const scene=await run(`(()=>{
   const cards=[...document.querySelectorAll('.quick-scene-prompts .prompt-card')];
   const ep=window.__persisted.directorProjects[0].episodes[0];
   return {calls:window.__calls,shown:cards.map(c=>c.querySelector('.prompt-duration')?.innerText),prompts:ep.prompts.map(p=>({label:p.label,pace:p.pace,seconds:p.recommendedDurationSeconds,complete:p.generationComplete})),budget:document.querySelector('.quick-budget-readout').innerText};
  })()`);
  assert.deepEqual(scene.calls,['plan','skill','audit']);
  assert.equal(scene.shown.length,scene.prompts.length);
  assert.equal(scene.shown.length,Number(after.match(/预计\s*(\d+)\s*条/)[1]));
  scene.prompts.forEach((p,i)=>{assert.equal(p.pace,-100);assert.ok(p.complete&&p.seconds>=1&&p.seconds<=30);assert.match(scene.shown[i],new RegExp(p.seconds+' 秒'));});
  fs.writeFileSync(path.join(out,'155-director.png'),(await win.webContents.capturePage()).toPNG());
  const fetchFn=createUpdateFetch((url,options)=>net.fetch(url,options));
  registerUpdateHandlers({ipcMain,getVersion:()=>installed,
   checkManifest:async()=>{
    checks++;const result=await fetchUpdateManifest(TRUSTED_MANIFEST_URL,{fetchFn,officialMirrors:UPDATE_MIRRORS.map(base=>base+'/latest.json')});
    source=result.source;assert.equal(result.manifest.version,expected);return result;
   },
   download:async(manifest,onProgress)=>{
    if(++attempts===1)throw Error('测试：下载连接中断');
    const destinationDir=path.join(isolated,'updates');
    const name=`Xingzhou-Film-Tencent-Setup-${manifest.version}.exe`;
    // Seed the verified release prefix to exercise real HTTPS resume without
    // depending on a full mirror transfer for this UI test.
    const original=path.join(root,'release',manifest.version,name);
    await verifyInstaller(original,manifest);
    fs.mkdirSync(destinationDir,{recursive:true});
    const prefix=manifest.size-65536;
    const partial=path.join(destinationDir,safeName(manifest.version)+'.'+manifest.sha256+'.part');
    fs.copyFileSync(original,partial);fs.truncateSync(partial,prefix);
    let resumed=false;
    const file=await downloadInstaller({url:manifest.installerUrl,...manifest,destinationDir,fetchImpl:async(url,options)=>{
     assert.equal(options.headers.Range,`bytes=${prefix}-`);
     const response=await fetchFn(url,options);
     assert.equal(response.status,206);
     resumed=true;
     return response;
    },mirrors:[`https://xingzhoufilm.cn/api/updates/${name}`],onProgress,attempts:1,idleMs:20000});
    assert.equal(resumed,true);
    verifiedDownload={version:manifest.version,size:fs.statSync(file).size,sha256:manifest.sha256,resumed};
    return file;
   },
   install:async(file,manifest)=>{await verifyInstaller(file,manifest);installer=manifest.version;return true;}
  });
  await win.loadURL(base+'scripts/fixtures/update-dialog155.html');
  await waitFor("document.querySelector('.startup-update-version')?.textContent.includes("+JSON.stringify(expected)+")");
  const click="document.querySelector('.startup-update-actions .primary').click()";
  await run(click);
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('下载连接中断')");
  await run(click);
  await waitFor("document.querySelector('.startup-update-actions .primary')?.textContent==='安装并重启'",450);
  fs.writeFileSync(path.join(out,'155-update-ready.png'),(await win.webContents.capturePage()).toPNG());
  await run(click);
  for(let i=0;i<40&&!installer;i++)await pause(100);
  assert.equal(installer,expected);assert.equal(checks,1);assert.equal(attempts,2);
  const report={director:{before,after,...scene},update:{installed,expected,source,checks,attempts,verifiedDownload,installCallbackVerified:true}};
  fs.writeFileSync(path.join(out,`155-ui-${expected}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }catch(error){console.error(error);failed=true;}
 finally{win?.destroy();await server?.close();app.exit(failed?1:0);}
});

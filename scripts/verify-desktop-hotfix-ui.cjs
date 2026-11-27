const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.realpathSync(os.tmpdir());
if(!process.versions.electron){
 const profile=fs.mkdtempSync(path.join(temp,'xz-desktop-reliability-'));
 try{
  const child=require('node:child_process').spawnSync(require('electron'),[__filename,profile],{stdio:'inherit',windowsHide:true,timeout:120000});
  if(child.error)throw child.error;process.exitCode=child.status??1;
 }finally{fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}
 return;
}
const {app,BrowserWindow}=require('electron'),{setTimeout:wait}=require('node:timers/promises');
const profile=fs.realpathSync(process.argv[2]);
assert.equal(path.dirname(profile),temp);assert.match(path.basename(profile),/^xz-desktop-reliability-/);
app.setPath('userData',profile);app.setPath('sessionData',profile);app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const root=path.join(__dirname,'..'),fixture='scripts/fixtures/desktop-hotfix-ui.html';
 let server,win,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(profile,'vite-cache'),logLevel:'error',optimizeDeps:{entries:[fixture]},server:{host:'127.0.0.1',port:0,watch:null}});
  await server.listen();const local=server.resolvedUrls.local[0],external=[];
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>{
   const cancel=!url.startsWith(local);if(cancel)external.push(new URL(url).origin);done({cancel});
  });
  const evaluate=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  const until=async(fn,...args)=>{
   for(let attempt=0;attempt<100;attempt++){const result=await evaluate(fn,...args);if(result)return result;await wait(40);}
   throw Error(`Timed out ${fn} ${JSON.stringify(args)}`);
  };
  const preview=id=>until(id=>document.querySelector('.collab-asset-image-button img')?.getAttribute('src').endsWith('#'+id),id);
  const click=label=>until(label=>{const button=[...document.querySelectorAll('.collab-image-controls button')].find(row=>row.textContent.trim()===label&&!row.disabled);button?.click();return !!button;},label);
  await win.loadURL(local+fixture);await preview('adopted');
  await until(()=>document.querySelector('#binding-revision').textContent==='4');
  await evaluate(()=>desktopHotfix.voiceChanged());
  await wait(100);assert.equal(await evaluate(()=>document.querySelector('#binding-revision').textContent),'4');
  await click('生成图片');await preview('generated');
  await wait(150);await preview('generated');
  win.setContentSize(860,860);
  await click('上传');await preview('uploaded');
  await wait(150);await preview('uploaded');
  await until(()=>document.querySelector('.generation-workspace textarea[aria-label="提示词"]')?.value==='甲账号隔离草稿');
  await evaluate(()=>desktopHotfix.useAccount('account-b'));
  await until(()=>document.querySelector('.generation-workspace textarea[aria-label="提示词"]')?.value==='');
  await evaluate(()=>desktopHotfix.useAccount('account-a'));
  await until(()=>document.querySelector('.generation-workspace textarea[aria-label="提示词"]')?.value==='甲账号隔离草稿');
  assert.deepEqual(await evaluate(()=>[desktopHotfix.generated,desktopHotfix.uploaded]),[1,1]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({widths:[1280,860],generatedPreview:true,uploadedPreview:true,voicePreservedBinding:true,accountDraftIsolation:true,paidCalls:0}));
 }catch(error){console.error(error,await win?.webContents.executeJavaScript("[...document.querySelectorAll('[role=alert]')].map(el=>el.textContent)"));exit=1;}
 finally{win?.destroy();await server?.close();app.exit(exit);}
});

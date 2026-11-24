const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');

const root=path.resolve(__dirname,'..'),fixture='scripts/fixtures/duration-estimate.html';
const temp=fs.realpathSync(os.tmpdir()),userData=fs.mkdtempSync(path.join(temp,'xz-duration-ui-'));
app.setPath('userData',userData);
app.setPath('sessionData',userData);
app.disableHardwareAcceleration();

app.whenReady().then(async()=>{
 let win,server,exit=0,external=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(userData,'vite-cache'),logLevel:'error',
   optimizeDeps:{entries:[fixture]},server:{host:'127.0.0.1',port:0,watch:null}});
  await server.listen();
  const local=server.resolvedUrls.local[0];
  win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>{
   const cancel=!url.startsWith(local);if(cancel)external++;done({cancel});
  });
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  async function wait(fn,...args){
   for(let attempt=0;attempt<120;attempt++){const result=await run(fn,...args);if(result)return result;await pause(40);}
   const evidence=await run(()=>({focused:document.activeElement?.outerHTML,tooltip:document.querySelector('[role=tooltip]')?.getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight]}));
   throw Error(`No expected UI result for ${fn} ${JSON.stringify(evidence)}`);
  }
  await win.loadURL(local+fixture);
  await wait(()=>document.querySelectorAll('[data-estimate]').length===7);
  for(const width of [1280,1600,1920]){
   win.setSize(width,800);
   const labels=await run(()=>[...document.querySelectorAll('[data-estimate]')].map(el=>el.textContent));
   assert.deepEqual(labels,['建议生成时长 11 秒','建议生成时长 30 秒略紧 · 自然 34 秒','建议生成时长 15 秒略紧 · 自然 17 秒','超载需重分 · 自然 36 秒','待估时补估','待复核重估时长','历史估时 35 秒']);
   for(const index of [0,1,2,3]){
    await run(index=>{
     const button=document.querySelector(`[data-estimate="${index}"] button`);
     button.focus();
     // Chromium updates activeElement in a hidden window without notifying the OS focus chain.
     button.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    },index);
    const details=await wait(()=>{
     const id=document.activeElement?.getAttribute('aria-describedby'),tooltip=id&&document.getElementById(id);
     if(!tooltip)return false;
     const {left,top,right,bottom}=tooltip.getBoundingClientRect();
     if(right>innerWidth||bottom>innerHeight||left<0||top<0)return false;
     return tooltip.textContent;
    });
    assert.match(details,/自然演完.*发声.*非并行动作.*气口缓冲/);
    await run(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    await wait(()=>!document.querySelector('[role=tooltip]'));
    await run(()=>document.activeElement?.blur());
   }
  }
  await run(()=>{document.querySelector('[data-estimate="4"] .duration-estimate-action').click();document.querySelector('[data-estimate="5"] .duration-estimate-action').click();});
  assert.deepEqual(await run(()=>window.reestimated),[4,5]);
  assert.equal(external,0);
  console.log(JSON.stringify({widths:[1280,1600,1920],keyboardTooltips:true,overloadWithoutGreen:true,pendingReestimate:true,external}));
 }catch(error){console.error(error);exit=1;}
 finally{
  win?.destroy();await server?.close();
  if(path.dirname(fs.realpathSync(userData))===temp)await fs.promises.rm(userData,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  app.exit(exit);
 }
});

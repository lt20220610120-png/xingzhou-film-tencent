const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { setTimeout: delay } = require('node:timers/promises');

const temporary = fs.realpathSync(os.tmpdir());
const profile = fs.mkdtempSync(path.join(temporary, 'xz-jianying-ui-'));
const root = path.join(__dirname, '..');
const page = 'scripts/fixtures/wave-three-ui.html';
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
 let server, window, exit=0;
 try {
  const { createServer } = await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(profile,'vite-cache'),logLevel:'error',
   optimizeDeps:{entries:[page]},server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});
  await server.listen();
  const local=server.resolvedUrls.local[0];
  window=new BrowserWindow({width:1280,height:900,show:false,webPreferences:{backgroundThrottling:false}});
  window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},done)=>done({cancel:!url.startsWith(local)}));
  const run=(fn,...args)=>window.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  async function wait(fn,...args){
   for(let attempt=0;attempt<100;attempt++){
    const value=await run(fn,...args);
    if(value)return value;
    await delay(60);
   }
   const context=await run(()=>({focus:document.activeElement?.outerHTML.slice(0,290),
    tooltip:[...document.querySelectorAll('[role="tooltip"]')].map(node=>node.textContent),body:document.body.innerText.slice(0,450)}));
   throw Error(`Timed out: ${fn} ${JSON.stringify({args,context})}`);
  }
  const click=(selector,label)=>wait((selector,label)=>{
   const node=[...document.querySelectorAll(selector)].find(element=>element.getClientRects().length&&!element.disabled&&
    (!label||[element.textContent.trim(),element.getAttribute('aria-label')].includes(label)));
   node?.click();
   return Boolean(node);
  },selector,label);
  const report='.jianying-draft-report';
  const hideReport=()=>click(report+' button','关闭对话框');
  const rail=label=>click('.collab-rail button',label);
  const result=()=>wait(selector=>{
   const dialog=document.querySelector(selector);
   return dialog?.textContent.includes('已导出 1 个镜头、1 段配音')&&dialog.textContent.includes('视频尚未生成')&&
    dialog.textContent.includes('已按镜头长度截取')&&dialog.textContent.includes('C:/隔离资料/测试剪映草稿');
  },report);
  const fits=selector=>wait(selector=>{
   const button=document.querySelector(selector);
   if(!button?.getClientRects().length)return false;
   button.scrollIntoView({block:'center'});
   const {left,right,height}=button.getBoundingClientRect();
   return left>=0&&right<=innerWidth&&height===36&&document.documentElement.scrollWidth<=innerWidth;
  },selector);

  await window.loadURL(local+page+'?jianying');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  await click('#app-sidebar button','项目协作');
  await click('.collab-hub button','进入项目');
  const widths=[1280,1600,1920];
  for(const width of widths){
   window.setContentSize(width,900);
   await wait(expected=>innerWidth===expected,width);
   await rail('视频池');
   await fits('.video-pool-header-actions .jianying-draft-export');
   await click('.video-pool-placeholder','查看 1-1-1 的生成结果');
   await click('.video-pool-dialog-actions button','一键全选');
   await wait(()=>{
    const selected=document.querySelector('input[aria-label="选择结果 newer-local"]');
    if(!selected?.checked)return false;
    selected.click();
    return true;
   });
   await click('.video-pool-results-dialog button','关闭对话框');
   await wait(()=>!document.querySelector('.video-pool-results-dialog'));
   await run(()=>{
    const picker=document.querySelector('[aria-label="视频池集数"]');
    picker.value='1';
    picker.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await wait(()=>{
    const info=document.querySelector('.video-pool-header-actions .jianying-draft-help');
    if(info!==document.activeElement)info.focus();
    const tooltip=document.getElementById(info.getAttribute('aria-describedby'));
    return tooltip?.textContent.includes('按集数、场次和分镜编号排列');
   });
   await click('.video-pool-header-actions .jianying-draft-export');
   await result();
   const pool=await run(()=>waveThree.draftRequests.at(-1));
   assert.deepEqual(pool.ids,[{jobId:'older-local'}]);
   assert.deepEqual(pool.scopeShotIds.sort(),['1-1','1-2'].flatMap(scene=>[1,2,3,4].map(shot=>`scroll-${scene}-${shot}`)));
   await hideReport();

   await rail('分镜');
   const overview=await run(()=>Boolean(document.querySelector('.collab-episode-card')?.getClientRects().length));
   if(overview)await click('.collab-episode-card');
   await fits('.collab-sb-navigation .jianying-draft-export');
   await fits('.collab-shot-card[data-shot-id="scroll-1-1-1"] .jianying-draft-export');
   await click('.collab-sb-navigation .jianying-draft-export');
   await result();
   assert.deepEqual(await run(()=>waveThree.draftRequests.at(-1)),{projectId:'qa-project',episode:1});
   await hideReport();
   await click('.collab-shot-card[data-shot-id="scroll-1-1-1"] .jianying-draft-export');
   await result();
   assert.deepEqual(await run(()=>waveThree.draftRequests.at(-1)),{projectId:'qa-project',episode:1,shotId:'scroll-1-1-1'});
   await hideReport();
  }
  const before=await run(()=>{waveThree.cancelDraft=true;return waveThree.draftRequests.length;});
  await click('.collab-sb-navigation .jianying-draft-export');
  await wait((before,report)=>waveThree.draftRequests.length===before+1&&!document.querySelector(report)&&
   document.querySelector('.collab-sb-navigation .jianying-draft-export').getAttribute('aria-busy')==='false',before,report);
  await run(()=>{waveThree.cancelDraft=false;waveThree.failDraft=true;});
  await click('.collab-sb-navigation .jianying-draft-export');
  await wait(report=>document.querySelector(report+' [role="alert"]')?.textContent==='隔离目录不可写',report);
  assert.deepEqual(await run(()=>waveThree.attemptedPaid),[]);
  console.log(JSON.stringify({widths,poolSelection:true,episode:true,shot:true,keyboardTooltip:true,cancel:true,error:true,paidRequests:0}));
 } catch(error) {
  console.error(error);
  exit=1;
 } finally {
  window?.destroy();
  server?.httpServer?.closeAllConnections();
  if(server)await Promise.race([server.close(),delay(1500)]);
  app.exit(exit);
 }
});

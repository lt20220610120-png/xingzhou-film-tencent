const {app,BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {setTimeout:pause} = require('node:timers/promises');

const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-storyboard-hint-'));
const root=path.resolve(__dirname,'..');
const page='scripts/fixtures/storyboard-material-hint.html';
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();

app.whenReady().then(async()=>{
 let server,win,exit=0;
 const widths=[1280,1600,1920],results=[],external=[],errors=[];
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(profile,'vite-cache'),optimizeDeps:{entries:[page]},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
  await server.listen();
  const url=server.resolvedUrls.local[0],host=new URL(url).host;
  win=new BrowserWindow({width:1280,height:800,show:false,webPreferences:{backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']},({url},done)=>{
   const request=new URL(url),allowed=['data:','about:','blob:'].includes(request.protocol)||request.host===host&&['http:','ws:'].includes(request.protocol);
   if(!allowed)external.push(request.hostname||request.protocol);
   done({cancel:!allowed});
  });
  win.webContents.on('console-message',event=>{if(/Uncaught|xingzhou-render-error/.test(event.message))errors.push(event.message);});
  const debuggerSession=win.webContents.debugger;
  debuggerSession.attach('1.3');
  const run=(fn,...args)=>win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const wait=async(fn,...args)=>{
   for(let attempt=0;attempt<100;attempt++){
    const result=await run(fn,...args);
    if(result)return result;
    await pause(55);
   }
   throw Error(`Timed out: ${fn} ${JSON.stringify(args)}`);
  };
  const click=(selector,label)=>wait((selector,label)=>{
   const node=[...document.querySelectorAll(selector)].find(element=>element.getClientRects().length&&(!label||element.textContent.trim()===label));
   node?.click();return Boolean(node);
  },selector,label);
  const box=(selector,scroll=false)=>wait((selector,scroll)=>{
   const node=document.querySelector(selector);if(!node?.getClientRects().length)return false;
   if(scroll)node.scrollIntoView({block:'center'});
   const rect=node.getBoundingClientRect(),x=Math.round(rect.left+rect.width/2),y=Math.round(rect.top+rect.height/2);
   return {x,y,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,hit:node.contains(document.elementFromPoint(x,y)),
    background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color,radius:parseFloat(getComputedStyle(node).borderTopLeftRadius)};
  },selector,scroll);
  const mouse=(type,{x,y})=>debuggerSession.sendCommand('Input.dispatchMouseEvent',{type,x,y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
  const physicalClick=async point=>{assert.ok(point.hit,JSON.stringify(point));await mouse('mousePressed',point);await mouse('mouseReleased',point);};
  const press=async(key,virtualKey)=>{
   const event={key,code:key,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey};
   await debuggerSession.sendCommand('Input.dispatchKeyEvent',key==='Enter'?{...event,type:'keyDown',text:'\r'}:{...event,type:'rawKeyDown'});
   await debuggerSession.sendCommand('Input.dispatchKeyEvent',{...event,type:'keyUp'});
  };
  const hint='.storyboard-material-trigger',pending='.collab-shot-card[data-shot-id="prompt-2"]';
  const panel='.storyboard-material-popover:popover-open',action=panel+' button';
  const hidden=()=>wait(()=>!document.querySelector('.storyboard-material-popover:popover-open'));
  await win.loadURL(url+page);
  await click('#app-sidebar button','项目协作');
  await click('.collab-hub button','进入项目');
  for(const width of widths){
   await mouse('mouseMoved',{x:10,y:10});
   win.setContentSize(width,800);
   await wait(width=>innerWidth===width,width);
   await click('.collab-rail button','分镜');
   if(await run(()=>Boolean(document.querySelector('.collab-episode-card')?.getClientRects().length)))await click('.collab-episode-card');
   await wait(pending=>Boolean(document.querySelector(`${pending} :is(.storyboard-material-status,.storyboard-material-trigger)`)),pending);
   assert.equal(await run(()=>document.querySelectorAll('.storyboard-material-status').length),0,'素材未就绪不再显示横幅');
   assert.equal(await run(hint=>document.querySelectorAll(hint).length,hint),1,'素材已就绪的分镜不显示叹号');
   await box(pending+' .generation-prompt-title '+hint,true);
   await pause(100);
   const trigger=await box(pending+' .generation-prompt-title '+hint);
   const heading=await box(pending+' .generation-prompt-title > label');
   assert.ok(trigger.hit&&Math.abs(trigger.y-heading.y)<3);
   await mouse('mouseMoved',trigger);
   const popup=await box(panel);
   assert.ok(popup.left>=8&&popup.top>=8&&popup.right<=width-8&&popup.bottom<=792,JSON.stringify(popup));
   assert.equal(popup.background,'rgb(255, 255, 255)');
   assert.ok(popup.radius>=12);
   const message=await run(panel=>document.querySelector(panel).textContent,panel);
   assert.match(message,/素材待就绪.*尚未核实发布.*尚未选定有效图片.*当前素材 0 项/s);
   const link=await box(action);
   assert.notEqual(link.color,popup.color,'跳转文字与说明采用不同颜色');
   await mouse('mouseMoved',link);
   await pause(310);
   assert.ok(await run(action=>Boolean(document.querySelector(action)),action),'指针移入浮层后保持可点击');
   await mouse('mouseMoved',{x:10,y:10});
   await hidden();

   await run(selector=>document.querySelector(selector).focus(),hint);
   await box(panel);
   await press('Tab',9);
   await wait(action=>document.activeElement===document.querySelector(action),action);
   await press('Escape',27);
   await hidden();
   await wait(hint=>document.activeElement===document.querySelector(hint),hint);
   await press('Enter',13);
   await wait(action=>document.activeElement===document.querySelector(action),action);
   await press('Escape',27);
   await hidden();

   await physicalClick(await box(hint));
   await physicalClick(await box(action));
   await wait(()=>Boolean(document.querySelector('.prompt-art-stepper [aria-selected="true"][aria-label$="1-1-2"]')?.getClientRects().length));
   await hidden();
   results.push({width,readyHidden:true,hoverPersists:true,keyboard:true,checklist:'1-1-2'});
  }
  assert.deepEqual(await run(()=>window.materialHintPaidCalls),[]);
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  console.log(JSON.stringify({results,realPaidCalls:0}));
 }catch(error){
  exit=1;console.error(error,results);
  if(win&&!win.isDestroyed())console.error(await win.webContents.executeJavaScript(`({width:innerWidth,active:document.activeElement?.outerHTML.slice(0,260),
   trigger:[...document.querySelectorAll('.storyboard-material-trigger')].map(node=>({hover:node.matches(':hover'),expanded:node.getAttribute('aria-expanded'),box:node.getBoundingClientRect().toJSON()})),text:document.body.innerText.slice(0,3000)})`).catch(()=>''));
 }finally{win?.destroy();await server?.close();app.exit(exit);}
});

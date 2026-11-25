const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');

const temp=fs.realpathSync(os.tmpdir());
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process');
 const profile=fs.mkdtempSync(path.join(temp,'xz-long-selects-'));
 try{
  const result=spawnSync(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,timeout:120000,
   env:{...process.env,XZ_LONG_SELECT_PROFILE:profile}});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
 }finally{
  // Electron still owns the profile's databases until its main process exits.
  if(path.dirname(fs.realpathSync(profile))===temp)fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
 return;
}

const {app,BrowserWindow}=require('electron');
const root=path.resolve(__dirname,'..'),page='scripts/fixtures/wave-three-ui.html';
const profile=process.env.XZ_LONG_SELECT_PROFILE;
if(!profile||path.dirname(fs.realpathSync(profile))!==temp||!path.basename(profile).startsWith('xz-long-selects-'))throw Error('Run node scripts/verify-long-selects.cjs');
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});

app.whenReady().then(async()=>{
 let server,win,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,cacheDir:path.join(profile,'vite-cache'),
   optimizeDeps:{entries:[page]},server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
  await server.listen();
  const local=server.resolvedUrls.local[0];
  win=new BrowserWindow({width:1280,height:900,show:false,webPreferences:{backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},
   ({url},done)=>done({cancel:!url.startsWith(local)}));
  const debugging=win.webContents.debugger;
  debugging.attach('1.3');
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  async function wait(fn,...args){
   for(let n=0;n<100;n++){
    const result=await run(fn,...args);
    if(result)return result;
    await pause(50);
   }
   throw Error(`Timed out ${fn} ${JSON.stringify(args)}`);
  }
  const click=(selector,label)=>wait((selector,label)=>{
   const button=[...document.querySelectorAll(selector)].find(node=>node.getClientRects().length&&
    (!label||[node.textContent.trim(),node.getAttribute('aria-label')].includes(label)));
   button?.click();
   return Boolean(button);
  },selector,label);
  const mouse=(type,point)=>debugging.sendCommand('Input.dispatchMouseEvent',{...point,type,
   ...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
  async function key(key,code){
   for(const type of ['keyDown','keyUp'])await debugging.sendCommand('Input.dispatchKeyEvent',{
    type,key,code:key===' '?'Space':key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,
    ...(type==='keyDown'&&key===' '?{text:key}:{})});
  }
  async function verify(label,options={}){
   const selector=`select[aria-label="${label}"]`;
   const point=await wait((selector,option)=>{
    const select=document.querySelector(selector);
    if(!select?.getClientRects().length)return false;
    if(option&&select.value!==option){
     select.value=option;
     select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    select.scrollIntoView({block:'nearest'});
    const {x,y,width,height}=select.getBoundingClientRect();
    return {x:Math.round(x+width/2),y:Math.round(y+height/2)};
   },selector,options.option);
   await mouse('mouseMoved',point);
   const collapsed=await run(selector=>{
    const select=document.querySelector(selector);
    const label=select.querySelector('selectedcontent');
    const {width,height,top,bottom,right,left}=select.getBoundingClientRect();
    if(!label)return {width,height,title:select.title,nativeFallback:true};
    const {whiteSpace,textOverflow,overflowX}=getComputedStyle(label);
    const box=label.getBoundingClientRect();
    const text=document.createRange();text.selectNodeContents(label);
    const rows=new Set([...text.getClientRects()].map(rect=>rect.top)).size;
    return {width,height,title:select.title,full:select.selectedOptions[0].label,
     whiteSpace,textOverflow,overflowX,rows,truncated:label.scrollWidth>label.clientWidth,
     fits:box.top>=top&&box.bottom<=bottom&&box.left>=left&&box.right<=right,
     right};
   },selector);
   assert.ok(collapsed.fits,JSON.stringify({label,collapsed}));
   assert.equal(collapsed.whiteSpace,'nowrap');
   assert.equal(collapsed.textOverflow,'ellipsis');
   assert.equal(collapsed.overflowX,'hidden');
   assert.equal(collapsed.rows,1);
   assert.ok(collapsed.truncated,JSON.stringify({label,failed:'fixture should overflow',collapsed}));
   assert.ok(collapsed.title.includes(collapsed.full),`${label} has no full-value tooltip`);
   await mouse('mousePressed',point);
   await mouse('mouseReleased',point);
   await wait(selector=>document.querySelector(selector).matches(':open'),selector);
   await pause(170);
   const open=await run(selector=>{
    const select=document.querySelector(selector),option=select.selectedOptions[0];
    const {left,right,top,bottom,width}=option.getBoundingClientRect();
    const title=document.createRange();title.selectNodeContents(option);
    const complete=[...title.getClientRects()].every(box=>box.left>=left&&box.right<=right&&box.top>=top&&box.bottom<=bottom);
    return {inside:left>=0&&right<=innerWidth&&top>=0&&bottom<=innerHeight,complete,width,
     full:option.label,hit:document.elementFromPoint(left+5,top+5)===option,appearance:getComputedStyle(select).appearance};
   },selector);
   assert.ok(open.inside&&open.complete&&open.hit,JSON.stringify({label,open}));
   assert.equal(open.appearance,'base-select');
   assert.equal(open.full,collapsed.full);
   assert.ok(open.width>collapsed.width,JSON.stringify({label,open,collapsed}));
   await key('Escape',27);
   await wait(selector=>!document.querySelector(selector).matches(':open'),selector);
   return {label,triggerWidth:Math.round(collapsed.width),optionWidth:Math.round(open.width)};
  }
  await win.loadURL(local+page+'?long-selects');
  const evidence=[];
  for(const width of [1280,1600,1920]){
   win.setContentSize(width,900);
   await click('#app-sidebar button','导演工作台');
   await click('.director-shell button','快速模式');
   const generation=await verify('本集提示词模型');
   const estimate=await verify('估时模型',{option:'mock-0'});
   await click('#app-sidebar button','项目协作');
   const entered=await run(()=>Boolean(document.querySelector('.collab-rail')));
   if(!entered)await click('.collab-hub button','进入项目');
   await click('.collab-rail button','信息读取');
   const analysis=await verify('分析模型');
   await click('.collab-rail button','分镜');
   if(!await run(()=>Boolean(document.querySelector('select[aria-label="选择集数"]'))))await click('.collab-episode-card');
   const episode=await verify('选择集数');
   assert.ok(await run(()=>document.documentElement.scrollWidth<=innerWidth));
   evidence.push({width,controls:[generation,estimate,analysis,episode]});
  }
  const renderEdge=()=>run(()=>{
   const region=document.createElement('div');
   region.style.cssText='position:fixed;right:12px;bottom:12px;overflow:hidden;width:120px;height:42px;z-index:9000';
   const select=document.createElement('select');
   select.setAttribute('aria-label','边缘测试');
   select.title='已有操作说明';
   select.style.cssText='width:100%;height:36px';
   select.add(new Option('超长名称'.repeat(30),'long'));
   select.add(new Option('第二个完整名称','second'));
   region.append(select);
   document.body.append(region);
  });
  await renderEdge();
  const edge=await verify('边缘测试');
  await run(()=>document.querySelector('select[aria-label="边缘测试"]').focus());
  await key(' ',32);
  await key('ArrowDown',40);
  await key('Enter',13);
  await wait(()=>{
   const select=document.querySelector('select[aria-label="边缘测试"]');
   return select.value==='second'&&select.title.includes('已有操作说明')&&select.title.includes('第二个完整名称');
  });
  assert.deepEqual(await run(()=>waveThree.attemptedPaid),[]);
  await win.loadURL(local+'canvas-app/index.html');
  await renderEdge();
  const canvas=await verify('边缘测试');
  console.log(JSON.stringify({widths:[1280,1600,1920],evidence,edge,canvas,keyboard:true,paidCalls:0}));
 }catch(error){exit=1;console.error(error);}
 finally{
  win?.destroy();
  server?.httpServer?.closeAllConnections();
  if(server)await Promise.race([server.close(),pause(1500)]);
  app.exit(exit);
 }
});

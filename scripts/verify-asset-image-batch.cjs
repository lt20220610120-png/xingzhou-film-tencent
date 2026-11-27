const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');

const root=path.join(__dirname,'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-asset-image-batch-ui-'));
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
  const select=async (label,value)=>{
   await wait(`(()=>{const element=document.querySelector('select[aria-label="${label}"]');if(!element)return false;
     element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  };
  const nav=label=>click('#app-sidebar button',label);
  const section=label=>click('.collab-rail button',label);
  const category=label=>click('.collab-cat-tabs button',label);
  const generate=()=>click('.asset-batch-primary','一键生成',true);
  const count=(field,id)=>`waveThree.${field}.filter(v=>(v.assetId||v)===${JSON.stringify(id)}).length`;
  const release=async id=>assert.equal(await run(`waveThree.releaseImage(${JSON.stringify(id)})`),true);
  const releaseAll=()=>run('waveThree.pendingImages().forEach(id=>waveThree.releaseImage(id))');
  const sizes=[1280,1600,1920];
  for(const mode of ['cloud','local']){
   await win.loadURL(url+'scripts/fixtures/wave-three-ui.html?asset-image-batch&mode='+mode);
   await nav('项目协作');
   await wait("!!document.querySelector('.collab-hub, .collab-rail')");
   if(!await run("!!document.querySelector('.collab-rail')"))await click('.collab-hub button, .collab-hub [role=button]','进入项目');
   await section('资产');
   await category('道具');
   await select('道具关联数量条件','all');
   await select('资产图片并发数量','1');
   await generate();
   await wait('waveThree.imageRequests.length===1');
   const firstProp=await run('waveThree.imageRequests[0].assetId');
   await category('角色');
   await click('.asset-batch-actions button','只生成默认参考妆造',true);
   await wait(count('imageRequests','day')+'===1');
   await generate();
   assert.equal(await run(count('imageRequests','night')),0);
   await category('场景');
   await generate();
   await wait(count('imageRequests','studio-night')+'===1');
   await section('分镜');
   await section('视频池');
   await nav('导演工作台');
   await release('day');
   await wait(count('imageRequests','night')+'===1');
   assert.match(JSON.stringify(await run("waveThree.imageRequests.find(x=>x.assetId==='night').references")),/saved-day|#day/);
   await release('night');
   await release('studio-night');
   await release(firstProp);
   await wait('waveThree.imageRequests.filter(x=>x.assetId!=="day"&&x.assetId!=="night"&&x.assetId!=="studio-night").length===2');
   await nav('项目协作');
   await section('资产');
   await wait("document.querySelector('.asset-image-batch-progress')?.innerText.includes('角色') || document.querySelector('.asset-image-batch-progress')?.innerText.includes('人物')");
   await click('.asset-image-batch-progress-row button','停止后续生成');
   await releaseAll();
   await wait("document.querySelector('.asset-image-batch-progress')?.innerText.includes('项未开始')");
   assert.equal(await run(count('savedImages','night')),1);
   assert.equal(await run(count('savedImages','day')),1);
   assert.equal(await run(count('savedImages','studio-night')),1);
   await category('道具');
   await select('道具关联数量条件','all');
   await select('资产图片并发数量','0');
   await run("waveThree.failImage='group-9'");
   await generate();
   await wait('waveThree.pendingImages().length>8');
   await nav('图视生成');
   await releaseAll();
   await nav('项目协作');
   await section('资产');
   await wait("document.querySelector('.asset-image-batch-progress')?.textContent.includes('查看失败详情（1）')");
   assert.match(await run("document.querySelector('.asset-image-batch-progress').textContent"),/接口返回 503/);
   const ids=await run('waveThree.imageRequests.map(x=>x.assetId)');
   assert.equal(ids.length,new Set(ids).size);
   await section('美术');
   await click('.art-whole-generation button, .project-composition-control button','一键生成全剧图片');
   await click('.art-image-batch-modal button','确认开始生成');
   await wait("waveThree.pendingImages().includes('group-9')");
   await nav('导演工作台');
   await run('waveThree.failImage=null');
   await release('group-9');
   await wait(count('savedImages','group-9')+'===1');
   await nav('项目协作');
   await section('美术');
   await wait("document.querySelector('.asset-image-batch-progress')?.innerText.includes('美术 · 全剧图片')");
   for(const width of sizes){
    win.setContentSize(width,900);
    await wait(`innerWidth===${width}`);
    assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),`${mode} ${width}px`);
   }
   assert.deepEqual(await run('waveThree.attemptedPaid'),[]);
  }
  assert.deepEqual(external,[]);
  console.log(JSON.stringify({modes:['local','cloud'],widths:sizes,parallelCategories:true,crossPage:true,unlimited:true,baseline:true,stop:true,errors:true,wholeProduction:true,paidCalls:0}));
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

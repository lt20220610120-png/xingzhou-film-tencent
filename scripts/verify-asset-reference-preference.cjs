const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');

const root=path.join(__dirname,'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'xz-asset-reference-ui-'));
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
  const setInput=async (label,value,previous)=>{
   await wait(`(()=>{const element=document.querySelector('input[aria-label="${label}"]');if(!element)return false;
     const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
     if(${JSON.stringify(previous||'')}&&element.value!==${JSON.stringify(previous||'')})return false;
     setter.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  };
  const row=name=>`article[aria-label="${name}"]`;
  const hasRow=name=>`!!document.querySelector(${JSON.stringify(row(name))})`;
  const preference=id=>`waveThree.preferences().find(a=>a.id===${JSON.stringify(id)}).noReferenceImage`;
  const clickTab=label=>click('.collab-rail button',label);
  for(const mode of ['cloud','local']){
  await win.loadURL(url+'scripts/fixtures/wave-three-ui.html?asset-reference-preference&mode='+mode);
  await run("localStorage.removeItem('xz-collab-last-project:wave-three-isolated')");
  await win.reload();
  await click('#app-sidebar button','项目协作');
  await click('.collab-hub button, .collab-hub [role=button]','进入项目');
  await clickTab('美术');
  await wait("!!document.querySelector('.collab-episode-card, .art-episode-picker')");
  if(!await run("!!document.querySelector('.art-episode-picker')"))await click('.collab-episode-card','第 1 集',true);
  await click('.collab-cat-tabs button','道具');
  await wait(hasRow('冷链重卡'));
  await wait(`document.querySelector('${row('冷链重卡')} input[type=checkbox]')?.checked`);
  await click(`${row('随身钢笔')} input[type=checkbox]`,'选择 随身钢笔 批量生成');
  await click(`${row('台灯')} input[type=checkbox]`,'选择 台灯 批量生成');
  await click('.asset-reference-preference-actions button','一键确定无需参考图（1）');
  await wait("document.querySelector('.workspace-dialog[open]')?.textContent.includes('道具分类的 1 项')");
  assert.deepEqual(await run('waveThree.operations.filter(r=>r.assetIds)'),[]);
  await click('.workspace-dialog button','取消');
  assert.equal(await run(preference('truck')),false);
  await click('.asset-reference-preference-actions button','一键确定无需参考图（1）');
  await click('.workspace-dialog button','确定标记');
  await wait(`document.querySelector('${row('冷链重卡')} .reference-exempt')?.textContent==='无需参考图'`);
  assert.deepEqual(await run('waveThree.operations.filter(r=>r.assetIds)'),[{assetIds:['truck'],noReferenceImage:true}]);
  assert.equal(await run(preference('stamp')),false);
  assert.equal(await run(preference('pen')),false);

  await clickTab('资产');
  await click('.collab-cat-tabs button','道具');
  await select('道具关联数量条件','at-most');
  await setInput('道具关联提示词条数','1','2');
  await wait(hasRow('印章'));
  assert.equal(await run(hasRow('随身钢笔')),false);
  await wait(`document.querySelector('${row('印泥')} input[type=checkbox]')?.checked`);
  await click(`${row('印泥')} input[type=checkbox]`,'选择 印泥 批量生成');
  await click(`${row('台灯')} input[type=checkbox]`,'选择 台灯 批量生成');
  await click('.asset-reference-preference-actions button','一键确定无需参考图（1）');
  await click('.workspace-dialog button','确定标记');
  await wait(`document.querySelector('${row('印章')} .reference-exempt')?.textContent==='无需参考图'`);
  assert.deepEqual(await run('waveThree.operations.filter(r=>r.assetIds).at(-1)'),{assetIds:['stamp'],noReferenceImage:true});
  await click('.asset-view-filters button','只看未生成（1）');
  await wait(`!document.querySelector('${row('印章')}') && ${hasRow('印泥')}`);
  assert.equal(await run(hasRow('冷链重卡')),false);
  await click('.asset-category-batch-controls button','全选未生成');
  await wait(`document.querySelector('${row('印泥')} input[type=checkbox]')?.checked`);
  await click('.asset-view-filters button','只看未生成（1）');
  await click(`${row('旧钱包')} button`,'采用此图');
  await click('.asset-reference-preference-actions button','一键取消无需参考图（2）');
  await wait(`!${preference('stamp')} && !document.querySelector('${row('印章')} .reference-exempt')`);
  await wait(`!${preference('archive')} && document.querySelector('${row('旧钱包')} .asset-image-adopt')?.textContent==='已采用'`);
  await click('.collab-cat-tabs button','角色');
  await click('.character-outfit-picker button','工装',true);
  const picker=(asset)=>`document.querySelector(${JSON.stringify(row(asset)+' select[aria-label$="参考图片"]')})`;
  const checkOptions=async(asset,id)=>{
   await wait(`!!${picker(asset)}`);
   const values=await run(`[...${picker(asset)}.options].map(option=>option.value)`);
   assert.ok(values.includes(id));
   assert.ok(values.includes('__auto__')&&values.includes(''));
   assert.ok(values.every(value=>['__auto__','','__local__',id,...(id==='day'?['person']:[])].includes(value)),`${asset} 跨类参考 ${values}`);
  };
  await checkOptions('【李岚-工装】','day');
  await run("localStorage.setItem('xz-asset-reference:wave-three-isolated:qa-project:studio-night','day')");
  await click('.collab-cat-tabs button','场景');
  await checkOptions('【影棚-夜-内】','studio');
  assert.equal(await run(`${picker('【影棚-夜-内】')}.value`),'__auto__');
  await click('.asset-reference-preference-actions button','一键确定无需参考图（1）');
  await click('.workspace-dialog button','确定标记');
  await wait(preference('studio-night'));
  await click('.asset-reference-preference-actions button','撤销');
  await wait(`!${preference('studio-night')}`);
  await click('.collab-cat-tabs button','道具');
  await select('道具关联数量条件','all');
  await wait(`!!${picker('冷链重卡')}`);
  const propOptions=await run(`[...${picker('冷链重卡')}.options].map(option=>option.value)`);
  assert.ok(propOptions.includes('lamp'));
  assert.ok(propOptions.every(value=>['__auto__','','__local__','lamp','archive'].includes(value)));
  await click('.collab-cat-tabs button','角色');
  await click('.character-outfit-picker button','工装',true);
  await click(`${row('【李岚-工装】')} button`,'标记无需参考图');
  await wait(preference('night'));
  assert.equal(await run(preference('day')),false);
  assert.equal(await run(preference('lamp')),false);
  assert.equal(await run("waveThree.preferences().find(a=>a.id==='lamp').adoptedImageId"),'fixture-image');
  assert.equal(await run("waveThree.preferences().find(a=>a.id==='day').adoptedImageId"),'fixture-image');
  assert.deepEqual(await run('waveThree.attemptedPaid'),[]);

  await win.reload();
  await click('#app-sidebar button','项目协作');
  await wait("!!document.querySelector('.collab-rail')");
  await clickTab('资产');
  await click('.character-outfit-picker button','工装',true);
  await wait(`document.querySelector('${row('【李岚-工装】')} .reference-exempt')?.textContent==='无需参考图'`);
  for(const width of [1280,1600,1920]){
   win.setContentSize(width,900);
   await wait(`innerWidth===${width}`);
   assert.ok(await run("document.documentElement.scrollWidth<=innerWidth"),`资产操作区在 ${width}px 应可完整显示`);
  }
  }
  assert.deepEqual(external,[]);
  assert.deepEqual(await run('waveThree.attemptedPaid'),[]);
  console.log(JSON.stringify({modes:['local','cloud'],widths:[1280,1600,1920],sameCategory:true,undo:true,episodeBulk:true,wholeProjectPropFilter:true,
   skippedAdopted:true,defaultSelectionExcludesMarked:true,cancel:true,adoption:true,isolatedOutfit:true,reload:true,paidCalls:0}));
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

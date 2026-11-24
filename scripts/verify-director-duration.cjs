const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {setTimeout:wait}=require('node:timers/promises');
const temp=fs.realpathSync(os.tmpdir()),profile=fs.mkdtempSync(path.join(temp,'xz-director-duration-'));
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.disableHardwareAcceleration();

app.whenReady().then(async()=>{
 let server,window,exit=0;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root:path.join(__dirname,'..'),configFile:false,cacheDir:path.join(profile,'vite-cache'),
   optimizeDeps:{entries:['scripts/fixtures/director-duration.html']},server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'});
  await server.listen();
  window=new BrowserWindow({width:1280,height:940,show:false,webPreferences:{backgroundThrottling:false}});
  const target=server.resolvedUrls.local[0],blocked=[];
  window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},({url},callback)=>{
   if(!url.startsWith(target))blocked.push(url);
   callback({cancel:!url.startsWith(target)});
  });
  await window.loadURL(target+'scripts/fixtures/director-duration.html');
  const run=source=>window.webContents.executeJavaScript(source,true);
  const until=async source=>{
   for(let i=0;i<120;i++){const value=await run(source);if(value)return value;await wait(75);}
   throw Error('Timed out: '+source);
  };
  const press=(selector,label)=>until(`(() => { const control=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getClientRects().length&&!node.disabled&&(node.getAttribute('aria-label')===${JSON.stringify(label)}||node.textContent.trim()===${JSON.stringify(label)})); if (!control) return false; control.click(); return true; })()`);
  await press('#app-sidebar button','导演工作台');
  await until('document.querySelector(\'.quick-scene-card\')?.getClientRects().length');
  await press('.quick-generation-controls button','生成');
  await until('document.querySelector(".duration-estimate-ready")?.textContent.includes("11 秒")&&document.querySelector(".duration-estimate-action")?.textContent==="补估"');
  const first=await run('durationFixture.calls');
  assert.deepEqual(first.map(row=>[row.kind,row.profileId]),[['body','director-fixture'],['review','director-fixture'],['estimate','director-fixture']]);
  assert.equal(first[0].independent,true);
  assert.equal(first[2].skillIsolated,true);
  assert.equal(first[2].input.max_duration_seconds,30);
  assert.match(first[2].input.segments[0].script,/- 她掏出手机/);
  assert.match(first[2].input.segments[0].prompt,/【内心独白/);
  await run(`(() => {const node=document.querySelector('select[aria-label="估时模型"]');node.value='estimator-fixture';node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await press('.prompt-card button','补估');
  await until('document.querySelector(".duration-estimate-tight")?.textContent.includes("34 秒")');
  let calls=await run('durationFixture.calls');
  assert.deepEqual(calls.map(row=>[row.kind,row.profileId]),[...first.map(row=>[row.kind,row.profileId]),['estimate','estimator-fixture']]);
  assert.deepEqual(calls[3].input.segments.map(row=>row.segment_id),['1-1-2']);
  const widths=[1280,1600,1920];
  for(const width of widths){
   window.setContentSize(width,940);
   await until(`innerWidth===${width}`);
   const result=await run(`(() => { const caps=document.querySelector('select[aria-label="最高视频时长"]'); const ready=[...document.querySelectorAll('.duration-estimate-ready')].find(node=>node.textContent.includes('30 秒')); ready.scrollIntoView({block:'center'});ready.focus();ready.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));return {choices:[...caps.options].map(option=>option.value),cap:caps.value,overflow:document.documentElement.scrollWidth>innerWidth}; })()`);
   assert.deepEqual(result,{choices:['15','30'],cap:'30',overflow:false});
   const popup=await until(`(() => { const popup=document.querySelector('[role=tooltip] .duration-estimate-detail');if(!popup)return false;const rect=popup.getBoundingClientRect();return {text:popup.textContent,left:rect.left,right:rect.right}; })()`);
   for(const label of ['自然演完 34 秒','发声 30 秒','非并行动作 3 秒','气口缓冲 1 秒'])assert.ok(popup.text.includes(label),JSON.stringify(popup));
   assert.ok(popup.left>=0&&popup.right<=width,JSON.stringify(popup));
   await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.activeElement.blur()");
  }
  await press('.director-batch-launcher > button','一键生成整本提示词');
  const batchOptions=await until(`(() => {const node=document.querySelector('select[aria-label="整本最高视频时长"]');return node&&[...node.options].map(option=>option.value);})()`);
  assert.deepEqual(batchOptions,['15','30']);
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await press('.prompt-card button','编辑');
  await until('document.querySelector("[aria-label=\\"编辑提示词 1-1-1\\"]")?.getClientRects().length');
  await run(`(() => {const node=document.querySelector('[aria-label="编辑提示词 1-1-1"]');node.focus();const v=node.textContent;node.textContent=v+'手工核对。';node.dispatchEvent(new InputEvent('input',{bubbles:true,data:'手工核对。'}));})()`);
  await press('.prompt-card button','保存修改');
  await until('document.querySelector(".duration-estimate-review")?.textContent==="待复核"');
  assert.equal((await run('durationFixture.calls')).length,4);
  await press('.prompt-card button','重估时长');
  await until('durationFixture.calls.length===5&&document.querySelectorAll(".duration-estimate-ready").length===2');
  assert.deepEqual(await run('durationFixture.unexpected'),[]);
  assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({widths,exactBatches:[2,1,1],defaultModel:true,optionalModel:true,legacy35MappedTo30:true,manualCuts:true,
   staleManualEdit:true,onlyEstimatesRetried:true,keyboardTooltip:true,paidCalls:0}));
 }catch(error){exit=1;console.error(error);}
 finally{
  window?.destroy();await server?.close();
  if(path.dirname(fs.realpathSync(profile))===temp)await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  app.exit(exit);
 }
});

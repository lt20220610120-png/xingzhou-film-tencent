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
   const evidence=await run(`JSON.stringify({calls:durationFixture.calls.map(c=>[c.kind,c.profileId]),unexpected:durationFixture.unexpected,held:!!durationFixture.releaseRetry,saved:durationFixture.saved?.map?.(p=>p.episodes?.[0]?.prompts?.map(row=>row.durationEstimate?.status)),text:document.querySelector('.director-stage')?.textContent.slice(-650)})`);
   throw Error('Timed out: '+source+' '+evidence);
  };
  const press=(selector,label)=>until(`(() => { const control=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getClientRects().length&&!node.disabled&&(node.getAttribute('aria-label')===${JSON.stringify(label)}||node.textContent.trim()===${JSON.stringify(label)})); if (!control) return false; control.click(); return true; })()`);
  await press('#app-sidebar button','导演工作台');
  await until('document.querySelector(\'.quick-scene-card\')?.getClientRects().length');
  await press('.quick-generation-controls button','生成');
  await until('durationFixture.releaseRetry&&document.querySelectorAll(".duration-estimate-ready").length===2&&durationFixture.saved?.[0].episodes[0].prompts.filter(p=>p.durationEstimate?.status==="estimated").length===2');
  await run('durationFixture.releaseRetry();durationFixture.releaseRetry=null');
  await until('document.querySelector(".duration-estimate-ready")?.textContent.includes("11 秒")&&document.querySelector(".duration-estimate-action")?.textContent==="补估"');
  const first=await run('durationFixture.calls');
  assert.deepEqual(first.map(row=>[row.kind,row.profileId]),[['body','director-fixture'],['review','director-fixture'],['estimate','director-fixture'],['estimate','director-fixture']]);
  assert.equal(first[0].independent,true);
  assert.equal(first[2].skillIsolated,true);
  assert.equal(first[2].stream,true);assert.equal(first[2].analysisMode,true);
  assert.notEqual(first[2].taskId,first[3].taskId);
  assert.deepEqual(first[3].input.segments.map(row=>row.segment_id),['1-1-3']);
  assert.match(first[2].input.segments[0].script,/- 她掏出手机/);
  assert.match(first[2].input.segments[0].prompt,/【内心独白/);
  await run(`(() => { const node=document.querySelector('.duration-estimate-review');node.focus();node.dispatchEvent(new FocusEvent('focusin',{bubbles:true})); })()`);
  await until(`document.querySelector('[role="tooltip"]')?.textContent.includes('模型漏掉了这个片段')`);
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.activeElement.blur()");
  const widths=[1280,1600,1920];
  for(const width of widths){
   window.setContentSize(width,940);
   await until(`innerWidth===${width}`);
   const layout=await run(`(() => {const header=document.querySelector('.quick-scene-prompts-title'),title=header.querySelector('.director-duration-heading'),a=header.querySelector('.director-duration-reestimate'),b=header.querySelector('.director-duration-retry'),rect=node=>node.getBoundingClientRect(),middle=node=>(rect(node).top+rect(node).bottom)/2; return {aligned:Math.abs(middle(title)-middle(a))<2&&Math.abs(middle(a)-middle(b))<2,inside:rect(title).right<=rect(a).left&&rect(b).right<=rect(header).right,primary:getComputedStyle(b).backgroundColor,primaryText:getComputedStyle(b).color,secondary:getComputedStyle(a).backgroundColor,height:rect(header).height};})()`);
   assert.ok(layout.aligned&&layout.inside,JSON.stringify({width,layout}));
   assert.equal(layout.primary,'rgb(117, 99, 191)');assert.equal(layout.primaryText,'rgb(255, 255, 255)');
   assert.notEqual(layout.secondary,'rgb(255, 255, 255)');
   assert.ok(layout.height<65,JSON.stringify(layout));
  }
  await run(`(() => {const node=document.querySelector('select[aria-label="估时模型"]');node.value='estimator-fixture';node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await press('.prompt-card button','补估');
  await until('durationFixture.releaseRetry&&document.querySelector(".director-duration-progress")?.textContent==="估时 0/1"');
  await run('durationFixture.releaseRetry();durationFixture.releaseRetry=null');
  await until('document.querySelector(".duration-estimate-tight")?.textContent.includes("34 秒")');
  await until('document.querySelector(".director-duration-result")?.textContent.includes("成功 1 条 · 失败 0 条")');
  let calls=await run('durationFixture.calls');
  assert.deepEqual(calls.map(row=>[row.kind,row.profileId]),[...first.map(row=>[row.kind,row.profileId]),['estimate','estimator-fixture']]);
  assert.deepEqual(calls[4].input.segments.map(row=>row.segment_id),['1-1-3']);
  assert.equal(calls[4].analysisMode,false);
  for(const width of widths){
   window.setContentSize(width,940);
   await until(`innerWidth===${width}`);
   const result=await run(`(() => { const caps=document.querySelector('select[aria-label="最高视频时长"]'); const ready=[...document.querySelectorAll('.duration-estimate-ready')].find(node=>node.textContent.includes('30 秒')); ready.scrollIntoView({block:'center'});ready.focus();ready.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));return {choices:[...caps.options].map(option=>option.value),cap:caps.value,overflow:document.documentElement.scrollWidth>innerWidth}; })()`);
   assert.deepEqual(result,{choices:['15','30'],cap:'30',overflow:false});
   const popup=await until(`(() => { const popup=document.querySelector('[role=tooltip] .duration-estimate-detail');if(!popup)return false;const rect=popup.getBoundingClientRect();return {text:popup.textContent,left:rect.left,right:rect.right}; })()`);
   for(const label of ['自然演完 34 秒','发声 0 秒','非并行动作 33.4 秒','气口缓冲 0.6 秒'])assert.ok(popup.text.includes(label),JSON.stringify(popup));
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
  assert.equal((await run('durationFixture.calls')).length,5);
  await press('.prompt-card button','重估时长');
  await until('durationFixture.calls.length===6&&document.querySelectorAll(".duration-estimate-ready").length===3');
  await press('.director-duration-actions button','重估时长');
  await until('durationFixture.releaseRetry&&document.querySelector(".director-duration-progress")?.textContent==="估时 0/3"');
  await press('.director-duration-actions button','取消估时');
  await until('durationFixture.cancelled.length===1&&document.querySelector(".director-duration-result")?.textContent.includes("已取消")');
  assert.deepEqual(await run('durationFixture.unexpected'),[]);
  await window.loadURL(target+'scripts/fixtures/director-duration.html?auto=1');
  await press('#app-sidebar button','导演工作台');
  await press('.quick-generation-controls button','生成');
  await until('document.querySelector(".duration-estimate-overload")?.textContent.includes("自然 36 秒")&&[...document.querySelectorAll(".prompt-locator-toolbar button")].some(b=>b.textContent.trim()==="重分本场")');
  assert.deepEqual(await run('durationFixture.calls.map(row=>row.kind)'),['plan','body','estimate']);
  const initial=await run('durationFixture.saved[0].episodes[0].prompts.map(p=>p.content)');
  await press('.prompt-locator-toolbar button','重分本场');
  await press('.workspace-dialog button','取消');
  assert.deepEqual(await run('durationFixture.saved[0].episodes[0].prompts.map(p=>p.content)'),initial);
  assert.equal(await run('durationFixture.calls.filter(row=>row.kind==="body").length'),1);
  await press('.prompt-locator-toolbar button','重分本场');
  await press('.workspace-dialog button','确认');
  await until('durationFixture.saved[0].episodes[0].prompts.length>'+initial.length+'&&durationFixture.saved[0].episodes[0].prompts.every(p=>p.content.includes("第 2 版"))');
  assert.equal(await run('durationFixture.calls.filter(row=>row.kind==="body").length'),2);
  assert.ok((await run('durationFixture.saved[0].promptHistory.map(p=>p.content)')).some(content=>initial.includes(content)));
  assert.deepEqual(await run('durationFixture.unexpected'),[]);
  await window.loadURL(target+'scripts/fixtures/director-duration.html?legacy=1');
  await press('#app-sidebar button','导演工作台');
  await until('document.querySelector(".duration-estimate-ready")?.textContent.includes("9 秒")');
  await press('.director-duration-actions button','重估时长');
  await until('durationFixture.saved?.[0].episodes[0].prompts[0].durationEstimate.version==="3.0.0"');
  const refreshed=await run('durationFixture.saved[0].episodes[0].prompts[0]');
  assert.equal(refreshed.durationEstimate.status,'estimated');
  assert.equal(refreshed.durationEstimate.recommendedSeconds,4);
  assert.match(refreshed.content,/500万，OK/);
  assert.deepEqual(await run('durationFixture.unexpected'),[]);
  assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({widths,exactBatches:[3,1,1,1,3],partialResultsPersistBeforeRetry:true,deepSeekFastAndOtherProfilesUnchanged:true,preciseHiddenFailureTooltip:true,
   headerAlignmentAndPurple:true,progressSummaryAndCancellation:true,legacy35MappedTo30:true,manualCuts:true,staleManualEdit:true,keyboardTooltip:true,
   overloadKeepsFirstDraft:true,explicitResegmentAfterConfirmation:true,legacyV2ReadAndExplicitV3Reestimate:true,paidCalls:0}));
 }catch(error){exit=1;console.error(error);}
 finally{
  window?.destroy();await server?.close();
  if(path.dirname(fs.realpathSync(profile))===temp)await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  app.exit(exit);
 }
});

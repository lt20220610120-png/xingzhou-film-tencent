const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'xz-156-director-')));

app.whenReady().then(async()=>{
 let server,window,failed=false;
 try{
  const {createServer}=await import('vite');
  server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0,watch:null},logLevel:'warn'});
  await server.listen();
  window=new BrowserWindow({width:1520,height:1000,show:false,webPreferences:{backgroundThrottling:false}});
  await window.loadURL(server.resolvedUrls.local[0]+'scripts/fixtures/director-auto154.html?extendedPace');
  const run=code=>window.webContents.executeJavaScript(code);
  const wait=async code=>{
   for(let i=0;i<150;i++){
    const result=await run(code);
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   throw Error('Timed out: '+code);
  };
  const budget="document.querySelector('.quick-budget-readout')?.innerText";
  const before=await wait(budget);
  await run("document.querySelector('input[aria-label=短剧节奏梯度]').focus()");
  function key(keyCode){window.webContents.sendInputEvent({type:'keyDown',keyCode});window.webContents.sendInputEvent({type:'keyUp',keyCode});}
  key('Home');
  const endpoint=await wait(`${budget}?.includes('30 秒')&&${budget}`);
  assert.match(endpoint,/预计 1 条/);
  for(let i=0;i<30;i++)key('Right');
  const adjusted=await wait(`${budget}?.includes('45 秒')&&${budget}`);
  assert.match(adjusted,/预计 2 条/);
  assert.deepEqual(await run('window.__calls'),[]);
  await run("document.querySelector('.quick-apply-calibration').click()");
  const applied=await wait("JSON.parse(localStorage.getItem('xz-director-calibration:fixture-account:fixture-project'))");
  assert.equal(applied.targetCount,2);
  assert.equal(applied.maxDurationSeconds,30);
  assert.ok(applied.timingScale<1);
  await run("document.querySelector('input[aria-label=短剧节奏梯度]').focus()");
  key('End');
  await wait(`${budget}?.includes('正常')`);
  await run("document.querySelector('.director-batch-launcher > button').click()");
  const panel=await wait("document.querySelector('.director-batch-calibration')?.innerText");
  assert.match(panel,/45 秒 \/ 2 条/);
  assert.match(panel,/最高 30 秒/);
  assert.equal(await run("document.querySelectorAll('.director-batch-panel input[type=range]').length"),0);
  const button=text=>`[...document.querySelectorAll('.director-batch-panel button')].find(b=>b.textContent.includes(${JSON.stringify(text)}))`;
  await run(button('预览整本任务')+'.click()');
  await wait(button('确认开始整本生成')+'?.disabled===false');
  await run(button('确认开始整本生成')+'.click()');
  await wait("window.__quick?.getProjectBatch('fixture-project')?.phase==='completed'");
  const result=await run(`(()=>{const batch=window.__quick.getProjectBatch('fixture-project');
   const scene=window.__quick.getSceneRun('fixture-project','fixture-episode','1-1');
   const cards=[...document.querySelectorAll('.quick-scene-prompts .prompt-card')];
   return {batch:batch.snapshot,plan:scene.plan.editorialBudget,calls:window.__calls,shown:cards.map(c=>c.querySelector('.prompt-duration')?.innerText),saved:window.__persisted.directorProjects[0].episodes[0].prompts.length};
  })()`);
  assert.equal(result.batch.timingScale,applied.timingScale);
  assert.equal(result.batch.pace,applied.pace);
  assert.equal(result.plan.totalEstimatedSeconds,applied.totalEstimatedSeconds);
  assert.equal(result.shown.length,2);
  assert.equal(result.saved,2);
  assert.deepEqual(result.calls,['plan','skill','audit']);
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(root,'output','156-director.png'),(await window.webContents.capturePage()).toPNG());
  const report={before,endpoint,adjusted,applied,panel,...result};
  fs.writeFileSync(path.join(root,'output','156-director-ui.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }catch(error){failed=true;console.error(error);}
 finally{window?.destroy();await server?.close();app.exit(failed?1:0);}
});

const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
 try{for(const width of [1280,1700,2232]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:5837/qa/model-pipeline.html',{waitUntil:'domcontentloaded',timeout:30000});await page.addStyleTag({path:'dist/assets/'+fs.readdirSync('dist/assets').find(n=>n.endsWith('.css'))});
  const panel=page.getByRole('region',{name:'提示词联动美术'});await panel.getByText('等待本场清单分析完成，再由模型读取提示词并分发。',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>qaPipeline.requests.length),0);assert.equal(await page.getByText(/本场清单待补/).count(),0);assert(await panel.getByRole('button',{name:'核实并发布本场提示词',exact:true}).isDisabled());
  await page.locator('main>nav').getByRole('button',{name:'分析 / 继续未完成',exact:true}).click();
  await page.waitForFunction(()=>qaPipeline.saved?.decisions?.p111?.confirmed&&qaPipeline.requests.some(r=>r.label==='2-1-1'));
  const manual=panel.getByRole('button',{name:'AI 重新分发本条',exact:true});await manual.waitFor();assert(await manual.isEnabled());
  const before=await page.evaluate(()=>qaPipeline.requests.filter(r=>r.label==='1-1-1').length);await manual.click();await page.waitForFunction(n=>qaPipeline.requests.filter(r=>r.label==='1-1-1').length>n,before);
  await page.evaluate(()=>qaPipeline.release1());await page.waitForFunction(()=>qaPipeline.saved?.decisions?.p112?.confirmed&&qaPipeline.saved?.decisions?.p121?.confirmed&&!qaPipeline.job.activeEpisodes.includes(1));
  assert(await page.getByRole('button',{name:'自动关联场景',exact:true}).isEnabled());assert(await panel.getByRole('button',{name:'核实并发布本场提示词',exact:true}).isEnabled());assert(await page.getByRole('button',{name:'核实全剧提示词',exact:true}).isDisabled());
  await panel.getByRole('button',{name:'核实并发布本场提示词',exact:true}).click();await page.waitForFunction(()=>Object.values(qaPipeline.saved.versions[qaPipeline.saved.selectedVersionId].reviews||{}).filter(r=>r.published).length===2);
  await page.getByRole('button',{name:'核实并发布本集提示词',exact:true}).click();await page.waitForFunction(()=>Object.values(qaPipeline.saved.versions[qaPipeline.saved.selectedVersionId].reviews||{}).filter(r=>r.published).length===3);
  await page.evaluate(()=>qaPipeline.releaseAll());await page.waitForFunction(()=>qaPipeline.job.status==='completed');
  await page.getByRole('button',{name:'核实全剧提示词',exact:true}).click();const publishAll=page.getByRole('button',{name:'发布全剧已核实提示词（6）',exact:true});await publishAll.waitFor();assert(await publishAll.isEnabled());await publishAll.click();
  await page.waitForFunction(()=>Object.values(qaPipeline.saved.versions[qaPipeline.saved.selectedVersionId].reviews||{}).filter(r=>r.published).length===6);
  assert(await page.evaluate(()=>qaPipeline.maxActive>=3));assert(await page.evaluate(()=>qaPipeline.requests.filter(r=>r.kind==='prompt').every(r=>r.fullPrompt.includes('【基础设定】')&&r.foundation)));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`output/playwright/model-pipeline-2880-${width}.png`,fullPage:true});
  await page.locator('main>nav').getByRole('button',{name:'美术',exact:true}).click();await page.getByRole('button',{name:'查看旺财的对应提示词',exact:true}).first().click();const usage=page.getByRole('dialog',{name:'旺财的对应提示词',exact:true});assert(await usage.locator('[aria-label="对应提示词列表"] span').count()>=3);assert(await usage.locator('[aria-label="所属场景列表"] span').count()>=1);await usage.getByRole('button',{name:'关闭对应提示词',exact:true}).click();
  const layout=await page.evaluate(()=>{const a=document.querySelector('.project-composition-inline').getBoundingClientRect(),b=document.querySelector('.window-model-select').getBoundingClientRect();return {a:{x:a.x,y:a.y,right:a.right},b:{x:b.x,y:b.y}}});assert(layout.a.x<layout.b.x);assert(Math.abs(layout.a.y-layout.b.y)<30,JSON.stringify(layout));
  assert.deepEqual(errors,[]);await page.screenshot({path:`output/playwright/model-pipeline-art-2880-${width}.png`});report.push({width,noCallsBeforeAnalysis:true,concurrentModelRequests:await page.evaluate(()=>qaPipeline.maxActive),manualPromptWhileOtherBusy:true,otherEpisodeAnalysisEnabled:true,scenePublished:2,episodePublished:3,dramaPublished:6,artPromptLinks:true,inlineComposition:true});await page.close();
 }
 fs.writeFileSync('output/playwright/model-pipeline-2880.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

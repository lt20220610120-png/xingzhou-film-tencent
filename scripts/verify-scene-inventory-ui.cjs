const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
 const productionCss='dist/assets/'+fs.readdirSync('dist/assets').find(name=>name.endsWith('.css'));
 const goto=async(page,url)=>{await page.goto(url);await page.addStyleTag({path:productionCss});};
 const url='http://127.0.0.1:5837/qa/';fs.mkdirSync('output/playwright',{recursive:true});
 const finished=page=>page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('qa-binding-data')||'null');return d&&Object.keys(d.sceneDistributionAttempts||{}).length===2&&Object.values(d.sceneDistributionAttempts).every(a=>a.status!=='running');});
 const layout=page=>page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};return {left:rect('.prompt-art-prompt-column'),right:rect('.prompt-art-cards-column'),footer:rect('.art-review-footer'),panel:rect('.prompt-art-panel'),overflow:document.documentElement.scrollWidth>innerWidth};});
 try{
 for(const width of [1280,1700]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await goto(page,url+'prompt-art-binding.html');await finished(page);
  const panel=page.locator('.prompt-art-panel'),audit=panel.locator('.binding-audit-list');
  assert.equal(await page.evaluate(()=>qaBinding.ai),3);
  assert.equal(await audit.locator('.binding-audit-row').count(),2);
  assert.equal(await audit.getByRole('checkbox').count(),0);
  assert.equal(await audit.locator('.binding-audit-group').count(),3);
  assert.equal(await panel.locator('.prompt-art-source pre').evaluate(e=>getComputedStyle(e).color),'rgb(17, 17, 17)');
  await panel.getByRole('button',{name:'场景 1',exact:true}).click();assert.equal(await audit.locator('.binding-audit-row').count(),1);
  await panel.getByRole('button',{name:'全部',exact:true}).click();
  await panel.getByRole('tab',{name:'第 2 条提示词 1-1-2',exact:true}).click();assert.equal(await audit.locator('.binding-audit-row').count(),4);
  const box=await layout(page);assert(Math.abs(box.left.y-box.right.y)<2);assert(Math.abs(box.left.h-box.right.h)<2);assert(box.right.x>=box.left.x+box.left.w);assert(box.footer.y>=box.panel.b);assert.equal(box.overflow,false);
  const heights=await audit.locator('.binding-audit-row').evaluateAll(rows=>rows.map(r=>r.getBoundingClientRect().height));assert(heights.every(h=>h<80),JSON.stringify(heights));
  await page.screenshot({path:`output/playwright/scene-prompt-audit-2877-${width}.png`,fullPage:true});
  const inventory=panel.locator('.scene-inventory-disclosure');await inventory.locator('summary').click();
  assert.equal(await inventory.locator('article').count(),5);
  await inventory.getByRole('button',{name:'取消关联 【积水道路上的面包车-夜-内/外】',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p2.needs.some(n=>n.category==='scene'&&n.locked&&n.visibility==='excluded'));
  assert.equal(await audit.locator('.binding-audit-row').count(),3);
  await panel.getByRole('button',{name:'AI 重新分发本条',exact:true}).click();await page.waitForFunction(()=>qaBinding.ai===4&&Object.values(JSON.parse(localStorage.getItem('qa-binding-data')).sceneDistributionAttempts).every(a=>a.status==='done'));
  assert.equal(await audit.locator('.binding-audit-row').count(),3);
  await page.reload();await finished(page);assert.equal(await page.evaluate(()=>qaBinding.ai),0);
  await page.getByRole('tab',{name:'第 2 条提示词 1-1-2',exact:true}).click();assert.equal(await page.locator('.binding-audit-row').count(),3);
  assert.deepEqual(errors,[]);report.push({width,layout:box,compactMaxHeight:Math.max(...heights),automaticRequests:3,manualSurvivesAI:true,reloadRequests:0});await page.close();
 }
 const missed=await browser.newPage();await goto(missed,url+'prompt-art-binding.html?miss-scene');await finished(missed);
 assert.equal(await missed.getByRole('region',{name:'已关联场景'}).locator('.binding-audit-row').count(),0);
 const inventory=missed.locator('.scene-inventory-disclosure');await inventory.locator('summary').click();await inventory.getByRole('button',{name:'关联本条 【积水道路上的面包车-夜-内/外】',exact:true}).click();
 await missed.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p1.needs.some(n=>n.category==='scene'&&n.locked&&n.manualReference&&n.visibility==='visible'));
 assert.equal(await missed.getByRole('region',{name:'已关联场景'}).locator('.binding-audit-row').count(),1);await missed.close();report.push({missingSceneManuallyAdded:true});
 const fail=await browser.newPage();await goto(fail,url+'prompt-art-binding.html?fail');await finished(fail);assert.equal(await fail.evaluate(()=>qaBinding.ai),6);await fail.reload();await finished(fail);assert.equal(await fail.evaluate(()=>qaBinding.ai),0);await fail.close();report.push({threeAttemptsPerEntry:true,noReloadLoop:true});
 const missing=await browser.newPage();await goto(missing,url+'prompt-art-binding.html?missing');await finished(missing);assert.equal(await missing.getByText(/本场清单待补：手电筒/).count(),1);assert.equal(await missing.evaluate(()=>JSON.parse(localStorage.getItem('qa-binding-data')).snapshot.cards.length),5);await missing.close();
 const parent=await browser.newPage({viewport:{width:1700,height:1000}});await goto(parent,url+'prompt-distribution-2872.html');await finished(parent);
 await parent.getByRole('button',{name:'返回场景清单',exact:true}).click();assert.equal(await parent.locator('.prompt-art-panel:visible').count(),0);assert.equal(await parent.getByText('剧本原文',{exact:true}).count(),1);
 const card=parent.locator('.art-review-item').filter({has:parent.getByRole('button',{name:'关联客厅的提示词',exact:true})});assert.match(await card.innerText(),/提示词 1、2/);
 await parent.getByRole('button',{name:'关联客厅的提示词',exact:true}).click();
 const dialog=parent.getByRole('dialog',{name:'客厅 · 关联提示词',exact:true});await dialog.getByRole('checkbox',{name:'1-1-2',exact:true}).uncheck();await dialog.getByRole('button',{name:'保存提示词关联',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.match(await card.innerText(),/提示词 1/);assert(!((await card.innerText()).includes('1、2')));
 await parent.screenshot({path:'output/playwright/scene-prompt-links-2877.png',fullPage:true});
 await parent.getByRole('button',{name:'按提示词分发',exact:true}).click();await parent.getByRole('tab',{name:'第 2 条提示词 1-1-2',exact:true}).click();assert.equal(await parent.getByRole('region',{name:'已关联场景'}).locator('.binding-audit-row').count(),0);
 assert.equal(await parent.evaluate(()=>qaBinding.ai),3);report.push({defaultPromptView:true,sceneLinksShowAI:true,sceneManualUpdatesPrompt:true,noRemountRequests:true});await parent.close();
 // A reply arriving after a manual scene assignment must not erase it.
 const slow=await browser.newPage();await goto(slow,url+'prompt-distribution-2872.html?slow');await slow.waitForFunction(()=>Boolean(qaBinding.release));await slow.getByRole('button',{name:'返回场景清单',exact:true}).click();
 await slow.getByRole('button',{name:'关联客厅的提示词',exact:true}).click();const sd=slow.getByRole('dialog',{name:'客厅 · 关联提示词',exact:true});await sd.getByRole('checkbox',{name:'1-1-1',exact:true}).check();await sd.getByRole('checkbox',{name:'1-1-2',exact:true}).uncheck();await sd.getByRole('button',{name:'保存提示词关联',exact:true}).click();await sd.waitFor({state:'hidden'});
 await slow.evaluate(()=>{qaBinding.release();});await slow.waitForFunction(()=>qaBinding.ai===2);await slow.evaluate(()=>qaBinding.release());await slow.waitForFunction(()=>qaBinding.ai===3);await slow.evaluate(()=>qaBinding.release());await slow.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('qa-binding-data')).sceneDistributionAttempts).filter(a=>a.status==='failed').length===1);
 assert.equal(await slow.evaluate(()=>JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p1.needs.find(n=>n.category==='scene').locked),true);await slow.close();report.push({lateReplyPreservesManualAssignment:true});
 fs.writeFileSync('output/playwright/ui-2877.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

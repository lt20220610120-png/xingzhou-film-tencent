const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
 const url='http://127.0.0.1:5837/qa/';
 const finished=page=>page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('qa-binding-data')||'null');return d&&Object.keys(d.sceneDistributionAttempts||{}).length===2&&Object.values(d.sceneDistributionAttempts).every(a=>a.status!=='running');});
 try{
 for(const width of [1280,1700]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'prompt-art-binding.html');await finished(page);
  const panel=page.locator('.prompt-art-panel');await panel.getByRole('button',{name:'AI 重新分发本条',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>qaBinding.ai),3);
  assert.equal(await panel.locator('.scene-inventory-cards article').count(),5);
  assert.equal(await panel.getByRole('checkbox',{name:'【积水道路上的面包车-夜-内/外】本条使用',exact:true}).isChecked(),true);
  assert.equal(await panel.locator('.prompt-art-source pre').evaluate(e=>getComputedStyle(e).color),'rgb(17, 17, 17)');
  await panel.getByRole('button',{name:'场景 1',exact:true}).click();assert.equal(await panel.locator('.scene-inventory-cards article').count(),1);
  await panel.getByRole('checkbox',{name:'【积水道路上的面包车-夜-内/外】本条使用',exact:true}).uncheck();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p1.needs.some(n=>n.category==='scene'&&n.locked&&n.visibility==='excluded'));
  await panel.getByRole('button',{name:'AI 重新分发本条',exact:true}).click();
  await page.waitForFunction(()=>qaBinding.ai===4&&Object.values(JSON.parse(localStorage.getItem('qa-binding-data')).sceneDistributionAttempts).every(a=>a.status==='done'));
  assert.equal(await panel.getByRole('checkbox',{name:'【积水道路上的面包车-夜-内/外】本条使用',exact:true}).isChecked(),false);
  await panel.getByRole('button',{name:'关联提示词',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'关联提示词'});await dialog.getByRole('checkbox',{name:'1-1-1',exact:true}).check();await dialog.getByRole('checkbox',{name:'1-1-2',exact:true}).uncheck();await dialog.getByRole('button',{name:'保存关联'}).click();await dialog.waitFor({state:'hidden'});
  await panel.getByRole('tab',{name:'第 2 条提示词 1-1-2',exact:true}).click();assert.equal(await panel.getByRole('checkbox',{name:'【积水道路上的面包车-夜-内/外】本条使用',exact:true}).isChecked(),false);
  const layout=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};return {left:rect('.prompt-art-prompt-column'),right:rect('.prompt-art-cards-column'),footer:rect('.art-review-footer'),panel:rect('.prompt-art-panel'),overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(Math.abs(layout.left.y-layout.right.y)<2);assert(Math.abs(layout.left.h-layout.right.h)<2);assert(layout.right.x>=layout.left.x+layout.left.w);assert(layout.footer.y>=layout.panel.b);assert.equal(layout.overflow,false);
  await panel.getByRole('button',{name:'全部',exact:true}).click();await page.screenshot({path:`output/scene-inventory-2876-${width}.png`,fullPage:true});
  await page.reload();await page.getByRole('checkbox',{name:'【积水道路上的面包车-夜-内/外】本条使用',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>qaBinding.ai),0);assert.equal(await page.getByRole('checkbox',{name:'【积水道路上的面包车-夜-内/外】本条使用',exact:true}).isChecked(),true);
  assert.deepEqual(errors,[]);report.push({width,layout,automaticRequests:3,manualSurvivesAI:true,reloadRequests:0});await page.close();
 }
 const missed=await browser.newPage();await missed.goto(url+'prompt-art-binding.html?miss-scene');await finished(missed);
 await missed.getByRole('button',{name:'场景 1',exact:true}).click();const room=missed.getByRole('checkbox',{name:'【积水道路上的面包车-夜-内/外】本条使用',exact:true});assert.equal(await room.isChecked(),false);await room.check();
 await missed.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p1.needs.some(n=>n.category==='scene'&&n.locked&&n.manualReference&&n.visibility==='visible'));await missed.close();report.push({missingSceneManuallyAdded:true});
 const fail=await browser.newPage();await fail.goto(url+'prompt-art-binding.html?fail');await finished(fail);assert.equal(await fail.evaluate(()=>qaBinding.ai),6);await fail.reload();await finished(fail);assert.equal(await fail.evaluate(()=>qaBinding.ai),0);await fail.close();report.push({threeAttemptsPerEntry:true,noReloadLoop:true});
 const missing=await browser.newPage();await missing.goto(url+'prompt-art-binding.html?missing');await finished(missing);
 assert.equal(await missing.getByText(/本场清单待补：手电筒/).count(),1);assert.equal(await missing.evaluate(()=>JSON.parse(localStorage.getItem('qa-binding-data')).snapshot.cards.length),5);await missing.close();
 const parent=await browser.newPage({viewport:{width:1700,height:1000}});await parent.goto(url+'prompt-distribution-2872.html');await finished(parent);
 await parent.getByRole('button',{name:'返回场景清单',exact:true}).click();assert.equal(await parent.locator('.prompt-art-panel').count(),0);assert.equal(await parent.getByText('剧本原文',{exact:true}).count(),1);
 await parent.getByRole('button',{name:'按提示词分发',exact:true}).click();await parent.locator('.prompt-art-panel').waitFor();assert.equal(await parent.evaluate(()=>qaBinding.ai),3);report.push({defaultPromptView:true,backToScene:true,noRemountRequests:true});await parent.close();
 const slow=await browser.newPage();await slow.goto(url+'prompt-distribution-2872.html?slow');await slow.waitForFunction(()=>Boolean(qaBinding.release));
 await slow.getByRole('button',{name:'返回场景清单',exact:true}).click();await slow.evaluate(()=>qaBinding.release());await slow.getByRole('button',{name:'按提示词分发',exact:true}).click();
 await slow.waitForFunction(()=>qaBinding.ai===2);assert.equal(await slow.evaluate(()=>Boolean(JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p1)),false);await slow.close();report.push({lateUnmountReplyDiscarded:true});
 fs.writeFileSync('output/ui-2876.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

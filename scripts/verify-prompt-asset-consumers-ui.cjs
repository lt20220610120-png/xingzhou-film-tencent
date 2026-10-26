const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];fs.mkdirSync('output/playwright',{recursive:true});
 try{
 for(const width of [1120,1280,1700,2232]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:5837/qa/prompt-asset-consumers.html',{waitUntil:'domcontentloaded',timeout:30000});await page.addStyleTag({path:'dist/assets/'+fs.readdirSync('dist/assets').find(n=>n.endsWith('.css'))});
  await page.getByRole('button',{name:'返回场景清单',exact:true}).click();
  await page.getByRole('button',{name:'关联李大川-日常服的提示词',exact:true}).waitFor();
  const cards=page.locator('.art-review-inventory .art-review-item');assert.equal(await cards.count(),11);
  const sizes=await cards.evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect(),b=row.querySelector('b');return {height:r.height,width:r.width,nameHeight:b.getBoundingClientRect().height,nowrap:getComputedStyle(b).whiteSpace,overflow:row.scrollWidth>row.clientWidth};}));
  assert(sizes.every(s=>s.height===84&&s.nowrap==='nowrap'&&!s.overflow),JSON.stringify(sizes));
  const link=page.getByRole('button',{name:'关联李大川-日常服的提示词',exact:true});assert.match(await link.innerText(),/提示词 1、2 \+4/);assert(!((await link.innerText()).includes('3、4')));
  await link.click();const dialog=page.getByRole('dialog',{name:'李大川-日常服 · 关联提示词',exact:true});assert.equal(await dialog.getByRole('checkbox').count(),6);await dialog.getByRole('button',{name:'取消',exact:true}).click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`output/playwright/review-uniform-2878-${width}.png`,fullPage:true});
  const nav=page.locator('main>nav');await nav.getByRole('button',{name:'美术',exact:true}).click();
  await page.getByRole('button',{name:'查看李大川的对应提示词',exact:true}).click();const usage=page.getByRole('dialog',{name:'李大川的对应提示词',exact:true});assert.equal(await usage.locator('[aria-label="对应提示词列表"]>span').count(),6);await usage.getByRole('button',{name:'关闭对应提示词',exact:true}).click();
  await nav.getByRole('button',{name:'分镜',exact:true}).click();await page.locator('.collab-episode-card').first().click();
  const shots=page.locator('.collab-shot-card'),first=shots.nth(0),second=shots.nth(1);await first.locator('.generation-references figure').nth(10).waitFor();
  assert.equal(await first.locator('.generation-references figure').count(),11);assert.equal(await second.locator('.generation-references figure').count(),3);
  await first.getByRole('button',{name:'保存分镜',exact:true}).click();await page.waitForFunction(()=>qaConsumers.saves.length>=1);
  assert.equal(await page.evaluate(()=>qaConsumers.saves[0].updates.content===qaConsumers.source[0]),true);
  assert.equal(await first.locator('.generation-references figure').count(),11);assert.match(await first.getByLabel('提示词',{exact:true}).inputValue(),/@image1/);
  await first.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaConsumers.submits.length===1);
  assert.equal(await page.evaluate(()=>qaConsumers.submits[0].references.length),11);assert.equal(await page.evaluate(()=>qaConsumers.submits[0].bindingSourcePromptId),'p1');
  await second.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaConsumers.submits.length===2);
  assert.deepEqual(await page.evaluate(()=>qaConsumers.submits[1].references.map(r=>r.assetId)),['a','s','i']);
  assert.equal(await page.evaluate(()=>qaConsumers.saves.every(s=>s.updates.content===qaConsumers.source[Number(s.shotId.slice(1))-1])),true);
  assert.equal(await page.evaluate(()=>qaConsumers.ai),0);assert.deepEqual(errors,[]);await second.scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/storyboard-prompt-2878-${width}.png`});
  report.push({width,uniformHeight:84,minCardWidth:Math.min(...sizes.map(s=>s.width)),twoNumberPreview:true,artPromptCount:6,firstImages:11,secondImages:3,sourceUnchanged:true,aiRequests:0});await page.close();
 }
 fs.writeFileSync('output/playwright/prompt-consumers-2878.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

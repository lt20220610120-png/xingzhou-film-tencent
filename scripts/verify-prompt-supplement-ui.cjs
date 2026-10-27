const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
try{for(const width of [1280,1700,2232]){
 const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
 await page.goto('http://127.0.0.1:5837/qa/model-pipeline.html?supplement=1');await page.addStyleTag({path:'dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css'))});
 await page.locator('main>nav').getByRole('button',{name:'分析 / 继续未完成',exact:true}).click();
 const panel=page.locator('.art-review-prompt-missing-batch');await panel.getByText('全剧 6 项未确认',{exact:true}).waitFor();await page.waitForFunction(()=>qaPipeline.job?.status==='completed');
 await panel.locator('summary').click();assert(await panel.getByRole('button',{name:'一键补充勾选项',exact:true}).isDisabled());
 await page.screenshot({path:`output/playwright/prompt-supplement-2885-before-${width}.png`,fullPage:true});
 await panel.locator('article').filter({hasText:'1-1-1'}).getByRole('button',{name:'一键补充',exact:true}).click();
 await panel.getByText('全剧 4 项未确认',{exact:true}).waitFor();await page.waitForFunction(()=>qaPipeline.requests.filter(r=>r.kind==='prompt'&&r.label==='1-1-2').length===2);
 const first=await page.evaluate(()=>({roster:qaPipeline.ledger.episodes[1].roster.filter(i=>i.name==='【门把-大门】').length,scene:qaPipeline.ledger.episodes[1].scenes[0].items.filter(i=>i.name==='【门把-大门】').length,requests:qaPipeline.requests.filter(r=>r.kind==='supplement').length,published:qaPipeline.publications.length}));
 assert.deepEqual(first,{roster:1,scene:1,requests:1,published:0});
 await panel.getByRole('checkbox',{name:'选择 1-2-1 门把',exact:true}).check();await panel.getByRole('checkbox',{name:'选择 2-1-1 门把',exact:true}).check();
 await panel.getByRole('button',{name:'一键补充勾选项',exact:true}).click();await panel.getByText('全剧 1 项未确认',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>qaPipeline.ledger.episodes[1].roster.filter(i=>i.name==='【门把-大门】').length),1);
 assert.equal(await page.evaluate(()=>qaPipeline.requests.filter(r=>r.kind==='supplement').length),3);
 await panel.getByRole('button',{name:'一键补充',exact:true}).click();await panel.waitFor({state:'detached'});
 await page.getByRole('button',{name:'核实全剧提示词',exact:true}).click();const publish=page.getByRole('button',{name:'发布全剧已核实提示词（6）',exact:true});await publish.waitFor();await publish.click();
 await page.waitForFunction(()=>qaPipeline.assets.some(a=>a.name==='【门把-大门】'));
 await page.locator('main>nav').getByRole('button',{name:'美术',exact:true}).click();await page.getByText('门把',{exact:true}).first().waitFor();
 assert.equal(await page.evaluate(()=>qaPipeline.assets.filter(a=>a.name==='【门把-大门】').length),1);assert(await page.getByText('对应提示词',{exact:true}).count()>0);assert.deepEqual(errors,[]);
 await page.screenshot({path:`output/playwright/prompt-supplement-2885-art-${width}.png`,fullPage:true});
 report.push({width,single:true,selectedCrossScene:true,episodeDedup:true,unselectedRetained:true,noAutomaticPublication:true,artAssetAfterReview:true,maxConcurrent:await page.evaluate(()=>qaPipeline.maxActive)});await page.close();
}fs.writeFileSync('output/playwright/prompt-supplement-2885.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
 try{for(const width of [1280,1700,2232]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:5837/qa/model-pipeline.html?missing=1');
  await page.addStyleTag({path:'dist/assets/'+fs.readdirSync('dist/assets').find(f=>f.endsWith('.css'))});
  await page.locator('main>nav').getByRole('button',{name:'分析 / 继续未完成',exact:true}).click();
  await page.waitForFunction(()=>qaPipeline.job?.status==='completed'&&Object.keys(qaPipeline.saved?.decisions||{}).length===6);
  const batch=page.locator('.art-review-prompt-missing-batch');await batch.getByText('全剧 6 项未确认',{exact:true}).waitFor();
  assert.equal(await batch.getAttribute('open'),null);assert.equal(await batch.locator('article').count(),6);assert.equal(await batch.locator('article').first().isVisible(),false);
  const line=await page.locator('.scene-missing-assets').evaluate(e=>{const a=e.querySelector('b').getBoundingClientRect(),buttons=[...e.querySelectorAll('button')].map(b=>b.getBoundingClientRect());return {nameY:a.y+a.height/2,buttonY:buttons.map(b=>b.y+b.height/2),nameRight:a.right,buttonX:buttons[0].x}});
  assert(line.buttonY.every(y=>Math.abs(y-line.nameY)<3),JSON.stringify(line));assert(line.buttonX>=line.nameRight);
  await batch.locator('summary').click();assert(await batch.locator('article').first().isVisible());
  await page.screenshot({path:`output/playwright/prompt-missing-2884-expanded-${width}.png`,fullPage:true});
  await batch.locator('summary').click();assert.equal(await batch.locator('article').first().isVisible(),false);await batch.locator('summary').click();
  await batch.getByRole('checkbox',{name:'选择 1-1-1 门把',exact:true}).check();
  await batch.getByRole('button',{name:'一键确认所选无需参考图',exact:true}).click();await batch.getByText('全剧 5 项未确认',{exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'核实本场全部提示词',exact:true}).isDisabled());
  await page.getByRole('combobox',{name:'核实分集',exact:true}).selectOption('2');await batch.getByText('全剧 5 项未确认',{exact:true}).waitFor();
  const target=batch.locator('article').filter({hasText:'1-1-2'});await target.getByRole('button',{name:'返回场景补充',exact:true}).click();
  assert.equal(await page.getByRole('combobox',{name:'核实分集',exact:true}).inputValue(),'1');assert(await page.getByRole('region',{name:'场景 1-1 核实',exact:true}).isVisible());
  // The global panel remains usable from scene mode, and one save resolves all
  // remaining targets including the other episode, without publishing.
  const before=await page.evaluate(()=>qaPipeline.saved.revision);
  await batch.getByRole('button',{name:'一键确认全部无需参考图',exact:true}).click();await batch.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>qaPipeline.saved.revision),before+1);
  assert.equal(await page.evaluate(()=>qaPipeline.publications.length),0);
  await page.getByRole('button',{name:'按提示词分发',exact:true}).click();assert(await page.getByRole('button',{name:'核实本场全部提示词',exact:true}).isEnabled());
  await page.getByRole('button',{name:'核实全剧提示词',exact:true}).click();await page.getByRole('button',{name:'发布全剧已核实提示词（6）',exact:true}).waitFor();
  assert.deepEqual(errors,[]);fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:`output/playwright/prompt-missing-2884-${width}.png`,fullPage:true});report.push({width,globalPending:6,collapsedByDefault:true,selectedOnly:true,crossEpisodeReturn:true,atomicAll:true,publishUnaffected:true,inlineButtons:line});await page.close();
 }console.log(JSON.stringify({passed:true,report}));fs.writeFileSync('output/playwright/prompt-missing-2884.json',JSON.stringify({passed:true,report},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

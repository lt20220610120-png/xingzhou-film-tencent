const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
 try{for(const width of [1280,1700]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:5837/qa/imported-art-binding.html');
  await page.addStyleTag({path:'dist/assets/'+fs.readdirSync('dist/assets').find(name=>name.endsWith('.css'))});
  await page.getByRole('button',{name:'上传提示词并先关联图片',exact:true}).click();
  await page.getByRole('button',{name:'导入整部素材文件夹',exact:true}).click();
  const panel=page.getByRole('region',{name:'提示词与图片独立关联'});
  await panel.locator('.imported-art-identity>summary').click();await panel.getByRole('button',{name:'确认本场素材身份',exact:true}).click();
  await panel.getByRole('button',{name:'AI重新读取并分发本条',exact:true}).click();await panel.getByText(/已关联 1 条，待检查 0 条/).waitFor();
  const audit=panel.locator('.binding-audit-list');assert.equal(await audit.locator('.binding-audit-row').count(),2);assert.equal(await audit.getByRole('checkbox').count(),0);
  assert.equal(await panel.getByLabel('关联原提示词').evaluate(e=>getComputedStyle(e).color),'rgb(17, 17, 17)');
  await panel.locator('.imported-art-identity>summary').click();
  const box=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,h:r.height,w:r.width,b:r.bottom};};return {left:rect('.imported-binding-prompt-column'),right:rect('.imported-binding-cards-column'),overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(Math.abs(box.left.y-box.right.y)<2);assert(Math.abs(box.left.h-box.right.h)<2);assert(box.right.x>=box.left.x+box.left.w);assert(!box.overflow);
  await panel.screenshot({path:`output/playwright/imported-audit-2877-${width}.png`});
  await panel.getByRole('tab',{name:'第 2 条提示词 1-1-2',exact:true}).click();await panel.getByRole('button',{name:'AI重新读取并分发本条',exact:true}).click();await page.waitForFunction(()=>{const b=JSON.parse(localStorage.getItem('qa-import-binding-state')).generationWorkflow.books[0];return Object.keys(b.importedBinding.decisions).length===2;});
  assert.equal(await audit.locator('.binding-audit-row').count(),4);
  await panel.locator('.scene-inventory-disclosure>summary').click();await panel.getByRole('button',{name:'取消关联 张三-杯子',exact:true}).click();assert.equal(await audit.locator('.binding-audit-row').count(),3);
  await panel.getByRole('button',{name:'关联本条 张三-杯子',exact:true}).click();assert.equal(await audit.locator('.binding-audit-row').count(),4);
  await panel.getByRole('button',{name:'保存本条分发',exact:true}).click();await panel.getByRole('button',{name:/进入图视生成/}).click();await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaImported.submits.length===1);
  assert.deepEqual(await page.evaluate(()=>qaImported.submits[0].references.map(r=>r.id)),['a','b','room','cup']);
  assert.deepEqual(errors,[]);report.push({width,layout:box,sharedAudit:true,manualInventoryAssociation:true,submittedExactPromptSubset:true});await page.close();
 }
 fs.writeFileSync('output/playwright/imported-audit-2877.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

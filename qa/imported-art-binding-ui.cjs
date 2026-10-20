const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),results=[];
 try{
  for(const width of [1280,1700]){
   const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
   await page.goto('http://127.0.0.1:5835/qa/imported-art-binding.html');
   await page.getByRole('button',{name:'上传提示词并先关联图片',exact:true}).click();
   await page.getByRole('button',{name:'导入整部素材文件夹',exact:true}).click();
   const panel=page.getByRole('region',{name:'提示词与图片独立关联'});
   if(width===1700)await panel.getByRole('checkbox').check();
   await panel.getByRole('button',{name:'AI 整理本场素材身份',exact:true}).click();
   await page.waitForFunction(()=>qaImported.ai===1);
   await panel.getByRole('button',{name:'确认本场素材身份',exact:true}).click();
   await panel.getByRole('button',{name:'AI 逐条关联整本',exact:true}).click();
   await panel.getByRole('status').filter({hasText:'已关联 2 条，待检查 1 条'}).waitFor();
   assert.equal(await page.evaluate(()=>qaImported.ai),4);
   assert.equal(await page.evaluate(()=>qaImported.vision),width===1700?2:0);
   assert.equal(await panel.getByLabel('张三关联图片').inputValue(),'a');
   await panel.getByRole('button',{name:'确认本条关联',exact:true}).click();
   await panel.getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   await page.getByRole('button',{name:'1-1-2',exact:true}).click();
   assert.equal(await panel.getByLabel('张三-杯子关联图片').inputValue(),'cup');
   await panel.getByRole('button',{name:'确认本条关联',exact:true}).click();
   await panel.getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   await panel.screenshot({path:`../../output/imported-art-review-${width}.png`});
   await page.reload();await page.getByRole('region',{name:'提示词与图片独立关联'}).getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   await page.getByRole('button',{name:'进入图视生成（2/3 条就绪）',exact:true}).click();
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaImported.submits.length===1);
   assert.deepEqual(await page.evaluate(()=>qaImported.submits[0].references.map(ref=>ref.id)),['a','b','room','cup']);
   await page.getByRole('button',{name:'1-1-1',exact:true}).click();
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaImported.submits.length===2);
   assert.deepEqual(await page.evaluate(()=>qaImported.submits[1].references.map(ref=>ref.id)),['a','room']);
   await page.locator('.prompt-book-workspace').screenshot({path:`../../output/imported-art-generation-${width}.png`});
   await page.getByLabel('提示词集数').selectOption('2');
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.getByRole('alert').filter({hasText:/重新核对|未确认/}).waitFor();
   assert.equal(await page.evaluate(()=>qaImported.submits.length),2);
   await page.getByLabel('提示词集数').selectOption('1');
   await page.getByRole('button',{name:'返回独立关联',exact:true}).click();
   await panel.getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-import-binding-record')).enabled),false);
   await panel.getByLabel('关联原提示词').evaluate(element=>element.closest('details').open=true);
   await panel.getByLabel('关联原提示词').fill('【基础信息】\n人物：张三\n场景：客厅\n道具：无\n【镜头】\n张三抬手。');
   await panel.getByRole('button',{name:'确认本条关联',exact:true}).click();
   await panel.getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   await panel.getByRole('button',{name:'进入图视生成（2/3 条就绪）',exact:true}).click();
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaImported.submits.length===3);
   assert.match(await page.evaluate(()=>qaImported.submits[2].prompt),/张三抬手/);
   await page.getByRole('button',{name:'切换测试账号',exact:true}).click();assert.equal(await page.getByLabel('提示词集数').count(),0);
   assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   results.push({width,restored:true,finiteRepair:true,pendingRetained:true,exactReferences:true,accountIsolation:true,errors});await page.close();
  }
  fs.writeFileSync('../../output/imported-art-ui-verification.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

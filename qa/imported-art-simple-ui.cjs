const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),results=[];
 try{
  for(const width of [1280,1700,2232]){
   const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
   await page.goto('http://127.0.0.1:5835/qa/imported-art-binding.html');
   await page.getByRole('button',{name:'上传提示词并先关联图片',exact:true}).click();
   await page.getByRole('button',{name:'导入整部素材文件夹',exact:true}).click();
   const panel=page.getByRole('region',{name:'提示词与图片独立关联'});
   assert.equal(await panel.locator('input[aria-label$="名称"]:visible').count(),0);
   assert((await panel.boundingBox()).height<650);
   await panel.getByRole('button',{name:'返回原编辑模式',exact:true}).click();
   await page.getByLabel('提示词',{exact:true}).waitFor();
   assert.equal(await panel.count(),0);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-import-binding-state')).generationWorkflow.books[0].sceneMedia['1-1'].length),5);
   await page.reload();await page.getByLabel('提示词',{exact:true}).waitFor();
   await page.getByRole('button',{name:'返回独立关联',exact:true}).click();
   await panel.locator('summary').filter({hasText:'查看本条详情'}).click();
   await panel.locator('summary').filter({hasText:'张图片的身份'}).click();
   const colors=await panel.getByLabel('a名称').evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
   const a=luminance(colors.color),b=luminance(colors.background),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   assert(contrast>=4.5,JSON.stringify({colors,contrast}));
   await panel.screenshot({path:`../../output/imported-art-readable-${width}.png`});
   await panel.locator('summary').filter({hasText:'查看本条详情'}).click();
   await panel.screenshot({path:`../../output/imported-art-simple-${width}.png`});
   await panel.getByRole('button',{name:'AI 自动整理整本',exact:true}).click();
   await page.getByText('AI 关联结果：2 条就绪，1 条待处理',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>qaImported.ai),4);
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaImported.submits.length===1);
   assert.deepEqual(await page.evaluate(()=>qaImported.submits[0].references.map(ref=>ref.id)),['a','room']);
   await page.getByRole('button',{name:'1-1-2',exact:true}).click();
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaImported.submits.length===2);
   assert.deepEqual(await page.evaluate(()=>qaImported.submits[1].references.map(ref=>ref.id)),['a','b','room','cup']);
   await page.getByRole('button',{name:'查看待处理项',exact:true}).click();
   await panel.getByRole('button',{name:'只看待处理（1）',exact:true}).click();
   const issues=panel.getByRole('generic',{name:'待处理关联'}); // use DOM region below for browser compatibility
   assert.equal(await panel.locator('.imported-binding-issues button').count(),1);
   await panel.locator('.imported-binding-issues button').click();
   assert.equal(await page.getByLabel('提示词集数').inputValue(),'2');
   await panel.getByRole('button',{name:'返回原编辑模式',exact:true}).click();await page.getByLabel('提示词',{exact:true}).waitFor();
   await page.getByLabel('提示词集数').selectOption('1');
   await page.getByRole('button',{name:'返回独立关联',exact:true}).click();
   await page.evaluate(()=>qaImported.hold=true);
   // Force one stale entry to exercise exit while a real asynchronous call is pending.
   await panel.locator('summary').filter({hasText:'查看本条详情'}).click();
   await panel.locator('summary').filter({hasText:'查看或修正'}).click();
   const source=panel.getByLabel('关联原提示词');await source.fill((await source.inputValue())+'\n新动作');
   await panel.getByRole('button',{name:'AI 自动整理整本',exact:true}).click();
   await page.waitForFunction(()=>!!qaImported.release);
   await panel.getByRole('button',{name:'返回原编辑模式',exact:true}).click();await page.getByLabel('提示词',{exact:true}).waitFor();
   await page.evaluate(()=>{qaImported.hold=false;qaImported.release();});
   await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-import-binding-state')).generationWorkflow.books[0].importedBinding.stage),'manual');
   assert.equal(await panel.count(),0);assert.deepEqual(errors,[]);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   results.push({width,contrast,compact:true,exitPreserves:true,autoReady:2,pending:1,lateResponseIgnored:true,errors});
   await page.close();
  }
  fs.writeFileSync('../../output/imported-art-simple-ui.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

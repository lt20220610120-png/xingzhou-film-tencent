const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
 const results=[];
 try{
  for(const width of [1280,1700]){
   const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
   await page.goto('http://127.0.0.1:5834/qa/prompt-art-binding.html');
   const panel=page.getByRole('region',{name:'提示词联动美术'});
   await panel.getByLabel('素材整理模式').selectOption('linked');
   await panel.getByRole('button',{name:'确认本条关联',exact:true}).click();
   await panel.getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   assert.equal(await panel.getByLabel('张三关联卡片').inputValue(),await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-binding-data')).snapshot.cards.find(card=>card.category==='character'&&card.name.includes('张三')).uid));
   await panel.getByLabel('联动提示词').selectOption('p2');
   await panel.getByRole('button',{name:'AI 核对本条',exact:true}).click();
   await page.waitForFunction(()=>qaBinding.ai===2&&JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p2?.origin==='ai');
   await panel.getByRole('button',{name:'确认本条关联',exact:true}).click();
   await panel.getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   await panel.screenshot({path:`output/prompt-art-review-${width}.png`});
   await page.reload();await page.getByRole('region',{name:'提示词联动美术'}).getByRole('button',{name:'本条关联已确认',exact:true}).waitFor();
   await page.getByRole('button',{name:'图视生成',exact:true}).click();
   await page.getByRole('button',{name:'从联动美术项目载入'}).click();await page.getByRole('button',{name:'载入已确认关联'}).click();
   await page.getByText('已载入 2 条，其中 2 条关联和图片就绪；其余条目保留待核对。',{exact:true}).waitFor();
   await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaBinding.submits.length===1).catch(async problem=>{throw Error(problem.message+' '+JSON.stringify(await page.getByRole('alert').allTextContents())+' '+JSON.stringify(errors));});
   assert.deepEqual(await page.evaluate(()=>qaBinding.submits[0].references.map(ref=>ref.assetId)),['a','room']);
   await page.getByRole('button',{name:'1-1-2',exact:true}).click();await page.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>qaBinding.submits.length===2);
   assert.deepEqual(await page.evaluate(()=>qaBinding.submits[1].references.map(ref=>ref.assetId)),['a','b','room','cup']);
   await page.locator('.prompt-book-workspace').screenshot({path:`output/prompt-art-generation-${width}.png`});
   await page.getByRole('button',{name:'1-1-1',exact:true}).click();await page.getByRole('button',{name:'模拟导演改词',exact:true}).click();await page.getByRole('button',{name:'生成视频',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'来源或素材已更新'}).waitFor();assert.equal(await page.evaluate(()=>qaBinding.submits.length),2);
   assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   results.push({width,restored:true,finiteAiRepair:true,exactSubmittedAssets:true,staleBlocked:true,errors});await page.close();
  }
  fs.writeFileSync('output/prompt-art-ui-verification.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

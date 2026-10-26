const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});const report=[];
 try{
 for(const width of [1280,1700]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5837/qa/prompt-art-binding.html');
 const panel=page.locator('.prompt-art-panel');await panel.getByRole('button',{name:'AI 重新分发本条',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-binding-data')||'null')?.decisions?.p1?.confirmed);
 assert.equal(await page.evaluate(()=>qaBinding.ai),2);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p1.needs.map(n=>n.text)),['张三','客厅']);
 assert.equal(await panel.getByRole('button',{name:'确认本条关联',exact:true}).count(),0);
 await panel.getByRole('tab',{name:'第 2 条提示词 1-1-2',exact:true}).click();
 await panel.getByRole('button',{name:'AI 重新分发本条',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('qa-binding-data')).decisions.p2?.confirmed);
 await panel.getByRole('button',{name:'道具 2',exact:true}).click();assert.equal(await panel.locator('.prompt-art-needs article').count(),1);
 const layout=await page.evaluate(()=>{
 const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
 return {left:rect('.prompt-art-prompt-column'),right:rect('.prompt-art-cards-column'),footer:rect('.art-review-footer'),panel:rect('.prompt-art-panel'),overflow:document.documentElement.scrollWidth>innerWidth};
 });
 assert(Math.abs(layout.left.y-layout.right.y)<2);assert(Math.abs(layout.left.h-layout.right.h)<2);assert(layout.right.x>=layout.left.x+layout.left.w);assert(layout.footer.y>=layout.panel.b);assert.equal(layout.overflow,false);
 await page.screenshot({path:`output/review-2875-${width}.png`,fullPage:true});
 await page.reload();await page.getByRole('region',{name:'提示词联动美术'}).waitFor();assert.equal(await page.locator('.prompt-art-needs article').count(),2);
 assert.deepEqual(errors,[]);report.push({width,linked:layout,errors});await page.close();
 }
 const missingPage=await browser.newPage({viewport:{width:1280,height:1000}});
 await missingPage.goto('http://127.0.0.1:5837/qa/prompt-art-binding.html?missing');
 await missingPage.getByRole('button',{name:'AI 重新分发本条',exact:true}).click();
 await missingPage.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('qa-binding-data')||'null');return qaBinding.reconciled&&d?.decisions?.p1?.confirmed;});
 const repaired=await missingPage.evaluate(()=>{const d=JSON.parse(localStorage.getItem('qa-binding-data'));const n=d.decisions.p1.needs.find(n=>n.text==='手电筒');return {card:d.snapshot.cards.find(c=>c.uid===n.cardUid),ai:qaBinding.ai};});
 assert.equal(repaired.card.name,'【手电筒】');assert.deepEqual(repaired.card.publishedSceneIds,[]);assert.equal(repaired.ai,3);await missingPage.close();report.push({reconciled:true,notPublished:true});
 const page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5837/qa/imported-art-binding.html');
 await page.getByRole('button',{name:'上传提示词并先关联图片',exact:true}).click();
 await page.getByRole('button',{name:'导入本集文件夹',exact:true}).click();
 await page.getByRole('button',{name:/AI 分发当前条目/}).click();
 await page.getByRole('button',{name:/返回独立关联/}).waitFor();
 // Current workflow can switch to generation after successful automatic processing. Reopen binding details.
 if(!await page.locator('.imported-art-panel').count())await page.getByRole('button',{name:/返回独立关联/}).click();
 await page.locator('.imported-art-panel > details > summary').click();
 await page.locator('.imported-binding-workspace').waitFor();
 for(const width of [1280,1700]){
 await page.setViewportSize({width,height:1000});
 const layout=await page.evaluate(()=>{const a=document.querySelector('.imported-binding-prompt-column').getBoundingClientRect(),b=document.querySelector('.imported-binding-cards-column').getBoundingClientRect();return {left:{x:a.x,y:a.y,w:a.width,h:a.height},right:{x:b.x,y:b.y,w:b.width,h:b.height},overflow:document.documentElement.scrollWidth>innerWidth};});
 assert(Math.abs(layout.left.y-layout.right.y)<2);assert(Math.abs(layout.left.h-layout.right.h)<2);assert(layout.right.x>=layout.left.x+layout.left.w);assert.equal(layout.overflow,false);
 await page.screenshot({path:`output/imported-2875-${width}.png`,fullPage:true});report.push({width,imported:layout});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('output/ui-2875.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});const report=[];
 try{
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
 await page.screenshot({path:`output/imported-2876-${width}.png`,fullPage:true});report.push({width,imported:layout});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('output/ui-imported-2876.json',JSON.stringify({passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

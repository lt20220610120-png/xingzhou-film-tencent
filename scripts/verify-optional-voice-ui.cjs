const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
try{for(const width of [2560,1280,900]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5838/scripts/fixtures/production-ui.html');await page.addStyleTag({path:'dist/assets/'+fs.readdirSync('dist/assets').find(n=>n.endsWith('.css'))});
 await page.getByRole('button',{name:/人物音色$/,exact:false}).click();
 const toggle=page.getByRole('switch',{name:'启用人物音色'});assert.equal(await toggle.getAttribute('aria-checked'),'false');assert(await page.getByRole('button',{name:'人物音色生成模型',exact:true}).isDisabled());
 await page.getByRole('button',{name:/项目与智能体$/}).click();await page.getByRole('button',{name:'或接续已有导演项目',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'验收剧本',exact:true}).click();
 await page.getByRole('button',{name:'开工前检查',exact:true}).click();await page.getByText('设置与连接检查通过，可以开始制作。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'开始制作',exact:true}).click();await page.getByText('第一集超分中，第二集视频生成中',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>qaProduction.createdConfig.voiceEnabled),false);
 await page.locator('.furnace-runtime-voices>summary').click();await page.getByRole('switch',{name:'启用人物音色'}).click();
 for(const [label,name]of [['人物音色生成模型','语音渠道'],['音色前置信息补充模型','音色补全模型'],['音色分发模型','音色分发模型']]){
  await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:new RegExp(name)}).click();
 }
 const count=page.getByRole('spinbutton',{name:'音色生成并发数'});assert.equal(await count.getAttribute('max'),null);await count.fill('128');await page.getByRole('button',{name:'应用音色设置',exact:true}).click();
 await page.waitForFunction(()=>qaProduction.voicePolicy?.voiceEnabled===true);assert.equal(await page.evaluate(()=>qaProduction.voicePolicy.voiceConcurrency),128);assert.equal(await page.evaluate(()=>qaProduction.created),1);assert.equal(await page.evaluate(()=>qaProduction.started),1);
 await page.getByRole('switch',{name:'启用人物音色'}).click();await page.getByRole('button',{name:'应用音色设置',exact:true}).click();await page.waitForFunction(()=>qaProduction.voicePolicy.voiceEnabled===false);
 for(const resize of [width,750,1700,width]){await page.setViewportSize({width:resize,height:900});await page.waitForTimeout(50);if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)){console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1&&r.width>0}).map(e=>({tag:e.tagName,cls:e.className,parent:e.parentElement.outerHTML.slice(0,200),style:getComputedStyle(e).width,grid:getComputedStyle(e.parentElement).gridTemplateColumns,text:e.textContent?.slice(0,30),r:e.getBoundingClientRect().toJSON()})).slice(-18)));await page.screenshot({path:'output/optional-overflow.png',fullPage:true});}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'workflow overflow '+resize);}
 if(width===2560){const box=await page.locator('.admin-panel').boundingBox();assert(box.width>2200,'admin must use available width '+box.width);}
 assert.deepEqual(errors,[]);await page.screenshot({path:`output/playwright/optional-voices-runtime-${width}.png`,fullPage:true});report.push({width,optionalOff:true,preflightWithoutVoiceModel:true,runtimeToggle:true,unrestrictedCount:true,resize:true});await page.close();
}fs.writeFileSync('output/optional-voice-ui-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

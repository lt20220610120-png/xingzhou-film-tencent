const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5837',out=path.resolve('output/review-132');fs.mkdirSync(out,{recursive:true});
const css=path.resolve('dist/assets',fs.readdirSync('dist/assets').find(n=>n.endsWith('.css')));
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],report={widths:[]};try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/qa/scene-continuity.html?legacy=1');await page.addStyleTag({path:css});
 await page.getByRole('button',{name:'逐条提示词',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'逐条提示词',exact:true}).getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>qaContinuity.run());
 const before=await page.evaluate(()=>({calls:qaContinuity.calls,speakers:Object.values(qaContinuity.saved.decisions).map(d=>d.speakers.length)}));assert.deepEqual(before.speakers,[2,1]);report.before=before;
 await page.getByRole('button',{name:'第 1 场，场景 15-2，已发布',exact:true}).click();await page.getByRole('region',{name:'场景 15-2 核实',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'场景清单',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.art-review-scene .art-review-voice-item').count(),2);report.sceneReturn=true;
 for(const width of [1280,1700,2560]){
  await page.setViewportSize({width,height:1000});
  const geometry=await page.locator('.art-review-controls').evaluate(e=>{const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right}};return {controls:rect(e),children:[...e.children].map(rect),text:e.innerText,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(!geometry.text.includes('分集清单'));assert(/已关联 2\/2 条/.test(geometry.text));assert(!geometry.overflow);
  if(width>=1700){assert(Math.abs(geometry.children[2].y+geometry.children[2].height/2-(geometry.children[0].y+geometry.children[0].height/2))<2);assert(geometry.children[0].width<=300);assert(geometry.children[1].width<=310);}
  const switcher=await page.getByRole('group',{name:'查看素材关联层次'}).boundingBox();assert(switcher.x>=0&&switcher.x+switcher.width<=width);
  await page.screenshot({path:path.join(out,`scene-${width}.png`)});report.widths.push({width,...geometry,switcher});
 }
 await page.getByRole('button',{name:'逐条提示词',exact:true}).click();await page.getByRole('tab',{name:'第 1 条提示词 15-2-1',exact:true}).click();
 await page.getByRole('button',{name:'场景清单',exact:true}).click();await page.getByRole('region',{name:'场景 15-2 核实',exact:true}).waitFor();
 await page.getByRole('button',{name:'逐条提示词',exact:true}).click();report.roundTrip=true;
 await page.evaluate(()=>qaContinuity.adopt());
 await page.waitForFunction(()=>{try{return qaContinuity.compile().every(c=>c.references.some(r=>r.kind==='audio'));}catch{return false;}});
 const adopted=await page.evaluate(()=>({calls:qaContinuity.calls,audio:qaContinuity.compile().map(c=>c.references.filter(r=>r.kind==='audio').length)}));assert.equal(adopted.calls,before.calls);assert.deepEqual(adopted.audio,[2,1]);report.adopted=adopted;
 await page.screenshot({path:path.join(out,'prompt-adopted.png')});await page.close();
 const empty=await browser.newPage({viewport:{width:1700,height:1000}});empty.on('pageerror',e=>errors.push(e.message));await empty.goto(base+'/qa/scene-continuity.html?legacy=1&noPrompts=1');await empty.addStyleTag({path:css});await empty.getByRole('region',{name:'场景 15-2 核实',exact:true}).waitFor();assert.equal(await empty.getByRole('button',{name:'逐条提示词',exact:true}).count(),0);assert.equal(await empty.locator('.art-review-scene .art-review-voice-item').count(),2);report.noPrompts=true;await empty.screenshot({path:path.join(out,'no-prompts.png')});await empty.close();
 const director=await browser.newPage({viewport:{width:1700,height:1000}});director.on('pageerror',e=>errors.push(e.message));await director.goto(base+'/qa/supplement-workflow.html');await director.addStyleTag({path:css});await director.getByRole('button',{name:'快速模式',exact:true}).click();await director.locator('.director-config-rack').waitFor();assert.equal(await director.locator('.style-bar-hint').count(),0);const style=director.getByRole('button',{name:'真人电影级',exact:true});await style.click();assert.equal(await style.getAttribute('aria-pressed'),'true');const ratio=director.getByRole('button',{name:'9:16',exact:true});await ratio.click();assert.equal(await ratio.getAttribute('aria-pressed'),'true');await director.screenshot({path:path.join(out,'director-settings.png')});report.directorSettings=true;await director.close();
 assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

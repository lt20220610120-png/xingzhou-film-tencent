const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']}),report=[];
 try{for(const width of [1280,1700,2232]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5839/scripts/fixtures/voice-review-ui.html',{waitUntil:'networkidle'});
  const css=fs.readdirSync('dist/assets').find(n=>n.endsWith('.css'));await page.addStyleTag({path:'dist/assets/'+css});
  await page.getByRole('button',{name:'添加人物音色',exact:true}).waitFor();
  const header=page.locator('.project-voices>header');assert.equal(await header.getByLabel('音色分集筛选').count(),1);assert.equal(await header.getByRole('button',{name:'添加人物音色'}).count(),1);
  assert.equal(await page.locator('.voice-review-toolbar').getByRole('button',{name:'添加人物音色'}).count(),0);
  const before=await page.evaluate(()=>({profiles:JSON.stringify(voiceQA.ledger.voiceProfiles),cards:document.querySelectorAll('.project-voice-card').length}));
  await page.getByRole('button',{name:'添加人物音色',exact:true}).click();let dialog=page.getByRole('dialog',{name:'添加人物音色',exact:true});await dialog.waitFor();
  assert.equal(await dialog.getByLabel('人物名称',{exact:true}).count(),0);assert.equal(await dialog.getByLabel('卡片名称',{exact:true}).count(),0);
  assert.equal(await dialog.getByRole('radio').count(),6);assert(await dialog.getByRole('button',{name:'添加',exact:true}).isDisabled());
  await page.evaluate(()=>voiceQA.setCanEdit(false));await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>JSON.stringify(voiceQA.ledger.voiceProfiles)),before.profiles);await page.evaluate(()=>voiceQA.setCanEdit(true));
  await page.getByRole('button',{name:'添加人物音色',exact:true}).click();dialog=page.getByRole('dialog',{name:'添加人物音色',exact:true});
  await dialog.getByLabel('搜索已读取人物').fill('路人甲');await dialog.getByRole('radio').check();await page.evaluate(()=>voiceQA.failSave=true);await dialog.getByRole('button',{name:'添加',exact:true}).click();await dialog.getByRole('alert').getByText(/模拟保存失败/).waitFor();assert.equal(await dialog.getByLabel('搜索已读取人物').inputValue(),'路人甲');await page.evaluate(()=>voiceQA.failSave=false);await dialog.getByRole('button',{name:'添加',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const minor=page.locator('.project-voice-card').filter({has:page.getByRole('heading',{name:'路人甲',exact:true})});await minor.waitFor();
  assert.equal(await page.evaluate(()=>voiceQA.ledger.voiceProfiles.路人甲.manual),undefined);assert.equal(await page.evaluate(()=>voiceQA.ledger.voiceProfiles.路人甲.association),undefined);
  assert.equal(await page.evaluate(()=>Object.keys(voiceQA.ledger.voiceProfiles).filter(k=>k.startsWith('manual:')).length),1);
  assert.match(await minor.innerText(),/1 个关联场景/);await minor.locator('summary').first().click();assert.match(await minor.innerText(),/关联场景：1-1/);
  assert.equal(await page.evaluate(()=>voiceQA.requests.length),0);assert.equal(await page.evaluate(()=>voiceQA.reads.length),0);
  await page.getByRole('button',{name:'添加人物音色',exact:true}).click();dialog=page.getByRole('dialog',{name:'添加人物音色',exact:true});await dialog.getByLabel('搜索已读取人物').fill('小王');await dialog.getByRole('radio').check();await dialog.getByRole('button',{name:'添加',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>voiceQA.ledger.voiceProfiles.小王.candidates[0].id),'old');
  assert.equal(await page.evaluate(()=>voiceQA.ledger.voiceProfiles.老周.confirmed.id),'adopted');
  await page.getByRole('button',{name:'添加人物音色',exact:true}).click();dialog=page.getByRole('dialog',{name:'添加人物音色',exact:true});await dialog.getByRole('button',{name:'未找到人物？手动补录'}).click();
  dialog=page.getByRole('dialog',{name:'手动补录人物音色',exact:true});await dialog.getByLabel('卡片名称',{exact:true}).fill('电话通知');await dialog.getByLabel('人物名称',{exact:true}).fill('电话里的工作人员');await dialog.getByRole('checkbox',{name:'1-1',exact:true}).check();
  fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:`output/playwright/voice139-manual-${width}.png`});
  await dialog.getByRole('button',{name:'添加',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>Object.values(voiceQA.ledger.voiceProfiles).filter(p=>p.manual?.name==='电话通知').length),1);
  assert.deepEqual(await page.evaluate(()=>Object.values(voiceQA.ledger.voiceProfiles).find(p=>p.manual?.name==='电话通知').manual.sceneIds),['1-1']);
  await page.getByRole('button',{name:'添加人物音色',exact:true}).click();dialog=page.getByRole('dialog',{name:'添加人物音色',exact:true});await dialog.waitFor();assert.equal(await dialog.getByLabel('卡片名称',{exact:true}).count(),0);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');assert.deepEqual(errors,[]);
  await page.screenshot({path:`output/playwright/voice139-picker-${width}.png`});await page.keyboard.press('Escape');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/playwright/voice139-header-${width}.png`});
  report.push({width,passed:true,defaultPicker:true,noDuplicateIdentity:true,noGeneration:true,manualFallback:true,linksPreserved:true});await page.close();
 }console.log(JSON.stringify(report));fs.writeFileSync('output/voice139-ui.json',JSON.stringify(report,null,2));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

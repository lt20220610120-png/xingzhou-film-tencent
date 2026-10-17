// Production React fixtures only. No user data writes or paid generation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.XZ_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5802/',out=path.resolve('output/playwright/compact-art-scenes-2.8.44');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={checks:[],realApiCalls:0};
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project','compact-qa');localStorage.setItem('xz-collab-last-section','info');
  const episodes=[{id:'e1',title:'第1集',episodeNumber:1,content:'1-1 工会 日 内\n杰伊工作。'}];
  const project={id:'compact-qa',name:'长场景与七套妆造隔离验收',owner_id:'owner',myRole:'producer',style:'AI真人',episodes,script:episodes[0].content,genre:'后台保存的时代背景',analysis_progress:{}};
  const sceneIds=Array.from({length:480},(_,i)=>`${Math.floor(i/12)+1}-${i%12+1}`);
  const assets=Array.from({length:7},(_,i)=>({id:'outfit-'+i,name:`【杰伊-造型${i+1}】`,category:'character',episodes:[1],sceneIds,first_episode:1,description:`第${i+1}套妆造。成年男性，灰色工作服，黑色短发。`,images:[]}));
  const empty=async()=>[];window.__compactqa={project,assets,writes:[],aiCalls:0};
  window.xingzhou={loadState:async()=>({directorProjects:[],apiProfiles:[{id:'llm',name:'模拟分析',model:'mock'}],activeApiId:'llm',mediaProfiles:[]}),saveState:async()=>{},loadDirectorProjects:empty,authSession:async()=>({id:'owner',username:'owner',roles:['director'],activeRole:'director'}),appVersion:async()=>'2.8.44',storageInfo:async()=>({dataDir:'隔离内存'}),onUpdateProgress:()=>()=>{},onMediaTaskStatus:()=>()=>{},checkUpdate:async()=>({configured:false}),generationList:empty,directorCollabListProjects:empty,collabIsProducer:async()=>true,
   collabListProjects:async()=>[structuredClone(project)],collabGetProject:async()=>structuredClone(project),collabListAssets:async()=>structuredClone(assets),collabListMembers:empty,collabListMedia:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,artReviewSaveLocal:async()=>{},aiChat:async()=>{__compactqa.aiCalls++;throw Error('禁止真实生成');},collabUpdateAsset:async p=>{__compactqa.writes.push(p);return assets.find(a=>a.id===p.assetId);}};
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'信息读取',exact:true}).click();await page.getByLabel('分析模型',{exact:true}).waitFor();
 assert.equal(await page.getByRole('region',{name:'自动分析的剧本背景'}).count(),0);assert.equal(await page.getByText('剧本背景',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>__compactqa.project.genre),'后台保存的时代背景');await page.screenshot({path:path.join(out,'01-info.png')});
 report.checks.push('信息读取不展示剧本背景标题、说明与内容，后台背景数据保留');
 await page.locator('.collab-rail').getByRole('button',{name:'资产',exact:true}).click();
 const picker=page.getByRole('navigation',{name:'杰伊 服装选择',exact:true});await picker.waitFor();
 const trigger=page.getByRole('button',{name:'查看杰伊的对应场景',exact:true});
 assert.equal(await trigger.innerText(),'对应场景');assert.equal(await page.locator('.art-row-identity').first().innerText().then(s=>s.includes('40-12')),false);
 const before=await picker.boundingBox();assert.ok(before.height>100,JSON.stringify(before));
 await trigger.hover();const popup=page.getByRole('dialog',{name:'杰伊的对应场景',exact:true});await popup.waitFor();assert.equal(await popup.locator('.asset-scene-links-list>span').count(),480);
 await popup.hover();const scroll=await popup.locator('.asset-scene-links-list').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));assert.ok(scroll.scroll>scroll.height);
 await popup.locator('.asset-scene-links-list').evaluate(el=>el.scrollTop=el.scrollHeight);assert.equal(await popup.getByText('40-12',{exact:true}).isVisible(),true);
 await page.screenshot({path:path.join(out,'02-scenes-hover.png')});
 await page.mouse.move(1000,100);await popup.waitFor({state:'detached'});
 await trigger.click();await page.mouse.move(1000,100);await page.waitForTimeout(250);assert.equal(await popup.isVisible(),true);
 await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});
 await picker.getByRole('button').first().focus();await trigger.focus();await popup.waitFor();
 await page.keyboard.press('ArrowDown');await page.getByLabel('对应场景列表',{exact:true}).evaluate(el=>{if(document.activeElement!==el)throw Error('键盘焦点未进入场景列表');});
 await page.keyboard.press('PageDown');await page.waitForTimeout(180);assert.ok(await page.getByLabel('对应场景列表',{exact:true}).evaluate(el=>el.scrollTop>0));
 await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
 report.checks.push('480场景悬停展开可内部滚动，移出关闭；点击固定；键盘ArrowDown入列表、PageDown滚动、Escape关闭回焦');
 for(let i=1;i<=7;i++){await picker.getByRole('button').nth(i-1).click();assert.equal(await picker.getByRole('button').nth(i-1).getAttribute('aria-pressed'),'true');assert.match(await page.getByLabel('资产提示词',{exact:true}).first().innerText(),new RegExp(`第${i}套妆造`));}
 assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 report.checks.push('七套妆造全部可滚动选中，编辑区显示对应内容，切换后浮层收起');
 for(const width of [1120,1280,1600,2048]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(120);await trigger.click();
  const box=await popup.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=1000,JSON.stringify({width,box}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.keyboard.press('Escape');
 }
 await page.screenshot({path:path.join(out,'03-outfits.png')});assert.equal(await page.evaluate(()=>__compactqa.aiCalls),0);assert.equal(await page.evaluate(()=>__compactqa.writes.length),0);assert.deepEqual(errors,[]);
 report.checks.push('1120–2048px浮层无裁切与横向溢出，浏览和切换不写用户资产、不调用生成');report.passed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async error=>{report.error=error.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await browser?.close();console.error(error);process.exitCode=1;});

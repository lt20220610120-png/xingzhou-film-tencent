// Real React UI regression with isolated fixtures. No network generation or user files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.XZ_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5801/';
const out=path.resolve('output/playwright/history-assets-2.8.41');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={checks:[],realApiCalls:0};
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const prompt=(id,label)=>({id,label,content:'测试提示词 '+label,createdAt:'2026-10-16T00:00:00Z'});
  const director={id:'director-qa',name:'历史删除隔离验收',masterScript:'第1集\n1-1 房间 日 内\n人物说话。\n第2集\n2-1 公园 日 外\n人物站立。',episodes:[{id:'e1',title:'第1集',kind:'episode',episodeNumber:1,content:'1-1 房间 日 内\n人物说话。',prompts:[prompt('a','1-1-1'),prompt('b','1-2-1')]},{id:'e2',title:'第2集',kind:'episode',episodeNumber:2,content:'2-1 公园 日 外\n人物站立。',prompts:[prompt('c','2-1-1')]}],promptHistory:[prompt('old','1-5-1'),prompt('x','未编号')]};
  const other={id:'other-project',name:'其他项目',masterScript:'其他剧本',episodes:[],promptHistory:[prompt('other','1-1-1')]};
  const project={id:'assets-qa',name:'资产对齐隔离验收',owner_id:'qa-owner',myRole:'producer',style:'AI真人',episodes:[{id:'e1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内\n人物说话。'}],analysis_progress:{}};
  const rows=[{id:'a',name:'【林舟-常服】',category:'character',episodes:[1],first_episode:1,description:'成年男性，黑色短发，中等体型，灰色长袍。',images:[]}];
  const profiles=[{id:'image-qa',kind:'image',name:'验证用模型名称很长用于检查省略和布局',model:'image-model',endpoint:'https://example.invalid/v1'}];
  if(!localStorage.getItem('qa-initialized')){
   localStorage.clear();localStorage.setItem('qa-initialized','1');localStorage.setItem('xz-role','director');localStorage.setItem('xz-director-last-project',director.id);localStorage.setItem('xz-director-last-pane','e1');localStorage.setItem('xz-collab-last-project',project.id);localStorage.setItem('xz-collab-last-section','assets');
  }
  const initial={directorProjects:[director,other],apiProfiles:[],mediaProfiles:profiles,activeImageApiId:'image-qa'};
  window.__qa={saved:JSON.parse(localStorage.getItem('qa-state')||'null')||initial,exports:[],generationCalls:0};
  const empty=async()=>[],save=value=>{__qa.saved=structuredClone(value);localStorage.setItem('qa-state',JSON.stringify(value));};
  window.xingzhou={loadState:async()=>structuredClone(__qa.saved),saveState:async s=>save(s),loadDirectorProjects:async()=>structuredClone(__qa.saved.directorProjects),saveDirectorProjects:async projects=>save({...__qa.saved,directorProjects:projects}),
   authSession:async()=>({id:'qa-owner',username:'qa-owner',roles:['director'],activeRole:'director'}),storageInfo:async()=>({dataDir:'隔离内存'}),appVersion:async()=>'2.8.41',generationList:empty,directorCollabListProjects:empty,collabIsProducer:async()=>true,collabListProjects:async()=>[structuredClone(project)],collabGetProject:async()=>structuredClone(project),collabListAssets:async()=>structuredClone(rows),collabListMembers:empty,collabListMedia:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,artReviewSaveLocal:async()=>{},onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),saveTxt:async p=>{__qa.exports.push(p);return '隔离验收.txt';},saveTxtBatch:async p=>{__qa.exports.push(p);return '隔离目录';},mediaGenerateImage:async()=>{__qa.generationCalls++;throw Error('禁止真实生成');}};
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'导演工作台',exact:true}).click();
 await page.getByRole('button',{name:'历史提示词',exact:true}).click();
 await page.getByLabel('删除第1集提示词',{exact:true}).waitFor();
 assert.equal(await page.locator('.prompt-history-card').count(),3);
 await page.screenshot({path:path.join(out,'01-history.png')});
 await page.getByLabel('删除第1集提示词',{exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'删除本集历史提示词',exact:true});
 assert.match(await dialog.innerText(),/3 条/);
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 assert.equal(await page.locator('.prompt-history-card').count(),3);
 report.checks.push('按集删除弹出范围和条数，取消不删；不误触打开卡片');
 await page.getByLabel('删除第1集提示词',{exact:true}).click();await dialog.getByRole('button',{name:'确认删除',exact:true}).click();
 await page.getByLabel('删除第1集提示词',{exact:true}).waitFor({state:'detached'});
 assert.equal(await page.locator('.prompt-history-card').count(),2);
 await page.waitForFunction(()=>__qa.saved.directorProjects.find(p=>p.id==='director-qa').deletedPromptIds?.length===3);
 assert.deepEqual(await page.evaluate(()=>__qa.saved.directorProjects.find(p=>p.id==='director-qa').episodes.map(e=>e.prompts.length)),[0,1]);
 assert.equal(await page.evaluate(()=>__qa.saved.directorProjects.find(p=>p.id==='other-project').promptHistory.length),1);
 report.checks.push('按集删除包括仅在历史的记录，同时保留其他集及其他项目，保存删除记录');
 await page.getByLabel('查看第2集提示词',{exact:true}).click();
 await page.getByRole('button',{name:'删除本集历史提示词',exact:true}).waitFor();
 await page.getByRole('button',{name:'返回全部集数',exact:true}).click();
 await page.getByRole('button',{name:'全部汇总导出',exact:true}).click();
 await page.waitForFunction(()=>__qa.exports.length===1);assert.doesNotMatch(await page.evaluate(()=>__qa.exports[0].content),/提示词 1-/);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByRole('button',{name:'历史提示词',exact:true}).click();
 assert.equal(await page.locator('.prompt-history-card').count(),2);
 report.checks.push('分集详情也可整集删除；导出与重载均不恢复已删除提示词');
 await page.getByRole('button',{name:'删除全部历史提示词',exact:true}).click();
 const allDialog=page.getByRole('dialog',{name:'删除全部历史提示词',exact:true});assert.match(await allDialog.innerText(),/2 条/);
 await page.screenshot({path:path.join(out,'02-delete-confirm.png')});
 await allDialog.getByRole('button',{name:'确认删除',exact:true}).click();
 await page.waitForFunction(()=>__qa.saved.directorProjects.find(p=>p.id==='director-qa').deletedPromptIds?.length===5);
 assert.equal(await page.locator('.prompt-history-card').count(),0);assert.equal(await page.getByRole('button',{name:'删除全部历史提示词',exact:true}).isDisabled(),true);
 assert.equal(await page.evaluate(()=>__qa.saved.directorProjects.find(p=>p.id==='director-qa').episodes.length),2);
 report.checks.push('全部删除覆盖未编号组，空列表按钮禁用，剧本及分集保留');
 await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.locator('.collab-rail').getByRole('button',{name:'资产',exact:true}).click();
 await page.getByLabel('资产批量生图模型',{exact:true}).waitFor();
 for(const width of [2048,1600,1280,1120]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>{
   const head=document.querySelector('.asset-library-workbench .collab-art-head');
   const selectors=['.manual-add-button','.collab-cat-tabs','.asset-category-batch-controls select','.asset-category-batch-controls > button'];
   const boxes=selectors.flatMap(s=>[...head.querySelectorAll(s)].map(e=>{const r=e.getBoundingClientRect();return {name:e.getAttribute('aria-label')||e.textContent,top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right};}));
   return {boxes,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(layout.overflow,false,JSON.stringify(layout));
  assert.ok(layout.boxes.every(b=>b.height===40),JSON.stringify(layout));
  const byRow=new Map();for(const box of layout.boxes){const key=Math.round(box.bottom);const row=byRow.get(key)||[];row.push(box);byRow.set(key,row);}
  // At wide widths both groups must share the bottom of their controls.
  if(width>=1600)assert.equal(byRow.size,1,JSON.stringify(layout));
  assert.ok(layout.boxes.every(b=>b.left>=0&&b.right<=width+1),JSON.stringify(layout));
  await page.screenshot({path:path.join(out,`03-assets-${width}.png`)});report.checks.push(`${width}px：工具栏控件高度40px、同排底部对齐、无横向溢出`);
 }
 await page.getByRole('button',{name:'场景',exact:true}).click();await page.getByRole('button',{name:'一键生成场景（0）',exact:true}).waitFor();
 await page.getByRole('button',{name:'道具',exact:true}).click();await page.getByRole('button',{name:'一键生成道具（0）',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>__qa.generationCalls),0);assert.deepEqual(errors,[]);
 report.checks.push('分类切换正常，无生成请求及页面异常');report.passed=true;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{report.error=e.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(e);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve('output/playwright/asset2839');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={realApiCalls:0,checks:[]};
(async()=>{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:5789/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const image={id:'original',url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="%23ddd"/></svg>'};
  const asset=(id,name,category,done=false,ep=1)=>({id,name,category,episodes:[ep],first_episode:ep,description:category==='character'?'男性，视觉年龄35岁，椭圆脸，黑色杏眼，浓眉，高鼻梁，薄唇，黑色短发，中等体型；服装：灰色长袍。':'客观完整描述：木质物件或白色房间，纹理清晰。',images:done?[{...image,id:'old-'+id}]:[]});
  const rows=[asset('base','【林舟-常服】','character'),asset('variant','【林舟-礼服】','character',false,2),asset('done','【陈明-常服】','character',true),asset('s1','【房间】','scene'),asset('s2','【公园】','scene'),asset('s3','【办公室】','scene',true),...Array.from({length:5},(_,n)=>asset('p'+n,`【道具${n}】`,'prop',n===4)),{...asset('archive','【历史物件】','prop'),episodes:[],sceneIds:[]}];
  rows.find(a=>a.id==='variant').description='参考【林舟-常服】；服装差异：黑色礼服，皮鞋。';
  const project={id:'asset2839-qa',name:'资产分类批量生成验收',owner_id:'qa-owner',style:'AI真人',myRole:'producer',episodes:[{id:'e1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内\n林舟站在房间。'},{id:'e2',title:'第2集',episodeNumber:2,content:'2-1 公园 日 外\n林舟换上礼服。'}],analysis_progress:{}};
  const calls=[],attached=[],waiters=[];let active=0,peak=0,hold=false,fail=false;
  window.__qa={calls,attached,rows,get peak(){return peak;},setHold:v=>{hold=v;},release:()=>{hold=false;waiters.splice(0).forEach(resolve=>resolve());},setFail:v=>{fail=v;},setReadonly:()=>{project.myRole='collaborator';},project};
  localStorage.clear();localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project',project.id);localStorage.setItem('xz-collab-last-section','assets');
  const empty=async()=>[];
  const profiles=['one','two'].map(id=>({id,kind:'image',name:'测试接口'+id,model:'gpt-image-1',provider:'openai',endpoint:'https://example.invalid/'+id}));
  window.xingzhou={loadState:async()=>({directorProjects:[],apiProfiles:[],mediaProfiles:profiles,activeImageApiId:'one'}),saveState:async()=>{},loadDirectorProjects:empty,saveDirectorProjects:async()=>{},authSession:async()=>({id:'qa-owner',username:'qa-owner',displayName:'隔离验收',roles:['director'],activeRole:'director'}),storageInfo:async()=>({dataDir:'隔离内存'}),appVersion:async()=>'2.8.39',generationList:empty,directorCollabListProjects:empty,
   collabIsProducer:async()=>project.myRole==='producer',collabListProjects:async()=>[structuredClone(project)],collabGetProject:async()=>structuredClone(project),collabListAssets:async()=>structuredClone(rows),collabListMembers:empty,collabListMedia:empty,collabListMessages:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,artReviewSaveLocal:async()=>{},onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),
   collabUpdateAsset:async p=>Object.assign(rows.find(a=>a.id===p.assetId),p.updates),
   mediaGenerateImage:async payload=>{calls.push(structuredClone(payload));active++;peak=Math.max(peak,active);try{if(hold)await new Promise(resolve=>waiters.push(resolve));await new Promise(resolve=>setTimeout(resolve,30));if(fail)throw Error('模拟上游失败');return {filePath:'C:/isolated/result-'+calls.length+'.png'};}finally{active--;}},
   collabAttachGeneratedAssetImage:async p=>{attached.push(structuredClone(p));const saved={...image,id:'new-'+attached.length};rows.find(a=>a.id===p.assetId).images.push(saved);return saved;},
   collabLoadAssetImage:async p=>rows.find(a=>a.id===p.assetId)?.images.find(i=>i.id===p.imageId)||image,
   collabResolveAssetImage:async p=>rows.find(a=>a.id===p.assetId)?.images.find(i=>i.id===p.imageId)||image};
 });
 await page.goto('http://127.0.0.1:5789/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.locator('.collab-rail').getByRole('button',{name:'资产',exact:true}).click();
 const batch=()=>page.getByRole('button',{name:/一键生成人物|一键生成场景|一键生成道具/});
 await page.getByRole('button',{name:'一键生成人物（2）',exact:true}).waitFor();
 await page.getByRole('button',{name:'取消全选',exact:true}).click();await page.getByRole('button',{name:'刷新云端数据',exact:true}).click();await page.getByRole('button',{name:'一键生成人物（0）',exact:true}).waitFor();
 await page.getByRole('button',{name:'全选未生成',exact:true}).click();
 await page.getByLabel('资产批量生图模型',{exact:true}).selectOption(await page.getByLabel('资产批量生图模型',{exact:true}).locator('option').filter({hasText:'测试接口two'}).first().getAttribute('value'));await page.getByLabel('资产图片并发数量',{exact:true}).selectOption('2');
 await page.screenshot({path:path.join(out,'01-character-default.png')});
 await batch().click();await page.getByRole('button',{name:'一键生成人物（0）',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>__qa.attached.map(p=>p.assetId)),['base','variant']);
 assert.equal(await page.evaluate(()=>__qa.calls[1].references[0].assetId),'base');
 assert.equal(await page.evaluate(()=>__qa.calls.every(p=>p.endpoint==='https://example.invalid/two')),true);
 report.checks.push('default unfinished all costumes; cancel survives refresh; model choice; base precedes referenced variant; no other categories called');
 await page.getByLabel('选择 【陈明-常服】 批量生成',{exact:true}).check();await batch().click();await page.getByRole('button',{name:'一键生成人物（0）',exact:true}).waitFor();
 await page.waitForFunction(()=>__qa.attached.length===3);assert.equal(await page.evaluate(()=>__qa.rows.find(a=>a.id==='done').images.length),2);report.checks.push('explicit completed asset regeneration retains its original image');
 await page.locator('.collab-cat-tabs').getByRole('button',{name:'道具',exact:true}).click();await page.getByRole('button',{name:'一键生成道具（4）',exact:true}).waitFor();
 await page.getByRole('button',{name:'取消全选',exact:true}).click();for(const n of [0,1,2])await page.getByLabel(`选择 【道具${n}】 批量生成`,{exact:true}).check();
 await page.getByLabel('搜索全剧资产',{exact:true}).fill('道具0');await page.getByRole('button',{name:'一键生成道具（3）',exact:true}).waitFor();await page.getByLabel('搜索全剧资产',{exact:true}).fill('');
 await page.evaluate(()=>__qa.setHold(true));await batch().click();await page.waitForFunction(()=>__qa.calls.length===5);
 await page.screenshot({path:path.join(out,'02-concurrent-props.png')});await page.getByRole('button',{name:'停止后续生成',exact:true}).click();await page.evaluate(()=>__qa.release());await page.getByRole('button',{name:'一键生成道具（1）',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>__qa.peak),2);assert.deepEqual(await page.evaluate(()=>__qa.attached.slice(3).map(p=>p.assetId).sort()),['p0','p1']);
 report.checks.push('category reset; archived and existing images skipped; manual subset; search preserves scope; concurrency=2; stop saves running results and leaves queued work');
 await page.evaluate(()=>__qa.setFail(true));await batch().click();await page.getByText(/1 项未完成：.*模拟上游失败/).waitFor();assert.equal(await page.evaluate(()=>__qa.calls.length),6);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>__qa.calls.length),6);await page.evaluate(()=>__qa.setFail(false));
 report.checks.push('upstream failure reported once without automatic paid retry');
 await page.locator('.collab-cat-tabs').getByRole('button',{name:'场景',exact:true}).click();await page.getByRole('button',{name:'一键生成场景（2）',exact:true}).waitFor();await batch().click();await page.getByRole('button',{name:'一键生成场景（0）',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>__qa.attached.slice(-2).map(p=>p.assetId).sort()),['s1','s2']);report.checks.push('scene tab generates only its unfinished assets');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(out,'03-scene-1280.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'未关联历史资产（1）',exact:true}).click();assert.equal(await batch().isDisabled(),true);report.checks.push('history-only view cannot bulk generate; 1280 layout has no horizontal overflow');
 assert.deepEqual(errors,[]);report.passed=true;report.pageErrors=errors;report.mockGenerated=await page.evaluate(()=>__qa.calls.length);report.mockAttached=await page.evaluate(()=>__qa.attached.length);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async error=>{report.error=error.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(error);process.exitCode=1;});

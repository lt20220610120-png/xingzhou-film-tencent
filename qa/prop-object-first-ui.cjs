const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve('output/playwright/prop2860');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={realApiCalls:0,checks:[]};
(async()=>{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:5793/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const image={id:'original',url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="%23ddd"/></svg>'};
  const asset=(id,name,category,done=false,ep=1)=>({id,name,category,episodes:[ep],first_episode:ep,description:category==='character'?'男性，视觉年龄35岁，椭圆脸，黑色杏眼，浓眉，高鼻梁，薄唇，黑色短发，中等体型；服装：灰色长袍。':'客观完整描述：木质物件或白色房间，纹理清晰。',images:done?[{...image,id:'old-'+id}]:[]});
  const unused=[asset('base','【林舟-常服】','character'),asset('variant','【林舟-礼服】','character',false,2),asset('done','【陈明-常服】','character',true),asset('s1','【房间】','scene'),asset('s2','【公园】','scene'),asset('s3','【办公室】','scene',true),...Array.from({length:5},(_,n)=>asset('p'+n,`【道具${n}】`,'prop',n===4)),{...asset('archive','【历史物件】','prop'),episodes:[],sceneIds:[]}];
  const rows=[asset('elena','【Elena Suh-日常服】','character',true),asset('guitar','【Elena Suh-旧木吉他】','prop',true),asset('bag','【旧吉他琴袋-Elena Suh】','prop')];
  const project={id:'asset2839-qa',name:'资产分类批量生成验收',owner_id:'qa-owner',style:'AI真人',myRole:'producer',episodes:[{id:'e1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内\n林舟站在房间。'},{id:'e2',title:'第2集',episodeNumber:2,content:'2-1 公园 日 外\n林舟换上礼服。'}],analysis_progress:{}};
  const calls=[],attached=[],waiters=[];let active=0,peak=0,hold=false,fail=false;
  const exports=[];window.__qa={exports,calls,attached,rows,get peak(){return peak;},setHold:v=>{hold=v;},release:()=>{hold=false;waiters.splice(0).forEach(resolve=>resolve());},setFail:v=>{fail=v;},setReadonly:()=>{project.myRole='collaborator';},project};
  localStorage.clear();localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project',project.id);localStorage.setItem('xz-collab-last-section','assets');
  const empty=async()=>[];
  const profiles=['one','two'].map(id=>({id,kind:'image',name:'测试接口'+id,model:'gpt-image-1',provider:'openai',endpoint:'https://example.invalid/'+id}));
  window.xingzhou={loadState:async()=>({directorProjects:[],apiProfiles:[],mediaProfiles:profiles,activeImageApiId:'one'}),saveState:async()=>{},loadDirectorProjects:empty,saveDirectorProjects:async()=>{},authSession:async()=>({id:'qa-owner',username:'qa-owner',displayName:'隔离验收',roles:['director'],activeRole:'director'}),storageInfo:async()=>({dataDir:'隔离内存'}),appVersion:async()=>'2.8.39',generationList:empty,directorCollabListProjects:empty,
   collabIsProducer:async()=>project.myRole==='producer',collabListProjects:async()=>[structuredClone(project)],collabGetProject:async()=>structuredClone(project),collabListAssets:async()=>structuredClone(rows),collabListMembers:empty,collabListMedia:empty,collabListMessages:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,artReviewSaveLocal:async()=>{},onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),
   collabExportImages:async p=>{exports.push(structuredClone(p));return {saved:1};},
   collabUpdateAsset:async p=>Object.assign(rows.find(a=>a.id===p.assetId),p.updates),
   mediaGenerateImage:async payload=>{calls.push(structuredClone(payload));active++;peak=Math.max(peak,active);try{if(hold)await new Promise(resolve=>waiters.push(resolve));await new Promise(resolve=>setTimeout(resolve,30));if(fail)throw Error('模拟上游失败');return {filePath:'C:/isolated/result-'+calls.length+'.png'};}finally{active--;}},
   collabAttachGeneratedAssetImage:async p=>{attached.push(structuredClone(p));const saved={...image,id:'new-'+attached.length};rows.find(a=>a.id===p.assetId).images.push(saved);return saved;},
   collabLoadAssetImage:async p=>rows.find(a=>a.id===p.assetId)?.images.find(i=>i.id===p.imageId)||image,
   collabResolveAssetImage:async p=>rows.find(a=>a.id===p.assetId)?.images.find(i=>i.id===p.imageId)||image};
 });

 await page.goto('http://127.0.0.1:5793/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'资产',exact:true}).click();
 await page.locator('.collab-cat-tabs').getByRole('button',{name:'道具',exact:true}).click();
 const nav=page.locator('.asset-locator-rail');
 await nav.getByRole('button',{name:/旧木吉他-Elena Suh/}).waitFor();
 assert.equal(await nav.getByRole('button',{name:/Elena Suh-旧木吉他/}).count(),0);
 // Cloud identity stays legacy; the visible primary title and owner badge change order.
 const row=page.locator('.art-workbench-row[aria-label="【Elena Suh-旧木吉他】"]');
 assert.equal(await row.locator('.art-row-identity > strong').innerText(),'旧木吉他');
 assert.equal(await row.locator('.art-row-variant').innerText(),'Elena Suh');
 await row.locator('strong').filter({hasText:'旧木吉他-Elena Suh 提示词'}).waitFor();
 for(const width of [1280,1700,2048]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`assets-${width}.png`)});
 }
 await page.getByLabel('搜索全剧资产').fill('旧木吉他-Elena Suh');
 assert.equal(await page.locator('.art-workbench-row').count(),1);
 await row.getByRole('button',{name:'单独下载',exact:true}).click();
 await page.waitForFunction(()=>__qa.exports.length===1);
 assert.equal(await page.evaluate(()=>__qa.exports[0].images[0].assetName),'旧木吉他-Elena Suh');
 assert.equal(await page.evaluate(()=>__qa.rows.find(a=>a.id==='guitar').name),'【Elena Suh-旧木吉他】');
 await page.getByLabel('搜索全剧资产').fill('');
 await page.getByRole('button',{name:/只看未生成/}).click();
 assert.equal(await page.locator('.art-workbench-row').count(),1);
 assert.equal(await page.locator('.art-row-identity > strong').innerText(),'旧吉他琴袋');
 assert.equal(await page.evaluate(()=>__qa.calls.length),0);
 assert.deepEqual(errors,[]);
 report.passed=true;report.checks=['legacy prop object-first title/owner badge/navigation','new prop same order','1280/1700/2048 no overflow','display-name search','export filename object-first','stable cloud asset ID/name/images','missing-only filter'];
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async error=>{report.error=error.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(error);process.exitCode=1;});

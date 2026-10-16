// Isolated full React regression: fake cloud rows and tasks, no paid API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.XZ_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5801/';
const out=path.resolve('output/playwright/storyboard-2.8.42');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={checks:[],layouts:[],realApiCalls:0};
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:2048,height:1246}});
 await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const pic='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="74"><rect width="96" height="74" fill="#e7e1f8"/><circle cx="48" cy="28" r="13" fill="#8f7bcb"/><path d="M25 68q0-32 23-32t23 32" fill="#8f7bcb"/></svg>');
  const assets=Array.from({length:48},(_,i)=>({id:'asset-'+i,project_id:'sb-qa',name:'角色'+i,category:'character',episodes:[1],sceneIds:['1-1','1-2'],images:[{id:'img-'+i,url:pic,filename:'image-'+i+'.png'}]}));
  const valid=assets.map(a=>({id:a.images[0].id,imageId:a.images[0].id,assetId:a.id,projectId:'sb-qa',kind:'image',url:pic,name:a.name}));
  const internal=assets.map((a,i)=>({id:a.images[0].id,assetId:a.id,projectId:'sb-qa',kind:'asset-image',episode:1,url:pic,filename:'1792084419'+i+'.png'}));
  const model={id:'qa-video',name:'隔离验收视频模型',kind:'video',maxImages:80,maxAudios:10,maxVideos:10,ratios:['16:9','9:16'],durations:[5,15,30],resolutions:['480p','720p'],schema:{properties:{modeType:{items:{text2video:[0,0],image2video:[1,80],mixed2video:[0,80]},mixed2videoConfig:{imageMax:80,videoMax:10,audioMax:10}},enableSound:{displayName:'生成音频',enum:['on','off'],default:'on'},search_enabled:{displayName:'联网搜索',min:0,max:1,default:1},validate:{displayName:'自动校验素材',min:0,max:1,default:1}},config:{settings:['enableSound','search_enabled','validate']}}};
  const profiles=[{id:'libtv-qa',provider:'libtv',kind:'video',name:'隔离验收LibTV',model:model.id,endpoint:'https://example.invalid',modelCatalog:[model],capabilities:model},{id:'short-qa',kind:'video',name:'普通短参数模型',model:'qa-short',endpoint:'https://example.invalid/v1',apiKey:'isolated-fixture',videoProtocol:'videos-json',capabilities:{ratios:['16:9'],durations:[5],resolutions:['720p']}}];
  const config={profileId:'libtv-qa',model:model.id,ratio:'16:9',duration:5,resolution:'480p',references:[...valid,...internal]};
  const project={id:'sb-qa',name:'同名项目',owner_id:'qa-owner',myRole:'producer',style:'AI真人',episodes:[{id:'ep1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内\n角色说话。\n1-2 街道 日 外\n角色走路。',prompts:[{id:'cloud-shot',label:'1-1-1',content:'云端旧分镜提示词',generationConfig:config},{id:'local-shot',label:'1-1-2',content:'旧稿',generationConfig:config},{id:'fresh-shot',label:'1-2-1',content:'新分镜提示词'}]}]};
  if(!localStorage.getItem('sb-qa-ready')){
   localStorage.clear();localStorage.setItem('sb-qa-ready','1');localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project',project.id);localStorage.setItem('xz-collab-last-section','storyboard');
   localStorage.setItem('xz-shot-draft:sb-qa:local-shot',JSON.stringify({value:{...config,prompt:'本地未保存的新稿'},base:{content:'旧稿',generationConfig:config},dirty:true}));
  }
  // Same-named independent whole-book imports must never enter collaboration references.
  const book={id:'independent-book',name:'同名项目',selectedEntryId:'1-1-1:0',drafts:{},entries:[{id:'1-1-1:0',episode:1,scene:1,number:1,label:'1-1-1',prompt:'独立整本提示词'}],episodeMedia:{1:Array.from({length:20},(_,i)=>({id:'book-audio-'+i,kind:'audio',filePath:'C:/fixture/independent-'+i+'.wav'}))}};
  const state={directorProjects:[],apiProfiles:[],mediaProfiles:profiles,activeVideoApiId:'libtv-qa',generationWorkflow:{books:[book],selectedBookId:book.id}};
  window.__sbqa={project:JSON.parse(localStorage.getItem('qa-cloud')||'null')||project,assets,internal,model,state,submits:[],saves:[],mediaDeletes:0};
  const empty=async()=>[];
  window.xingzhou={loadState:async()=>state,saveState:async()=>{},loadDirectorProjects:empty,
   authSession:async()=>({id:'qa-owner',username:'qa-owner',roles:['director'],activeRole:'director'}),appVersion:async()=>'2.8.42',storageInfo:async()=>({dataDir:'隔离内存'}),onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),directorCollabListProjects:empty,collabIsProducer:async()=>true,
   collabListProjects:async()=>[structuredClone(__sbqa.project)],collabGetProject:async()=>structuredClone(__sbqa.project),collabListAssets:async()=>structuredClone(assets),collabListMembers:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,
   collabListMedia:async()=>[...structuredClone(internal),{id:'real-voice',projectId:'sb-qa',kind:'audio',episode:1,scene:'1-2',filename:'明确上传的语音.wav',url:'data:audio/wav;base64,UklGRg=='},{id:'foreign-voice',projectId:'foreign',kind:'audio',episode:1,scene:'1-1',filename:'其他项目语音.wav'}],generationList:empty,libtvModelSchema:async()=>structuredClone(model),
   collabPatchStoryboard:async input=>{__sbqa.saves.push(input);const shot=__sbqa.project.episodes[0].prompts.find(p=>p.id===input.shotId);Object.assign(shot,input.updates);localStorage.setItem('qa-cloud',JSON.stringify(__sbqa.project));return structuredClone(__sbqa.project);},
   generationSubmit:async input=>{__sbqa.submits.push(input);return {id:'fake-task'};},collabDeleteMedia:async()=>{__sbqa.mediaDeletes++;throw Error('禁止删除真实素材');}
  };
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();
 await page.locator('.collab-episode-card').first().click();
 const shots=page.locator('.collab-shot-card'),first=shots.nth(0),second=shots.nth(1);
 await first.locator('.generation-references figure').nth(47).waitFor();
 assert.equal(await first.locator('.generation-references figure').count(),48);
 assert.equal(await shots.locator('audio').count(),0);
 assert.equal(await page.getByText('@asset-image1',{exact:true}).count(),0);
 assert.equal(await second.getByLabel('提示词',{exact:true}).inputValue(),'本地未保存的新稿');
 report.checks.push('旧云分镜与未保存本地草稿自动清除asset-image错误引用，保留48张正常图片与本地提示词；当前场景无假音频/外项目音频');
 for(const width of [2048,1600,1280,1120]){
  await page.setViewportSize({width,height:1100});await page.waitForTimeout(450);
  const layout=await first.evaluate(el=>{
   const panel=el.querySelector('.generation-references'),uploads=el.querySelector('.generation-upload-buttons');
   const p=panel.getBoundingClientRect(),u=uploads.getBoundingClientRect();
   return {width:innerWidth,panel:{bottom:p.bottom,height:p.height,right:p.right},uploads:{bottom:u.bottom,left:u.left},scroll:panel.scrollHeight,client:panel.clientHeight,overflow:getComputedStyle(panel).overflowY,pageOverflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(layout.overflow,'auto');assert.ok(layout.scroll>layout.client+200,JSON.stringify(layout));assert.equal(layout.pageOverflow,false,JSON.stringify(layout));
  if(layout.uploads.left>layout.panel.right)assert.ok(Math.abs(layout.panel.bottom-layout.uploads.bottom)<=2,JSON.stringify(layout));
  assert.ok(layout.panel.height<1000,JSON.stringify(layout));report.layouts.push(layout);
  await first.locator('.generation-references').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  assert.ok(await first.locator('.generation-references').evaluate(el=>el.scrollTop>0));
  await first.locator('.generation-references').evaluate(el=>{el.scrollTop=0;});
  await first.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`storyboard-${width}.png`)});
 }
 report.checks.push('1120–2048px：48张图内部滚动、无横向溢出，宽屏素材底部与参考上传行对齐，窄窗固定260px');
 await page.setViewportSize({width:2048,height:1246});
 await first.getByLabel('生成接口',{exact:true}).selectOption('short-qa');await page.waitForTimeout(550);
 const short=await first.evaluate(el=>{const p=el.querySelector('.generation-references').getBoundingClientRect(),u=el.querySelector('.generation-upload-buttons').getBoundingClientRect();return {height:p.height,bottom:p.bottom,uploadBottom:u.bottom};});
 assert.ok(Math.abs(short.bottom-short.uploadBottom)<=2,JSON.stringify(short));report.layouts.push({shortModel:short});
 await page.screenshot({path:path.join(out,'short-model.png')});
 await first.getByLabel('生成接口',{exact:true}).selectOption('libtv-qa');await page.waitForTimeout(500);
 await first.getByRole('button',{name:'保存分镜',exact:true}).click();
 await page.waitForFunction(()=>__sbqa.saves.some(s=>s.shotId==='cloud-shot'));
 assert.ok(await page.evaluate(()=>__sbqa.saves.at(-1).updates.generationConfig.references.every(r=>r.kind==='image')));
 await first.getByRole('button',{name:'生成视频',exact:true}).click();
 await page.waitForFunction(()=>__sbqa.submits.length===1);
 const submit=await page.evaluate(()=>__sbqa.submits[0]);assert.equal(submit.references.length,48);assert.ok(submit.references.every(r=>r.kind==='image'));assert.equal(submit.projectId,'sb-qa');
 report.checks.push('保存及模拟提交只包含48张正确图片，不复活旧错误引用；无付费请求');
 await page.getByLabel('选择场景',{exact:true}).selectOption('1-2');
 await page.locator('.generation-references audio').waitFor();assert.equal(await page.locator('.generation-references audio').count(),1);
 assert.equal(await page.getByText('明确上传的语音.wav',{exact:true}).count(),1);
 assert.equal(await page.getByText('其他项目语音.wav',{exact:true}).count(),0);
 assert.equal(await page.getByText(/independent-/).count(),0);
 assert.equal(await page.evaluate(()=>__sbqa.mediaDeletes),0);assert.equal(await page.evaluate(()=>__sbqa.internal.length),48);
 report.checks.push('新分镜保留当前场景明确上传的真实音频，其他场景/项目及同名整本导入不混入，源文件与云端资产记录保留');
 await page.getByRole('button',{name:'图视生成',exact:true}).click();
 await page.getByRole('button',{name:'整本提示词与素材',exact:true}).click();
 const bookPanel=page.locator('.prompt-book-workspace');
 await bookPanel.locator('.generation-references audio').first().waitFor();
 assert.equal(await bookPanel.locator('.generation-references audio').count(),20);
 assert.equal(await bookPanel.locator('.generation-editor--reference-viewport').count(),0);
 report.checks.push('独立整本生成仍保留同名文档的20个原导入音频，未套用分镜滚动布局或修改导入素材');
 assert.deepEqual(errors,[]);report.passed=true;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{report.error=e.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(e);process.exitCode=1;});

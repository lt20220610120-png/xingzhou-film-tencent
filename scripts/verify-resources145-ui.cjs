// Isolated full React regression: fake cloud rows and tasks, no paid API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5884/';
const out=path.resolve('output/playwright/resources-2.8.145');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={checks:[],layouts:[],realApiCalls:0};
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:2048,height:1246}});
 await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 const {patchShot}=require('../cloud-backend/src/storyboard-merge.cjs');await context.route(base+'__qa/patch',async route=>{const data=route.request().postDataJSON();await route.fulfill({json:{...data.project,episodes:patchShot(data.project.episodes,data.payload)}});});
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
  window.__sbqa={project:JSON.parse(localStorage.getItem('qa-cloud')||'null')||project,assets,internal,model,state,submits:[],saves:[],mediaDeletes:0,deleteCalls:[],downloads:[],tasks:Array.from({length:7},(_,i)=>({id:'result-'+i,projectId:'sb-qa',kind:'video',shotId:'cloud-shot',shotLabel:'1-1-1',episode:1,scene:'1-1',createdAt:new Date(Date.UTC(2026,10,10,0,i)).toISOString(),status:i===6?'submitted':'success',duration:12,model:'qa-video',prompt:'测试视频',filePath:i===6?undefined:'D:/fixture/video-'+i+'.mp4'}))};
  const empty=async()=>[];
  window.xingzhou={loadState:async()=>state,saveState:async()=>{},loadDirectorProjects:empty,
   authSession:async()=>({id:'qa-owner',username:'qa-owner',roles:['director'],activeRole:'director'}),appVersion:async()=>'2.8.42',storageInfo:async()=>({dataDir:'隔离内存'}),onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),directorCollabListProjects:empty,collabIsProducer:async()=>true,
   collabListProjects:async()=>[structuredClone(__sbqa.project)],collabGetProject:async()=>structuredClone(__sbqa.project),collabListAssets:async()=>structuredClone(assets),collabListMembers:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,
   collabListMedia:async()=>[...structuredClone(internal),{id:'real-voice',projectId:'sb-qa',kind:'audio',episode:1,scene:'1-2',filename:'明确上传的语音.wav',url:'data:audio/wav;base64,UklGRg=='},{id:'foreign-voice',projectId:'foreign',kind:'audio',episode:1,scene:'1-1',filename:'其他项目语音.wav'}],generationList:async()=>structuredClone(__sbqa.tasks),projectVideoDelete:async p=>{__sbqa.deleteCalls.push(p);const keys=p.ids.map(i=>i.jobId?'job:'+i.jobId:'media:'+i.mediaId);__sbqa.tasks=__sbqa.tasks.filter(t=>!keys.includes('job:'+t.id));return {removed:p.ids.length,removedKeys:keys,errors:[]};},projectVideoExport:async p=>{__sbqa.downloads.push(p);return {completed:p.ids.length,errors:[]};},libtvModelSchema:async()=>structuredClone(model),
   collabPatchStoryboard:async input=>{if(input.operation==='settings'){const response=await fetch('/__qa/patch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:__sbqa.project,payload:input})});__sbqa.project=await response.json();localStorage.setItem('qa-cloud',JSON.stringify(__sbqa.project));return structuredClone(__sbqa.project);}__sbqa.saves.push(input);const shot=(__sbqa.project.episodes[0].storyboardPrompts||__sbqa.project.episodes[0].prompts).find(p=>p.id===input.shotId);if(input.editPolicy!=='direct'&&JSON.stringify(input.base.generationConfig??null)!==JSON.stringify(shot.generationConfig??null))throw Error('base mismatch');Object.assign(shot,input.updates);shot.generationConfig={...shot.generationConfig,serverNormalized:true};localStorage.setItem('qa-cloud',JSON.stringify(__sbqa.project));return structuredClone(__sbqa.project);},
   generationSubmit:async input=>{__sbqa.submits.push(input);return {id:'fake-task'};},collabDeleteMedia:async()=>{__sbqa.mediaDeletes++;throw Error('禁止删除真实素材');}
  };
 });
 await page.addInitScript(()=>{
  const bytes=new Uint8Array(1644),view=new DataView(bytes.buffer),write=(i,s)=>[...s].forEach((c,j)=>bytes[i+j]=c.charCodeAt(0));write(0,'RIFF');view.setUint32(4,1636,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,1600,true);
  const wav='data:audio/wav;base64,'+btoa(String.fromCharCode(...bytes));
  window.__voices={episodes:{},voiceProfiles:{
   '林':{manual:{name:'林',characterName:'林',sceneIds:['1-2']},confirmed:{id:'sample-1',url:wav}},
   '林::child':{manual:{name:'林',characterName:'林',ageStage:'child',sceneIds:['1-2']},confirmed:{id:'child-1',url:wav}},
   '待采用':{manual:{name:'待采用',sceneIds:['1-1']},candidates:[{id:'pending-sample',url:wav}]}
  }};
  xingzhou.promptArtStatus=async()=>({enabled:false});xingzhou.promptArtLoad=async()=>null;xingzhou.artReviewLoadLocal=async()=>structuredClone(__voices);xingzhou.artReviewSaveLocal=async()=>{};
  const list=xingzhou.collabListMedia;window.__uploads=[];xingzhou.collabListMedia=async input=>[...await list(input),...__uploads,{id:'cloud-video',kind:'video',projectId:'sb-qa',scene:'1-1',note:'[shot:cloud-shot]',url:'https://example.invalid/video.mp4'}];
  xingzhou.collabUploadMedia=async input=>{const row={id:'upload145',projectId:'sb-qa',kind:input.kind,filename:'本地上传.wav',url:wav};__uploads.push(row);return row;};
  __sbqa.tasks.forEach((t,i)=>{t.libtvCanvasUrl='https://example.invalid/canvas';t.jobId='original-task-'+i;t.checkedAt=Date.now();if(i===6){t.error='隔离任务提示';t.status='failed';}});
  __sbqa.tasks.push({...__sbqa.tasks[0],id:'single-result',shotId:'local-shot',shotLabel:'1-1-2'});
  xingzhou.mediaExportFile=async input=>{__sbqa.downloads.push(input);return 'saved.mp4';};
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();await page.locator('.collab-episode-card').first().click();
 const first=page.locator('.collab-shot-card').first();await first.locator('.generation-result-grid article').first().waitFor();
 const cards=await first.locator('.generation-result-grid article').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,scroll:e.scrollHeight>e.clientHeight+2})));
 assert(cards.every(r=>Math.max(r.w/r.h,r.h/r.w)<=1.3&&!r.scroll),JSON.stringify(cards));report.checks.push('storyboard cards are near square without internal scroll');
 await first.getByRole('button',{name:'参考音频',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'选择项目参考素材'});await dialog.waitFor();await dialog.getByRole('button',{name:'选择林音色',exact:true}).waitFor();
 assert.equal(await dialog.getByRole('button',{name:'选择林 · 年幼音色',exact:true}).count(),1);assert.equal(await dialog.getByText('已采用音色',{exact:true}).count(),2);assert.equal(await dialog.getByText('待采用音色',{exact:true}).count(),0);assert.equal(await dialog.getByText('其他项目语音.wav',{exact:true}).count(),0);
 assert.equal(await dialog.locator('audio').count(),3);await dialog.getByLabel('试听林音色',{exact:true}).evaluate(async a=>{await a.play();a.pause();});
 report.checks.push('binding disabled: all project adopted voices including other scene/age visible; pending/foreign excluded; real WAV preview plays');
 for(const width of [1280,1700,2232]){
  await page.setViewportSize({width,height:1100});
  const metrics=await dialog.evaluate(d=>{const r=d.getBoundingClientRect(),b=d.querySelector('footer .primary'),c=getComputedStyle(b);return {width:innerWidth,dialog:{left:r.left,right:r.right,bottom:r.bottom},color:c.color,background:c.backgroundColor,search:[...d.querySelectorAll(".resource-picker-search,.resource-picker-search input")].map(e=>({tag:e.tagName,height:e.getBoundingClientRect().height,padding:getComputedStyle(e).padding,margin:getComputedStyle(e).margin,background:getComputedStyle(e).backgroundColor,flex:getComputedStyle(e).flexDirection})),overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.equal(metrics.color,'rgb(255, 255, 255)');assert.equal(metrics.overflow,false);assert(metrics.dialog.left>=0&&metrics.dialog.right<=width&&metrics.dialog.bottom<=1100);report.layouts.push(metrics);await page.screenshot({path:path.join(out,'audio-'+width+'.png')});
 }
 await dialog.getByLabel('搜索资源名称').fill('年幼');assert.equal(await dialog.locator('.resource-picker-item').count(),1);await dialog.getByLabel('搜索资源名称').fill('');
 await dialog.getByRole('button',{name:'选择林音色',exact:true}).click();await dialog.getByRole('button',{name:'确认引用',exact:true}).click();await first.locator('.generation-references audio').waitFor();
 await first.getByRole('button',{name:'保存分镜',exact:true}).click();assert.equal(await page.evaluate(()=>__sbqa.saves.at(-1).updates.generationConfig.references.filter(r=>r.kind==='audio')[0].id),'voice:林:sample-1');
 await first.getByRole('button',{name:'参考音频',exact:true}).click();await dialog.getByRole('button',{name:'选择林音色',exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'选择林音色',exact:true}).getAttribute('aria-pressed'),'true');
 await dialog.getByRole('button',{name:'选择林 · 年幼音色',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await first.locator('.generation-references audio').count(),1);
 await first.getByRole('button',{name:'参考音频',exact:true}).click();
 await page.evaluate(()=>{__voices.voiceProfiles['新增']={manual:{name:'新增',sceneIds:['1-2']},confirmed:{id:'new-audio',url:__voices.voiceProfiles['林'].confirmed.url}};});
 await dialog.getByRole('button',{name:'刷新素材',exact:true}).click();await dialog.getByRole('button',{name:'选择新增音色',exact:true}).waitFor();
 await dialog.getByRole('button',{name:'上传本地素材',exact:true}).click();await dialog.getByRole('button',{name:'选择本地上传.wav',exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'选择本地上传.wav',exact:true}).getAttribute('aria-pressed'),'true');
 await dialog.getByRole('button',{name:'角色',exact:true}).click();assert.equal(await dialog.locator('.resource-picker-item').count(),48);await page.screenshot({path:path.join(out,'characters.png')});
 await dialog.getByRole('button',{name:'确认引用',exact:true}).click();await first.locator('.generation-references audio').nth(1).waitFor();
 await first.getByRole('button',{name:'下载',exact:true}).first().click();assert.equal(await page.evaluate(()=>__sbqa.downloads.at(-1).filename),'1-1-1');
 await first.getByRole('button',{name:'下载',exact:true}).last().click();assert.equal(await page.evaluate(()=>__sbqa.downloads.at(-1).filename),'1-1-1');assert.equal(await page.evaluate(()=>__sbqa.downloads.at(-1).url),'https://example.invalid/video.mp4');
 for(const width of [1280,1502,1700,2232]){
  await page.setViewportSize({width,height:1100});await first.locator('.generation-results').scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  const sizes=await first.locator('.generation-result-grid article').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top,scroll:e.scrollHeight>e.clientHeight+2})));
  assert(sizes.every(r=>Math.max(r.w/r.h,r.h/r.w)<=1.3&&!r.scroll),JSON.stringify({width,sizes}));
  const columns=sizes.filter(r=>Math.abs(r.top-sizes[0].top)<2).length;if(width>=1502)assert(columns>=3);if(width>=2232)assert(columns>=5);
  const single=page.locator('.collab-shot-card').nth(1).locator('.generation-result-grid article');assert.equal(await single.count(),1);const box=await single.boundingBox();assert(box.width<=250&&Math.max(box.width/box.height,box.height/box.width)<=1.3);
  report.layouts.push({width,cards:sizes.map(({w,h,scroll})=>({w,h,scroll})),columns,single:{width:box.width,height:box.height}});await page.screenshot({path:path.join(out,'results-'+width+'.png')});
 }
 await first.getByRole('button',{name:'查看任务提示',exact:true}).hover();await page.getByRole('tooltip').filter({hasText:'隔离任务提示'}).waitFor();await page.keyboard.press('Escape');
 report.checks.push('search; select/save/reopen preserves stable identity; Escape cancels; refresh discovers newly adopted voices; upload auto-selects; image grid; shot download keeps shot label');
 assert.deepEqual(errors,[]);report.passed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{report.error=e.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(e);process.exitCode=1;});

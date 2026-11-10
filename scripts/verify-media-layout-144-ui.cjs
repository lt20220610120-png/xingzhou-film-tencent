// Isolated full React regression: fake cloud rows and tasks, no paid API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5884/';
const out=path.resolve('output/playwright/media-2.8.144');fs.mkdirSync(out,{recursive:true});
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
  window.__sbqa={project:JSON.parse(localStorage.getItem('qa-cloud')||'null')||project,assets,internal,model,state,submits:[],saves:[],mediaDeletes:0,downloads:[],tasks:Array.from({length:7},(_,i)=>({id:'result-'+i,projectId:'sb-qa',kind:'video',shotId:'cloud-shot',shotLabel:'1-1-1',episode:1,scene:'1-1',createdAt:new Date(Date.UTC(2026,10,10,0,i)).toISOString(),status:i===6?'submitted':'success',duration:12,model:'qa-video',prompt:'测试视频',filePath:i===6?undefined:'D:/fixture/video-'+i+'.mp4'}))};
  const empty=async()=>[];
  window.xingzhou={loadState:async()=>state,saveState:async()=>{},loadDirectorProjects:empty,
   authSession:async()=>({id:'qa-owner',username:'qa-owner',roles:['director'],activeRole:'director'}),appVersion:async()=>'2.8.42',storageInfo:async()=>({dataDir:'隔离内存'}),onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),directorCollabListProjects:empty,collabIsProducer:async()=>true,
   collabListProjects:async()=>[structuredClone(__sbqa.project)],collabGetProject:async()=>structuredClone(__sbqa.project),collabListAssets:async()=>structuredClone(assets),collabListMembers:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,
   collabListMedia:async()=>[...structuredClone(internal),{id:'real-voice',projectId:'sb-qa',kind:'audio',episode:1,scene:'1-2',filename:'明确上传的语音.wav',url:'data:audio/wav;base64,UklGRg=='},{id:'foreign-voice',projectId:'foreign',kind:'audio',episode:1,scene:'1-1',filename:'其他项目语音.wav'}],generationList:async()=>structuredClone(__sbqa.tasks),projectVideoExport:async p=>{__sbqa.downloads.push(p);return {completed:p.ids.length,errors:[]};},libtvModelSchema:async()=>structuredClone(model),
   collabPatchStoryboard:async input=>{__sbqa.saves.push(input);const shot=(__sbqa.project.episodes[0].storyboardPrompts||__sbqa.project.episodes[0].prompts).find(p=>p.id===input.shotId);if(input.editPolicy!=='direct'&&JSON.stringify(input.base.generationConfig??null)!==JSON.stringify(shot.generationConfig??null))throw Error('base mismatch');Object.assign(shot,input.updates);shot.generationConfig={...shot.generationConfig,serverNormalized:true};localStorage.setItem('qa-cloud',JSON.stringify(__sbqa.project));return structuredClone(__sbqa.project);},
   generationSubmit:async input=>{__sbqa.submits.push(input);return {id:'fake-task'};},collabDeleteMedia:async()=>{__sbqa.mediaDeletes++;throw Error('禁止删除真实素材');}
  };
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();await page.locator('.collab-episode-card').first().click();
 const first=page.locator('.collab-shot-card').first();await first.locator('.generation-result-grid article').nth(6).waitFor();
 for(const width of [1280,1502,1700,2232,2560]){
  await page.setViewportSize({width,height:1100});await page.waitForTimeout(180);
  const metric=await first.evaluate(el=>{const prompt=el.querySelector('.generation-textarea-wrap').getBoundingClientRect(),refs=el.querySelector('.generation-references').getBoundingClientRect(),controls=el.querySelector('.generation-controls').getBoundingClientRect(),cards=[...el.querySelectorAll('.generation-result-grid article')].map(e=>e.getBoundingClientRect()),firstRow=cards.filter(r=>Math.abs(r.top-cards[0].top)<2).length;return {promptHeight:prompt.height,refsBottom:refs.bottom,controlsBottom:controls.bottom,refGap:refs.top-prompt.bottom,columns:firstRow,cardWidth:cards[0].width};});
  assert(Math.abs(metric.refsBottom-metric.controlsBottom)<3,JSON.stringify({width,...metric}));assert(metric.refGap<15,JSON.stringify(metric));assert(metric.cardWidth<220,JSON.stringify(metric));if(width>=1502)assert(metric.columns>=3);if(width>=2232)assert(metric.columns>=5);
  report.layouts.push({width,...metric});await page.screenshot({path:path.join(out,'storyboard-'+width+'.png')});
 }
 await page.setViewportSize({width:1700,height:1100});
 const before=await first.locator('.generation-textarea-wrap').evaluate(e=>e.getBoundingClientRect().height);
 await first.getByLabel('生成接口',{exact:true}).selectOption('short-qa');await page.waitForTimeout(250);
 const short=await first.locator('.generation-textarea-wrap').evaluate(e=>e.getBoundingClientRect().height);assert(short<before,'shorter controls must release prompt height');
 await first.getByLabel('生成接口',{exact:true}).selectOption('libtv-qa');await page.waitForTimeout(250);
 await page.locator('.collab-rail').getByRole('button',{name:'视频池',exact:true}).click();await page.locator('.video-pool-row').nth(2).waitFor();
 assert.equal(await page.locator('.video-pool-row').count(),3);assert.equal(await page.locator('.video-pool-row .generation-results').count(),0);
 const sizes=await page.locator('.video-pool-row').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert(sizes.every(h=>Math.abs(h-sizes[0])<1));
 await page.getByRole('button',{name:/下载全剧/}).click();assert.deepEqual(await page.evaluate(()=>__sbqa.downloads.at(-1).ids),[{jobId:'result-5'}]);
 await page.getByRole('button',{name:'一键全选',exact:true}).click();await page.getByRole('button',{name:/下载全剧/}).click();assert.equal(await page.evaluate(()=>__sbqa.downloads.at(-1).ids.length),6);
 await page.getByRole('button',{name:'恢复最新',exact:true}).click();
 await page.getByRole('button',{name:'查看 1-1-1 的生成结果',exact:true}).click();const modal=page.getByRole('dialog');await modal.locator('.generation-result-grid article').nth(6).waitFor();assert.equal(await modal.locator('input[type=checkbox]:checked').count(),1);
 await modal.getByRole('button',{name:'一键全选',exact:true}).click();assert.equal(await modal.locator('input[type=checkbox]:checked').count(),6);await modal.getByRole('button',{name:/下载所选/}).click();assert.equal(await page.evaluate(()=>__sbqa.downloads.at(-1).ids.length),6);
 await modal.getByRole('button',{name:'采用最新',exact:true}).click();assert.equal(await modal.locator('input[type=checkbox]:checked').count(),1);
 await modal.getByLabel('选择结果 result-0',{exact:true}).check();await modal.getByRole('button',{name:/下载所选/}).click();assert.deepEqual((await page.evaluate(()=>__sbqa.downloads.at(-1).ids)).map(i=>i.jobId).sort(),['result-0','result-5']);
 await page.screenshot({path:path.join(out,'pool-results.png')});await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,'pool.png')});

 await page.goto(new URL('qa/media-layout-144.html',base).href,{waitUntil:'domcontentloaded'});await page.locator('.libtv-generation-params').waitFor();await page.waitForTimeout(250);
 const composer=page.locator('.generation-composer');const fit=await composer.evaluate(e=>({refs:e.querySelector('.generation-references').getBoundingClientRect().bottom,controls:e.querySelector('.generation-controls').getBoundingClientRect().bottom}));assert(Math.abs(fit.refs-fit.controls)<3,JSON.stringify(fit));
 const wrap=composer.locator('.generation-textarea-wrap'),oldRect=await wrap.boundingBox();await page.mouse.move(oldRect.x+oldRect.width-3,oldRect.y+oldRect.height-3);await page.mouse.down();await page.mouse.move(oldRect.x+oldRect.width-3,oldRect.y+oldRect.height+150,{steps:8});await page.mouse.up();await page.waitForTimeout(100);
 const resized=await composer.evaluate(e=>({prompt:e.querySelector('.generation-textarea-wrap').getBoundingClientRect().height,promptBottom:e.querySelector('.generation-textarea-wrap').getBoundingClientRect().bottom,refTop:e.querySelector('.generation-references').getBoundingClientRect().top,refBottom:e.querySelector('.generation-references').getBoundingClientRect().bottom,controlsBottom:e.querySelector('.generation-controls').getBoundingClientRect().bottom}));assert(resized.prompt>oldRect.height+100,JSON.stringify(resized));assert(resized.refTop>resized.promptBottom);assert(Math.abs(resized.refBottom-resized.controlsBottom)<3,JSON.stringify(resized));await page.screenshot({path:path.join(out,'standalone-resized.png')});report.checks.push('standalone composer: hidden-reference notice and native manual resize preserve bottom alignment without overlap');
 assert.deepEqual(errors,[]);report.passed=true;report.checks.push('compact cards; controls resize prompt; uniform grouped pool; latest default; all and subset export');fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{report.error=e.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(e);process.exitCode=1;});

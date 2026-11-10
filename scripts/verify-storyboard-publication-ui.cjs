// Isolated full React regression: fake cloud rows and tasks, no paid API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5883/';
const out=path.resolve('output/playwright/storyboard-2.8.143');fs.mkdirSync(out,{recursive:true});
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
   collabPatchStoryboard:async input=>{__sbqa.saves.push(input);const shot=(__sbqa.project.episodes[0].storyboardPrompts||__sbqa.project.episodes[0].prompts).find(p=>p.id===input.shotId);if(input.editPolicy!=='direct'&&JSON.stringify(input.base.generationConfig??null)!==JSON.stringify(shot.generationConfig??null))throw Error('base mismatch');Object.assign(shot,input.updates);shot.generationConfig={...shot.generationConfig,serverNormalized:true};localStorage.setItem('qa-cloud',JSON.stringify(__sbqa.project));return structuredClone(__sbqa.project);},
   generationSubmit:async input=>{__sbqa.submits.push(input);return {id:'fake-task'};},collabDeleteMedia:async()=>{__sbqa.mediaDeletes++;throw Error('禁止删除真实素材');}
  };
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();
 await page.locator('.collab-episode-card').first().click();
 const shots=page.locator('.collab-shot-card'),first=shots.nth(0),second=shots.nth(1);
 await first.locator('.generation-references figure').nth(47).waitFor();
 await first.getByLabel('提示词',{exact:true}).fill('第一轮手工内容');
 await first.getByRole('button',{name:'保存分镜',exact:true}).click();
 await page.waitForFunction(()=>__sbqa.saves.length===1);
 await page.waitForTimeout(500);
 await first.getByLabel('提示词',{exact:true}).fill('第二轮手工内容');
 assert.equal(await first.locator('.storyboard-conflict').count(),0);
 await first.getByRole('button',{name:'保存分镜',exact:true}).click();
 await page.waitForFunction(()=>__sbqa.saves.length===2);
 await page.waitForTimeout(500);
 assert.equal(await first.locator('.storyboard-conflict').count(),0);
 assert(!await first.innerText().then(t=>t.includes('base mismatch')));
 await page.evaluate(()=>{const original=window.xingzhou.collabPatchStoryboard;window.xingzhou.collabPatchStoryboard=async p=>{await new Promise(r=>setTimeout(r,450));return original(p);};});
 await first.getByLabel('提示词',{exact:true}).fill('第三轮提交内容');
 await first.getByRole('button',{name:'保存分镜',exact:true}).click();
 await first.getByLabel('提示词',{exact:true}).fill('保存途中继续编辑');
 await page.waitForFunction(()=>__sbqa.saves.length===3);await page.waitForTimeout(600);
 assert.equal(await first.getByLabel('提示词',{exact:true}).inputValue(),'保存途中继续编辑');
 assert.equal(await first.locator('.storyboard-conflict').count(),0);
 await first.getByRole('button',{name:'保存分镜',exact:true}).click();await page.waitForFunction(()=>__sbqa.saves.length===4);await page.waitForTimeout(500);
 assert(!await first.innerText().then(t=>t.includes('base mismatch')));

 // A stale cloud base and the old director conflict metadata cannot block a save or generation.
 await page.evaluate(()=>{const s=__sbqa.project.episodes[0].prompts[0];s.content='其他协作者的较早内容';s.sourceConflict='导演尚未发布的新内容';s.generationConfig={...s.generationConfig,cloudChanged:true};});
 await first.getByLabel('提示词',{exact:true}).fill('直接修改，直接生成');
 await first.getByRole('button',{name:'生成视频',exact:true}).click();
 await page.waitForFunction(()=>__sbqa.submits.length===1);
 assert.equal(await page.evaluate(()=>__sbqa.submits[0].originalPrompt),'直接修改，直接生成');
 assert.equal(await page.evaluate(()=>__sbqa.submits[0].storyboardEdit),true);
 assert.equal(await page.locator('.storyboard-conflict').count(),0);
 // Only an explicit publication changes the default; old local drafts must not replace it.
 await page.evaluate(()=>{const ep=__sbqa.project.episodes[0];ep.storyboardPrompts=structuredClone(ep.prompts).map((s,i)=>({...s,content:'清单新发布默认'+i,sourceContent:'清单新发布默认'+i,storyboardPublicationId:'pub-ui-new',generationConfig:{...s.generationConfig,referenceBindingMode:'storyboard',bindingCompiledPrompt:'清单新发布默认'+i}}));localStorage.setItem('qa-cloud',JSON.stringify(__sbqa.project));});
 await page.getByRole('button',{name:'刷新云端数据',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.collab-shot-card textarea')?.value==='清单新发布默认0');
 await first.getByLabel('提示词',{exact:true}).fill('新发布版本再手改');
 await first.getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>__sbqa.submits.length===2);
 assert.equal(await page.evaluate(()=>__sbqa.submits[1].originalPrompt),'新发布版本再手改');
 assert.equal(await page.locator('.storyboard-conflict').count(),0);
 // Reopen retains the saved manual edit with no confirmation.
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.locator('.collab-shot-card').first().getByLabel('提示词',{exact:true}).waitFor();
 assert.equal(await page.locator('.collab-shot-card').first().getByLabel('提示词',{exact:true}).inputValue(),'新发布版本再手改');

 await page.evaluate(()=>{__sbqa.project.myRole='collaborator';__sbqa.project.episodes[0].storyboardPrompts[0].content='另一位协作者保存的新内容';});
 await page.getByRole('button',{name:'刷新云端数据',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.collab-shot-card textarea')?.value==='另一位协作者保存的新内容');
 await page.locator('.collab-shot-card').first().getByLabel('提示词',{exact:true}).fill('协作者直接改后生成');
 await page.locator('.collab-shot-card').first().getByRole('button',{name:'生成视频',exact:true}).click();await page.waitForFunction(()=>__sbqa.submits.length===1);
 assert.equal(await page.evaluate(()=>__sbqa.submits[0].originalPrompt),'协作者直接改后生成');
 report.checks.push('collaborator sees saved edits after refresh and edits/generates directly without confirmation');
 for(const width of [1280,1700,2232]){await page.setViewportSize({width,height:1100});await page.screenshot({path:path.join(out,'direct-edit-'+width+'.png'),fullPage:false});assert.equal(await page.locator('.storyboard-conflict').count(),0);report.layouts.push({width,conflicts:0});}
 report.checks.push('stale base saves directly; two simulated generations; explicit publish resets default; reopen preserves manual edit');
 assert.deepEqual(errors,[]);report.passed=true;report.checks.push('Two saves reuse actual normalized server acknowledgement; no false cloud conflict');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{report.error=e.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(e);process.exitCode=1;});

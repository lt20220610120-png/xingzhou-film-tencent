// Isolated full React regression: fake cloud rows and tasks, no paid API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5884/';
const out=path.resolve('output/playwright/storyboard-2.8.146');fs.mkdirSync(out,{recursive:true});
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
  const model={id:'qa-video',name:'隔离验收视频模型',kind:'video',maxImages:80,maxAudios:10,maxVideos:10,ratios:['16:9','9:16'],durations:[5,12,15,17,30],resolutions:['480p','720p'],schema:{properties:{modeType:{items:{text2video:[0,0],image2video:[1,80],mixed2video:[0,80]},mixed2videoConfig:{imageMax:80,videoMax:10,audioMax:10}},enableSound:{displayName:'生成音频',enum:['on','off'],default:'on'},search_enabled:{displayName:'联网搜索',min:0,max:1,default:1},validate:{displayName:'自动校验素材',min:0,max:1,default:1}},config:{settings:['enableSound','search_enabled','validate']}}};
  const profiles=[{id:'libtv-qa',provider:'libtv',kind:'video',name:'隔离验收LibTV',model:model.id,endpoint:'https://example.invalid',modelCatalog:[model],capabilities:model},{id:'short-qa',kind:'video',name:'普通短参数模型',model:'qa-short',endpoint:'https://example.invalid/v1',apiKey:'isolated-fixture',videoProtocol:'videos-json',capabilities:{ratios:['16:9'],durations:[5],resolutions:['720p']}}];
  const config={profileId:'libtv-qa',model:model.id,ratio:'16:9',duration:5,resolution:'480p',references:[...valid,...internal]};
  const project={id:'sb-qa',name:'同名项目',owner_id:'qa-owner',myRole:'producer',style:'AI真人',episodes:[{id:'ep1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内\n角色说话。\n1-2 街道 日 外\n角色走路。',prompts:[{id:'cloud-shot',label:'1-1-1',recommendedDurationSeconds:12,content:'云端旧分镜提示词',generationConfig:config},{id:'local-shot',label:'1-1-2',recommendedDurationSeconds:17,content:'旧稿',generationConfig:config},{id:'fresh-shot',label:'1-2-1',content:'新分镜提示词'}]}]};
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
 let serverProject,serverState,serverModel,originalJobs=[],generated=[],queue,hold=false,release;
 const os=require('node:os'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'xz-ui146-'));
 await context.route(base+'__qa/batch',async route=>{try{const {action,payload}=route.request().postDataJSON();let result;
  if(action==='jobs')result=[...originalJobs,...generated];
  else if(action==='list')result=queue?queue.list(payload):[];
  else {if(!queue){serverProject=await page.evaluate(()=>structuredClone(__sbqa.project));serverState=await page.evaluate(()=>structuredClone(__sbqa.state));serverModel=await page.evaluate(()=>structuredClone(__sbqa.model));originalJobs=await page.evaluate(()=>structuredClone(__sbqa.tasks));const merge=require('../cloud-backend/src/storyboard-merge.cjs').patchShot;
   queue=require('../electron/storyboard-batch-host.cjs').createStoryboardBatchHost({directory:tmp,owner:()=>'qa-owner',license:async()=>{},getProject:async()=>structuredClone(serverProject),listMedia:async()=>[],listJobs:()=>[...originalJobs,...generated],getState:()=>serverState,schema:async()=>serverModel,
    patchShot:async p=>{serverProject={...serverProject,episodes:merge(serverProject.episodes,p)};await page.evaluate(p=>{__sbqa.project=p;localStorage.setItem('qa-cloud',JSON.stringify(p));},serverProject);return structuredClone(serverProject);},
    submit:async input=>{if(hold)await new Promise(r=>release=r);await queue.assertDispatch(input);const j={...input,id:'generated-'+generated.length,status:'submitted',remoteStatus:'queued',referenceAccountId:'qa-owner'};generated.push(j);await page.evaluate(n=>window.__nativeSent=n,generated.length);return j;}});
  }result=await queue[action](payload);}
  await route.fulfill({json:result});
 }catch(e){await route.fulfill({status:400,json:{error:e.message}});}});
 await page.addInitScript(()=>{
  const request=async(action,payload)=>{const r=await fetch('/__qa/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
  __sbqa.project.episodes.push({id:'ep2',episodeNumber:2,title:'第二集',content:'2-1 房间 日 内\n人物说话。',prompts:[{id:'new1',label:'2-1-1',content:'第二集第一条'},{id:'new2',label:'2-1-2',content:'第二集第二条'}]});
  __sbqa.tasks=__sbqa.tasks.filter(t=>t.shotId!=='local-shot');
  window.__deletes=[];window.__deleteFail=false;window.__batchStarts=[];window.__nativeSent=0;
  const own=(id,name,userId='qa-owner')=>({id,projectId:'sb-qa',userId,kind:'audio',note:'参考素材 1-1-1',filename:name,url:'https://example.invalid/'+id+'.wav'});
  __uploads.push(own('wrong','上传错了.wav'),own('right','正确上传.wav'),own('foreign','他人上传.wav','another'));
  xingzhou.collabDeleteMedia=async p=>{__deletes.push(p);if(__deleteFail){__deleteFail=false;throw Error('隔离删除失败');}__uploads=__uploads.filter(m=>m.id!==p.mediaId);return {ok:true};};
  xingzhou.storyboardBatchStart=async p=>{__batchStarts.push(p);return request('start',p)};xingzhou.storyboardBatchList=p=>request('list',p);xingzhou.storyboardBatchStop=p=>request('stop',p);xingzhou.storyboardBatchResume=p=>request('resume',p);const oldJobs=xingzhou.generationList;xingzhou.generationList=async()=>{const rows=await request('jobs',{});return rows.length?rows:oldJobs();};
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();await page.locator('.collab-episode-card').first().click();
 const first=page.locator('.collab-shot-card').first(),panel=page.getByRole('region',{name:'分镜批量生成'});
 const tools=page.getByRole('region',{name:'生成工作台',exact:true}),toggle=tools.getByRole('button',{name:/生成工作台/}).first();
 assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 await toggle.click();assert.equal(await tools.getByLabel('默认生成接口').isVisible(),false);assert.ok(await tools.evaluate(el=>el.getBoundingClientRect().height)<64);
 await toggle.focus();await page.keyboard.press('Enter');assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 await toggle.click();await page.reload();await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.locator('.collab-rail').getByRole('button',{name:'分镜',exact:true}).click();if(await page.locator('.collab-episode-card').count())await page.locator('.collab-episode-card').first().click();await tools.waitFor();assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();
 assert.equal(await tools.getByRole('button',{name:'按建议时长设置',exact:true}).count(),1);assert.equal(await tools.getByRole('button',{name:'一键生成',exact:true}).count(),1);
 report.checks.push('one collapsible top generation workbench contains profiles, parameters, recommended timing and batch generation; compact under64px, keyboard toggle and reload persistence pass');

 await first.getByRole('button',{name:'参考音频',exact:true}).click();const picker=page.getByRole('dialog',{name:'选择项目参考素材'});await picker.getByRole('button',{name:'选择上传错了.wav',exact:true}).waitFor();
 assert.equal(await picker.getByRole('button',{name:'删除林音色',exact:true}).count(),0);assert.equal(await picker.getByRole('button',{name:'删除他人上传.wav',exact:true}).count(),0);
 const trash=picker.getByRole('button',{name:'删除上传错了.wav',exact:true});await trash.click();let confirm=page.getByRole('dialog',{name:'删除上传素材'});await confirm.waitFor();await page.keyboard.press('Escape');assert.equal(await picker.isVisible(),true);assert.equal(await page.evaluate(()=>__deletes.length),0);
 await picker.getByRole('button',{name:'选择上传错了.wav',exact:true}).click();await picker.getByRole('button',{name:'确认引用',exact:true}).click();await first.locator('.generation-references audio').waitFor();await first.getByRole('button',{name:'参考音频',exact:true}).click();await trash.click();await page.evaluate(()=>__deleteFail=true);await confirm.getByRole('button',{name:'确认删除',exact:true}).click();await confirm.getByRole('alert').filter({hasText:'隔离删除失败'}).waitFor();assert.equal(await trash.count(),1);await confirm.getByRole('button',{name:'确认删除',exact:true}).click();await confirm.waitFor({state:'hidden'});assert.equal(await trash.count(),0);await picker.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await first.locator('.generation-references audio').count(),0);
 report.checks.push('own uploaded reference delete only; adopted/foreign protected; Escape cancels nested confirm; delete failure retries; successful deletion survives picker Cancel and clears live draft');
 await page.getByLabel('批量生成范围').selectOption('scene');
 await first.getByText('建议生成时长 12 秒',{exact:true}).waitFor();
 await page.getByRole('button',{name:'按建议时长设置',exact:true}).click();
 await page.getByRole('status').filter({hasText:'已按建议设置 2 条'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(__sbqa.project.episodes[0].storyboardPrompts||__sbqa.project.episodes[0].prompts).slice(0,2).map(s=>s.generationConfig.duration)),[12,17]);
 assert.equal(await page.locator('.collab-shot-card').nth(1).getByLabel('提示词',{exact:true}).inputValue(),'本地未保存的新稿');
 assert.equal(await first.getByLabel('时长',{exact:true}).inputValue(),'12');
 await page.getByLabel('默认生成接口',{exact:true}).selectOption('short-qa');
 await page.getByRole('button',{name:'按建议时长设置',exact:true}).click();
 await page.getByRole('status').filter({hasText:'2 条当前模型不支持'}).waitFor();
 await first.getByRole('button',{name:'生成视频',exact:true}).click();
 await first.getByRole('alert').filter({hasText:'不支持建议时长 12'}).waitFor();
 assert.equal(await page.evaluate(()=>__sbqa.submits.length),0);
 await page.getByLabel('批量生成范围').selectOption('project');
 await page.getByRole('button',{name:'按建议时长设置',exact:true}).click();
 await page.getByRole('status').filter({hasText:'3 条缺少建议'}).waitFor();
 await page.getByLabel('默认生成接口',{exact:true}).selectOption('libtv-qa');
 await page.getByRole('button',{name:'应用到全剧',exact:true}).click();
 await page.waitForFunction(()=>(__sbqa.project.episodes[0].storyboardPrompts||__sbqa.project.episodes[0].prompts)[0].generationConfig.durationMode==='uniform');
 assert.equal(await first.getByLabel('时长',{exact:true}).inputValue(),'5');
 report.checks.push('recommended duration badge restored; exact12/17 seconds applied by scene without changing dirty prompt; unsupported model blocks paid submission; whole-drama missing recommendations reported; uniform mode restored');
 await page.getByLabel('批量生成范围').selectOption('scene');await page.getByRole('button',{name:'一键生成',exact:true}).click();const batchConfirm=page.getByRole('dialog',{name:'确认批量生成'});await batchConfirm.waitFor();await batchConfirm.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.evaluate(()=>__batchStarts.length),0);
 await page.getByRole('button',{name:'一键生成',exact:true}).click();await batchConfirm.getByRole('button',{name:'确认并开始',exact:true}).click();await page.waitForFunction(()=>__nativeSent===1);await queue.idle();assert.deepEqual(generated.map(j=>j.shotId),['local-shot']);assert.equal(generated[0].duration,5);assert.equal(generated[0].originalPrompt,'本地未保存的新稿');
 generated[0].remoteStatus='running';await page.getByText('生成中',{exact:false}).first().waitFor();generated[0].status='success';await page.getByText('完成 100%',{exact:true}).waitFor();
 const dirtyEditor=page.locator('.collab-shot-card').nth(1).getByLabel('提示词',{exact:true});await dirtyEditor.fill('新手改，不应被历史批次清掉');
 await page.getByLabel('批量生成范围').selectOption('episode');await page.getByRole('button',{name:'一键生成',exact:true}).click();await batchConfirm.getByRole('button',{name:'确认并开始',exact:true}).click();await page.waitForFunction(()=>__nativeSent===2);await queue.idle();assert.equal(generated[1].shotId,'fresh-shot');generated[1].status='success';assert.equal(await dirtyEditor.inputValue(),'新手改，不应被历史批次清掉');
 hold=true;await page.getByLabel('批量生成范围').selectOption('project');await page.getByRole('button',{name:'一键生成',exact:true}).click();await batchConfirm.getByRole('button',{name:'确认并开始',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.storyboard-batch-counts')?.textContent.includes('准备中'));await page.getByRole('button',{name:'停止发送',exact:true}).click();hold=false;release();await queue.idle();await page.getByRole('button',{name:'继续发送',exact:true}).waitFor();assert.equal(generated.length,2);await page.getByRole('button',{name:'继续发送',exact:true}).click();await page.waitForFunction(()=>__nativeSent===4);await queue.idle();assert.deepEqual(generated.slice(2).map(j=>j.shotId),['new1','new2']);
 for(const j of generated)j.status='success';await page.getByText('完成 100%',{exact:true}).waitFor();
 for(const width of [1280,1700,2232]){await page.setViewportSize({width,height:1100});await page.locator('.storyboard-batch').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'batch-'+width+'.png')});}
 report.checks.push('actual native queue host + backend storyboard merge through isolated bridge: scene/episode/drama scopes; skip success; confirm cancel no send; dirty draft preserved; queued/running/success progress; stop/resume unsent; no duplicate paid simulation; three widths');
 assert.deepEqual(errors,[]);report.generated=generated.map(j=>({shotId:j.shotId,duration:j.duration,status:j.status}));report.passed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();fs.rmSync(tmp,{recursive:true,force:true});console.log(JSON.stringify(report));
})().catch(async e=>{report.error=e.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(e);process.exitCode=1;});

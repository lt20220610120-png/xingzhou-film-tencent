// Isolated production React verification. All generation requests are mocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.XZ_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5802/',out=path.resolve('output/playwright/missing-creative-2.8.45');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={checks:[],realApiCalls:0};
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1600,height:1050}});
 await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project','missing-qa');localStorage.setItem('xz-collab-last-section','assets');localStorage.setItem('xz-director-last-project','creative-qa');localStorage.setItem('xz-director-last-pane','ep7');
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5+MAAAAASUVORK5CYII=';
  const scene='7-1 大厅 日 内\n人物：凯尔、哥哥\n（1）\n凯尔：Thank you, brother.\n'+('哥哥点头，凯尔握住哥哥的手。'.repeat(400))+'\nSCENE_ONE_TAIL：两人一起走向窗边。';
  const ep={id:'ep7',title:'第7集',kind:'episode',episodeNumber:7,content:scene+'\n\n7-2 花园 夜 外\nSCENE_TWO_ONLY：哥哥独自等待。',prompts:[],quickSceneEdits:{'7-1':'QUICK_ONLY_SHORT_EDIT：快速模式局部改写'}};
  const episodes=[...Array.from({length:6},(_,i)=>({id:'ep'+(i+1),title:`第${i+1}集`,kind:'episode',episodeNumber:i+1,content:`${i+1}-1 房间 日 内\n前集正文。`,prompts:[]})),ep];
  const director={id:'creative-qa',name:'创造模式整场输入验收',style:'真人电影级',aspectRatio:'16:9',masterScript:episodes.map(e=>e.title+'\n'+e.content).join('\n\n'),episodes,promptHistory:[]};
  const project={id:'missing-qa',name:'93项资产未生成筛选验收',owner_id:'owner',myRole:'producer',style:'AI真人',episodes:[{id:'e1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内\n人物出场。'}],analysis_progress:{}};
  const description=id=>`${id}。男性，视觉年龄30岁，脸型椭圆，五官：黑眼睛、直鼻梁、薄嘴唇；身形修长。服装：蓝色长袖上衣、黑色长裤、布鞋。`;
  const row=(id,name,done,category='character')=>({id,name,category,description:description(id),episodes:[1],first_episode:1,images:done?[{id:'image-'+id,url:image}]:[]});
  const assets=[...Array.from({length:90},(_,i)=>row('QA_ASSET_'+i,`【人物${i}-常服】`,i<84)),row('QA_HERO_BASE','【主角-常服】',true),row('QA_HERO_B','【主角-雨衣】',false),row('QA_HERO_C','【主角-制服】',false),row('QA_SCENE_DONE','【室内】',true,'scene'),row('QA_SCENE_MISSING','【室外】',false,'scene'),row('QA_PROP_DONE','【旧道具】',true,'prop'),row('QA_PROP_MISSING','【新道具】',false,'prop')];
  const state={directorProjects:[director],apiProfiles:[{id:'wrong-model',name:'其他模型',model:'other'},{id:'chosen-model',name:'用户指定模型',model:'chosen'}],activeApiId:'wrong-model',skills:[{id:'wrong-skill',name:'其他规则',content:'WRONG_SKILL_DO_NOT_USE'},{id:'chosen-skill',name:'用户完整导演Skill',importMethod:'skill-folder',content:'SELECTED_SKILL_MAIN：按场景编号输出镜头提示词。',files:[{path:'references/camera.md',content:'SELECTED_CAMERA_RULE：保持轴线与光线连续。'}]}],mediaProfiles:[{id:'image-model',kind:'image',name:'模拟图片接口',model:'gpt-image-1',endpoint:'https://example.invalid/v1',apiKey:'fixture'}],activeImageApiId:'image-model'};
  window.__qa={saved:state,project,assets,scene,imageCalls:[],attachedIds:[],aiCalls:[],resolvers:[],blankNext:false};const empty=async()=>[];
  const save=s=>{__qa.saved=structuredClone(s);};
  window.xingzhou={loadState:async()=>structuredClone(__qa.saved),saveState:async s=>save(s),loadDirectorProjects:async()=>structuredClone(__qa.saved.directorProjects),saveDirectorProjects:async rows=>save({...__qa.saved,directorProjects:rows}),authSession:async()=>({id:'owner',username:'owner',roles:['director'],activeRole:'director'}),appVersion:async()=>'2.8.45',storageInfo:async()=>({dataDir:'隔离内存'}),onUpdateProgress:()=>()=>{},onMediaTaskStatus:()=>()=>{},checkUpdate:async()=>({configured:false}),generationList:empty,directorCollabListProjects:empty,collabIsProducer:async()=>true,
   collabListProjects:async()=>[structuredClone(project)],collabGetProject:async()=>structuredClone(project),collabListAssets:async()=>structuredClone(__qa.assets),collabListMembers:empty,collabListMedia:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,artReviewSaveLocal:async()=>{},
   mediaGenerateImage:async p=>{const id=p.prompt.match(/QA_ASSET_\d+/)?.[0];__qa.imageCalls.push(p);if(id==='QA_ASSET_87')throw Error('模拟单项失败');return {filePath:'C:/isolated/mock-image.png'};},collabAttachGeneratedAssetImage:async p=>{__qa.attachedIds.push(p.assetId);const img={id:'new-'+p.assetId,url:image};__qa.assets.find(a=>a.id===p.assetId).images=[img];return img;},
   aiChat:async p=>{__qa.aiCalls.push(structuredClone(p));if(__qa.blankNext){__qa.blankNext=false;return ' ';}return new Promise(resolve=>__qa.resolvers.push(resolve));}
  };
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.locator('.collab-rail').getByRole('button',{name:'资产',exact:true}).click();
 const filter=page.getByRole('button',{name:/^只看未生成/});await filter.waitFor();assert.match(await filter.innerText(),/8/);
 await page.getByLabel('选择 【人物0-常服】 批量生成',{exact:true}).check();
 await filter.click();assert.equal(await filter.getAttribute('aria-pressed'),'true');assert.equal(await page.getByLabel('选择 【人物0-常服】 批量生成',{exact:true}).count(),0);
 const outfit=page.getByRole('navigation',{name:'主角 服装选择',exact:true});assert.equal(await outfit.getByRole('button').count(),2);assert.doesNotMatch(await outfit.innerText(),/常服/);
 assert.equal(await page.getByRole('navigation',{name:'全剧资产快速定位',exact:true}).locator('.asset-locator-items>button').count(),7);
 await page.getByLabel('搜索全剧资产',{exact:true}).fill('人物87');assert.equal(await page.locator('.art-character-group').count(),1);await page.getByLabel('搜索全剧资产',{exact:true}).fill('');
 await page.screenshot({path:path.join(out,'01-missing-only.png')});
 await page.getByRole('button',{name:'一键生成人物（8）',exact:true}).click();
 await page.getByRole('button',{name:'一键生成人物（1）',exact:true}).waitFor();
 assert.match(await filter.innerText(),/1/);assert.equal(await page.locator('.art-character-group').count(),1);assert.match(await page.locator('.art-character-group').innerText(),/人物87/);
 const generated=await page.evaluate(()=>({calls:__qa.imageCalls.length,ids:__qa.attachedIds}));assert.equal(generated.calls,8);assert.deepEqual([...generated.ids].sort(),['QA_ASSET_84','QA_ASSET_85','QA_ASSET_86','QA_ASSET_88','QA_ASSET_89','QA_HERO_B','QA_HERO_C']);
 await filter.click();assert.equal(await page.getByRole('navigation',{name:'主角 服装选择',exact:true}).getByRole('button').count(),3);
 await filter.click();
 for(const category of ['场景','道具']){await page.locator('.asset-library-workbench .collab-cat-tabs').getByRole('button',{name:category,exact:true}).click();assert.match(await filter.innerText(),/1/);assert.equal(await page.locator('.art-workbench-row').count(),1);}
 for(const width of [1120,1280,1600,2048]){await page.setViewportSize({width,height:1050});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.evaluate(()=>{__qa.assets.find(a=>a.id==='QA_PROP_MISSING').images=[{id:'uploaded-externally',url:__qa.assets[0].images[0].url}];});
 await page.getByText('刷新云端数据',{exact:true}).click();await page.getByText('当前分类已全部生成图片',{exact:true}).waitFor();
 await page.getByRole('button',{name:'只看未生成（0）',exact:true}).click();assert.equal(await page.locator('.art-workbench-row').count(),2);
 report.checks.push('93个人物妆造中只显示8项未生成，定位/妆造/搜索一致；模拟批量仅发8项，已生成的隐藏勾选不参与；成功7项自动消失、失败1项保留；场景/道具筛选及1120–2048px通过');
 await page.getByRole('button',{name:'导演工作台',exact:true}).click();await page.getByRole('button',{name:'创造模式',exact:true}).click();
 const left=page.getByLabel('当前场景剧本内容',{exact:true}),vision=page.getByLabel('导演构想',{exact:true});
 assert.match(await left.innerText(),/SCENE_ONE_TAIL/);assert.doesNotMatch(await left.innerText(),/QUICK_ONLY_SHORT_EDIT/);
 await page.getByRole('combobox',{name:'本集提示词模型',exact:true}).selectOption('chosen-model');await page.locator('.creative-generation-controls .mode-skill-picker select').selectOption('chosen-skill');
 const intent='导演构想ONE：冷色侧逆光，先双人全景，再缓推哥哥近景。';await vision.fill(intent);await page.getByRole('button',{name:'生成场景 7-1 提示词',exact:true}).click();await page.waitForFunction(()=>__qa.aiCalls.length===1);
 const call=await page.evaluate(()=>__qa.aiCalls[0]),messages=call.messages.map(m=>m.content).join('\n');assert.equal(call.profileId,'chosen-model');assert.match(messages,/SELECTED_SKILL_MAIN/);assert.match(messages,/SELECTED_CAMERA_RULE/);assert.doesNotMatch(messages,/WRONG_SKILL/);assert.ok(messages.includes(await page.evaluate(()=>__qa.scene)));assert.ok(messages.includes(intent));assert.match(messages,/16:9/);assert.doesNotMatch(messages,/QUICK_ONLY_SHORT_EDIT|SCENE_TWO_ONLY/);
 await page.locator('.creative-scene-rail').getByRole('button',{name:/场景 7-2/}).click();await vision.fill('导演构想TWO：暖色远景，固定机位。');await page.getByRole('button',{name:'生成场景 7-2 提示词',exact:true}).click();await page.waitForFunction(()=>__qa.aiCalls.length===2);
 await page.evaluate(()=>__qa.resolvers[1]('7-2-1\n暖色远景，哥哥在花园等待。'));await page.waitForFunction(()=>__qa.saved.directorProjects[0].episodes.find(e=>e.id==='ep7').prompts.some(p=>p.sceneLabel==='7-2'));
 await page.evaluate(()=>__qa.resolvers[0]('7-1-1\n冷色侧逆光，凯尔握住哥哥的手。'));await page.waitForFunction(()=>__qa.saved.directorProjects[0].episodes.find(e=>e.id==='ep7').prompts.length===2);
 await page.locator('.creative-scene-rail').getByRole('button',{name:/场景 7-1/}).click();assert.equal(await vision.inputValue(),intent);assert.match(await page.locator('.creative-prompt-results').innerText(),/冷色侧逆光/);assert.doesNotMatch(await page.locator('.creative-prompt-results').innerText(),/暖色远景/);
 const saved=await page.evaluate(()=>__qa.saved.directorProjects[0]);assert.equal(saved.promptHistory.length,2);const first=saved.episodes.find(e=>e.id==='ep7').prompts.find(p=>p.sceneLabel==='7-1');assert.ok(first.sourceText.includes(await page.evaluate(()=>__qa.scene)));assert.ok(first.sourceText.includes(intent));assert.equal(first.generationMode,'creative');
 await page.evaluate(()=>__qa.blankNext=true);await page.getByRole('button',{name:'生成场景 7-1 提示词',exact:true}).click();await page.getByRole('alert').filter({hasText:'模型未返回有效提示词'}).waitFor();assert.equal(await page.evaluate(()=>__qa.saved.directorProjects[0].episodes.find(e=>e.id==='ep7').prompts.length),2);
 await page.screenshot({path:path.join(out,'02-creative-result.png')});
 report.checks.push('创造模式实际API消息含完整场景末尾+导演拍法+所选Skill/附件+所选模型及画幅，排除快速编辑与其他场景；并发回包反序仍正确归场景/历史，空回包报错不写假结果');
 assert.deepEqual(errors,[]);report.passed=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async error=>{report.error=error.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page){report.alerts=await page.getByRole('alert').allTextContents().catch(()=>[]);report.debug=await page.evaluate(()=>({images:__qa.imageCalls,calls:__qa.aiCalls.length})).catch(()=>null);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}await browser?.close();console.error(error);process.exitCode=1;});

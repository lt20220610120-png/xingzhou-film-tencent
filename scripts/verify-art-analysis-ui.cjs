// Full React production build, isolated local fixtures; all generation is mocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.XZ_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5802/';
const out=path.resolve('output/playwright/art-analysis-2.8.43');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={checks:[],realApiCalls:0};
(async()=>{
 const {defaultComposedAssetPromptPrefix,serializeComposedAssetPrompt}=await import('../core/artImageComposition.js');
 const animal={category:'character',name:'【旺财-狗】',description:'主体类型：生物；物种：犬。四足，黄褐短毛、垂耳、黑鼻、尾巴弯曲。'};
 const oldDescription=serializeComposedAssetPrompt({mode:'single',composition:'project',prefix:defaultComposedAssetPromptPrefix(animal,'AI真人','single','portrait-five'),content:animal.description});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({oldDescription})=>{
  const episodes=[1,2,3].map(n=>({id:'ep-'+n,title:`第${n}集`,episodeNumber:n,content:`${n}-1 布鲁克林街道 日 外\n杰伊和流浪狗旺财经过魔法工会。`}));
  const project={id:'art-analysis-qa',name:'魔法零工隔离验收',owner_id:'qa-owner',myRole:'producer',style:'AI真人',genre:'',image_composition:'portrait-five',episodes,script:'故事发生在架空现代纽约，魔法工业化。\n'+episodes.map(e=>e.content).join('\n')+'\n'+('城市魔网与职业许可。'.repeat(2600))+'\n尾段：纽约多种族群像，人物族群未逐一说明。',analysis_progress:{}};
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5+MAAAAASUVORK5CYII=';
  const assets=[{id:'dog',category:'character',name:'【旺财-狗】',description:oldDescription,first_episode:1,episodes:[1,2,3],sceneIds:['1-1','2-1','3-1'],images:[]}];
  const state={directorProjects:[],apiProfiles:[{id:'analysis-model',name:'隔离验收分析模型',model:'mock-analysis',endpoint:'https://example.invalid',apiKey:'fixture'}],activeApiId:'analysis-model',mediaProfiles:[{id:'image-model',kind:'image',name:'隔离验收生图模型',model:'mock-image',endpoint:'https://example.invalid',apiKey:'fixture'}],activeImageApiId:'image-model'};
  if(!localStorage.getItem('art-qa-ready')){localStorage.clear();localStorage.setItem('art-qa-ready','1');localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project',project.id);localStorage.setItem('xz-collab-last-section','info');}
  window.__artqa={project,assets:[],seedDogAsset:assets[0],state,calls:[],images:[],saveCalls:[],publishCalls:[],blockPublication:false,firstWorldFailure:true,firstInventoryFailure:true,mappingBad:true,detailMissing:true,ledger:JSON.parse(localStorage.getItem('qa-art-ledger')||'null'),cancelled:[]};
  const world={background:'架空现代纽约，魔法已工业化、城市化；工会管理职业许可和城市魔网',era:'现代，架空纽约的布鲁克林、曼哈顿、皇后区',population:'纽约多种族群像；具体人物未明确族群，待核对',tone:'都市奇幻、魔法职场、隐藏身份、底层零工逆袭',warnings:['具体人物族群未明确，请在核实时注意。']};
  const inventory=n=>`### 第${n}集\n人物：\n- ${n===3?'【小黑-猫】':'【旺财-狗】'}${n===3?'':'主体类型：生物；物种：犬。黄毛、四足、完整尾巴。'}\n场景：\n- 无\n道具：\n- 无`;
  const mapping=n=>JSON.stringify({scenes:[{sceneId:`${n}-1`,assets:[{category:'character',name:n===3?'【小黑-猫】':'【旺财-狗】'}]}]});
  const empty=async()=>[];
  window.xingzhou={loadState:async()=>structuredClone(state),saveState:async()=>{},loadDirectorProjects:empty,authSession:async()=>({id:'qa-owner',username:'qa-owner',roles:['director'],activeRole:'director'}),appVersion:async()=>'2.8.43',storageInfo:async()=>({dataDir:'隔离内存'}),onUpdateProgress:()=>()=>{},onMediaTaskStatus:()=>()=>{},checkUpdate:async()=>({configured:false}),generationList:empty,directorCollabListProjects:empty,collabIsProducer:async()=>true,
   collabListProjects:async()=>[structuredClone(__artqa.project)],collabGetProject:async()=>structuredClone(__artqa.project),collabListAssets:async()=>structuredClone(__artqa.assets),collabListMembers:empty,collabListMedia:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,
   artReviewLoadLocal:async()=>structuredClone(__artqa.ledger),artReviewSaveLocal:async p=>{__artqa.ledger=structuredClone(p.data);localStorage.setItem('qa-art-ledger',JSON.stringify(p.data));},cancelAiTask:async p=>{__artqa.cancelled.push(p.taskId)},
   collabArtReviewSave:async p=>{__artqa.saveCalls.push(p.episodeNumber);if(__artqa.blockPublication)throw Error("Error invoking remote method 'collab-art-review-save': Error: 分集编号无法可靠解析、相互矛盾或重复，请核对原文编号");const old=__artqa.project.analysis_progress[p.episodeNumber]?.review;if(old?.lastWriteId===p.writeId)return structuredClone(old);if((old?.version||0)!==p.baseVersion)throw Error('核实版本冲突');const saved={...structuredClone(p.data),version:p.baseVersion+1,lastWriteId:p.writeId};__artqa.project.analysis_progress[p.episodeNumber]={review:saved};return structuredClone(saved);},
   collabArtReviewPublish:async p=>{__artqa.publishCalls.push(p.episodeNumber);const old=__artqa.project.analysis_progress[p.episodeNumber]?.review;if(old?.lastWriteId===p.writeId)return structuredClone(old);if(old.version!==p.baseVersion)throw Error('发布版本冲突');const saved={...structuredClone(old),version:old.version+1,lastWriteId:p.writeId};for(const id of p.sceneIds){const s=saved.scenes.find(s=>s.id===id);const signature=JSON.stringify([s.id,s.source,s.items.map(i=>[i.id,i.category,i.name,i.description,i.ready,...(i.detailStatus?[i.detailStatus]:[])])]);if(s.approval.signature!==signature)throw Error('尚未核实');saved.published[id]={...structuredClone(s),signature};for(const item of s.items){let asset=__artqa.assets.find(a=>a.name===item.name);if(!asset){asset={id:'published-'+item.id,category:item.category,name:item.name,description:item.description,first_episode:item.firstEpisode||p.episodeNumber,episodes:[],images:[]};__artqa.assets.push(asset);}asset.episodes=[...new Set([...asset.episodes,p.episodeNumber])];}}__artqa.project.analysis_progress[p.episodeNumber]={review:saved};return structuredClone(saved);},
   collabUpdateProject:async p=>{Object.assign(__artqa.project,p.updates);return structuredClone(__artqa.project)},collabUpdateAsset:async p=>{const a=__artqa.assets.find(a=>a.id===p.assetId);Object.assign(a,p.updates||p);return structuredClone(a)},
   mediaGenerateImage:async p=>{__artqa.images.push(p);return {filePath:'C:/isolated/dog.png'}},collabAttachGeneratedAssetImage:async()=>{const row={id:'new-dog-image',url:image};__artqa.assets[0].images=[row];return row;},
   aiChat:async p=>{
    const text=p.messages.map(m=>m.content).join('\n');
    if(p.messages[0].content.startsWith('你是影视美术世界观分析员')){__artqa.calls.push({type:'world',text});if(__artqa.firstWorldFailure){__artqa.firstWorldFailure=false;throw Error('临时连接失败')}return {ok:true,output:JSON.stringify(world)}}
    if(text.includes('requestedItems')){__artqa.calls.push({type:'details',text});const data=JSON.parse(p.messages[1].content).untrustedData;if(__artqa.detailMissing){__artqa.detailMissing=false;return {ok:true,output:'{"items":[]}'}}return {ok:true,output:JSON.stringify({items:data.requestedItems.map(i=>({...i,description:'主体类型：生物；物种：'+(i.name.includes('猫')?'猫':'犬')+'。四足、短毛、黑鼻、尾巴弯曲。'}))})}}
    if(p.messages[0].content.startsWith('你是场记')){__artqa.calls.push({type:'mapping',text});if(__artqa.mappingBad){__artqa.mappingBad=false;return {ok:true,output:mapping(2).replace('【旺财-狗】','【不在清单的狗】')}}return {ok:true,output:mapping(2)}}
    const n=Number(p.messages[0].content.match(/当前输出只包含第(\d+)集/)?.[1]||1);
    __artqa.calls.push({type:'episode',episode:n,text});
    if(text.includes('本次只补齐对应表'))return {ok:true,output:'【逐场资产对应表】\n'+mapping(n)};
    const output=inventory(n)+(n===2?'':'\n【逐场资产对应表】\n'+mapping(n));
    if(n===1&&__artqa.firstInventoryFailure){__artqa.firstInventoryFailure=false;return {ok:false,error:'清单输出截断',output}}
    return {ok:true,output};
   }
  };
 },{oldDescription});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'项目协作',exact:true}).click();await page.locator('.collab-rail').getByRole('button',{name:'信息读取',exact:true}).click();
 await page.getByRole('region',{name:'自动分析的剧本背景'}).waitFor();
 assert.equal(await page.getByLabel('剧本题材与时代',{exact:true}).count(),0);assert.equal(await page.getByText('内置美术规则',{exact:true}).count(),0);
 await page.screenshot({path:path.join(out,'01-info-before.png')});
 await page.getByRole('button',{name:'分析 / 继续未完成',exact:true}).click();
 await page.getByText(/全剧背景 · 自动补全第 1 次/).waitFor();
 await page.getByRole('button',{name:'停止分析',exact:true}).click();
 await page.getByRole('button',{name:'分析 / 继续未完成',exact:true}).waitFor();
 const stopped=await page.evaluate(()=>__artqa.calls.length);await page.waitForTimeout(2300);assert.equal(await page.evaluate(()=>__artqa.calls.length),stopped);
 report.checks.push('自动重试等待可立即停止，停止后不再请求API，进度保留');
 await page.getByRole('button',{name:'分析 / 继续未完成',exact:true}).click();
 await page.waitForFunction(()=>__artqa.ledger?.analysisRun?.status==='complete',{},{timeout:45000});
 const counts=await page.evaluate(()=>({types:__artqa.calls.map(c=>c.type),episodes:__artqa.calls.filter(c=>c.type==='episode').map(c=>c.episode),context:__artqa.ledger.scriptContext,genre:__artqa.project.genre,records:Object.values(__artqa.ledger.episodes).map(r=>({n:r.episodeNumber,status:r.status,failure:r.failure})),notes:__artqa.ledger.analysisRun.notes}));
 report.debug=counts;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 assert.equal(counts.context.complete,true);assert.ok(counts.context.chunks.length>=2);assert.match(counts.genre,/架空现代纽约/);assert.ok(counts.records.every(r=>r.status==='generated'&&!r.failure));assert.deepEqual(counts.episodes,[1,1,2,2,3]);assert.equal(counts.types.filter(t=>t==='details').length,2);
 assert.ok(counts.notes.some(n=>n.includes('自动修复')));assert.equal(await page.getByRole('region',{name:'自动分析的剧本背景'}).getByText(/纽约/).count()>0,true);
 await page.locator('.art-config-status summary').click();await page.screenshot({path:path.join(out,'02-analysis-complete.png')});
 const count=await page.evaluate(()=>__artqa.calls.length);await page.getByRole('button',{name:'分析 / 继续未完成',exact:true}).click();await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>__artqa.calls.length),count);
 report.checks.push('一次启动完成3集：解析完整但截断的清单重试、错名关联重试、漏描述自动补齐，完整结果不重复请求；全文背景分段缓存并保存云genre');
 await page.evaluate(()=>{__artqa.assets=[__artqa.seedDogAsset]});
 await page.getByText('刷新云端数据',{exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'美术',exact:true}).click();await page.locator('.collab-episode-card').first().click();
 const mode=page.getByLabel('人物构图模式',{exact:true}).first();assert.equal(await mode.inputValue(),'creature');assert.ok((await mode.locator('option').allTextContents()).includes('生物多视图'));
 await page.getByText('编辑前置',{exact:false}).first().click();
 const prefix=await page.getByLabel('生图前置',{exact:true}).first().inputValue();assert.match(prefix,/完整三视图/);assert.doesNotMatch(prefix,/同一人物|无头正面躯干/);
 await page.screenshot({path:path.join(out,'03-creature-default.png')});
 await page.getByRole('button',{name:'生成图片',exact:true}).first().click();
 await page.waitForFunction(()=>__artqa.images.length===1);const prompt=await page.evaluate(()=>__artqa.images[0].prompt);assert.match(prompt,/不要出现任何人物/);assert.match(prompt,/不要场景/);assert.doesNotMatch(prompt,/同一人物|4格统一排版|无头正面躯干/);
 report.checks.push('旧五格自动人像狗卡打开即选生物多视图；单张模拟生成使用白底正/侧/背三视图，无人像前置');
 await page.evaluate(()=>{__artqa.assets[0].images=[]});
 await page.getByText('刷新云端数据',{exact:true}).click();
 await page.getByLabel('选择 【旺财-狗】 批量生成',{exact:true}).check();
 await page.getByRole('button',{name:'一键生成（1）',exact:true}).click();
 await page.waitForFunction(()=>__artqa.images.length===2);
 const batchPrompt=await page.evaluate(()=>__artqa.images[1].prompt);assert.match(batchPrompt,/完整三视图/);assert.doesNotMatch(batchPrompt,/同一人物|4格统一排版|无头正面躯干/);
 report.checks.push('批量一键生成同样使用生物前置，无需人工切换构图');

 await page.locator('.collab-rail').getByRole('button',{name:'清单核实',exact:true}).click();
 await page.getByRole('button',{name:'核实全部…',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'确认核实',exact:true}).click();
 await page.waitForFunction(()=>Object.values(__artqa.ledger.episodes).every(r=>r.scenes.every(s=>s.approval)));
 await page.evaluate(()=>{__artqa.blockPublication=true});
 const publishAll=()=>page.getByRole('button',{name:/^发布全部已核实/}).click();
 await publishAll();await page.getByRole('dialog').getByRole('button',{name:'确认并发布',exact:true}).click();
 await page.waitForFunction(()=>__artqa.ledger.episodes[1].syncError);
 assert.equal(await page.evaluate(()=>__artqa.saveCalls.length),1);
 await page.evaluate(()=>{__artqa.blockPublication=false});
 await publishAll();await page.getByRole('dialog').getByRole('button',{name:'确认并发布',exact:true}).click();
 await page.waitForFunction(()=>Object.values(__artqa.ledger.episodes).every(r=>!r.pending&&Object.keys(r.published).length===r.scenes.length));
 assert.deepEqual(await page.evaluate(()=>__artqa.publishCalls),[1,2,3]);
 await page.screenshot({path:path.join(out,'04-fast-publish-complete.png')});
 await page.locator('.collab-rail').getByRole('button',{name:'美术',exact:true}).click();
 if(await page.locator('.collab-episode-card').count())await page.locator('.collab-episode-card').first().click();
 await page.getByLabel('人物构图模式',{exact:true}).first().waitFor();
 assert.equal(await page.getByText(/Error invoking remote method/).count(),0);
 report.checks.push('全部核实→全集发布→美术资产显示；项目级拒绝只请求一次，修复后原核实清单直接恢复并完成3集发布');

 for(const width of [1280,2048]){await page.setViewportSize({width,height:1100});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
 assert.deepEqual(errors,[]);delete report.debug;report.passed=true;report.callTypes=counts.types;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{report.error=e.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page){report.messages=await page.locator('.collab-error').allTextContents().catch(()=>[]);report.mockImages=await page.evaluate(()=>__artqa.images);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}if(browser)await browser.close();console.error(e);process.exitCode=1;});

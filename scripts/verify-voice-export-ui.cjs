// Full React production build, isolated local fixtures; all generation is mocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.XZ_PLAYWRIGHT_MODULE||'C:/Users/11599/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.XZ_QA_URL||'http://127.0.0.1:5842/';
const out=path.resolve('output/playwright/art-analysis-2.8.44');fs.mkdirSync(out,{recursive:true});
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
 await page.evaluate(()=>{__artqa.assets=[{...__artqa.seedDogAsset,images:[{id:'i',url:'data:image/png;base64,AA=='}]}];__artqa.ledger={episodes:Object.fromEntries(__artqa.project.episodes.map(e=>[e.episodeNumber,{sourceContent:e.content,scenes:[{id:e.episodeNumber+'-1',source:e.content,items:[{category:'character',name:'【杰伊-日常】',description:'青年男性'}],removed:[]}],voiceAnalysis:{sourceContent:e.content,scenes:[{sceneId:e.episodeNumber+'-1',speakers:[{key:'杰伊',name:'杰伊',quote:'回来。'}]}]}}])),voiceProfiles:{杰伊:{confirmed:{id:'voice',filePath:'D:/voice.wav',kind:'audio'}}}};window.xingzhou.collabExportImages=async p=>{window.__exported=p;};});
 await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.locator('.collab-rail').getByRole('button',{name:'美术',exact:true}).click();
 for(const [label,layout] of [['按集整理导出','episode'],['按场景整理导出','scene']]){
  await page.getByRole('button',{name:'导出整部剧图片',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();
  await page.getByRole('dialog',{name:'选择是否导出对应音频'}).waitFor();await page.getByRole('button',{name:'图片和对应音频一起导出',exact:true}).click();await page.waitForFunction(()=>!!window.__exported);
  const payload=await page.evaluate(()=>{const p=window.__exported;window.__exported=null;return p;});assert.equal(payload.layout,layout);assert(payload.images.some(r=>r.kind==='audio'));report.checks.push(label+': audio included');
 }
 for(const width of [1280,1700,2232]){await page.setViewportSize({width,height:1100});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report));await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});

// Start the production preview on 127.0.0.1:5192 before running. All APIs use isolated fixtures.
let playwright;try{playwright=require('playwright');}catch{playwright=require(require('node:path').join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const {chromium}=playwright;
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {createInitialState}=await import('../core/projectStore.js');
 const models=require('../core/feituo-models.json');
 const full=models.find(m=>m.kind==='video'&&m.maxVideos===3&&m.maxAudios===3&&!m.protocol);
 const initial={...createInitialState(),activeApiId:'qa-ai',apiProfiles:[{id:'qa-ai',name:'测试AI',model:'test'}],activeVideoApiId:'qa',mediaProfiles:[{id:'qa',name:'测试接口',kind:'video',endpoint:'https://media.test',capabilities:{maxImages:20,maxVideos:3,maxAudios:3},model:full.id,apiKey:'offline-test'}]};
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(({initial})=>{
  const key='xingzhou-film-v1';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));
  const image='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="74"><rect width="96" height="74" fill="teal"/></svg>';
  window.xingzhou={
   loadState:async()=>JSON.parse(localStorage.getItem('qa-disk')||localStorage.getItem(key)),saveState:async s=>localStorage.setItem('qa-disk',JSON.stringify(s)),loadDirectorProjects:async()=>null,saveDirectorProjects:async()=>{},
   authSession:async()=>({id:'qa',isAdmin:true,name:'测试用户',roles:['director'],activeRole:'director'}),collabIsProducer:async()=>false,
   adminListUsers:async()=>[],adminListInvites:async()=>[],adminWorkflowList:async()=>[],adminWorkflowFolder:async()=> 'C:/QA/输出',adminWorkflowCreate:async input=>{localStorage.setItem('qa-workflow',JSON.stringify(input));return {id:'wf'};},generationList:async()=>[],storageInfo:async()=>({dataDir:'测试目录'}),appVersion:async()=>'2.4.0',checkUpdate:async()=>({}),onMediaTaskStatus:()=>()=>{},
   importFullScript:async()=>({fileName:'全剧提示词.docx',content:'文档说明\n【1-1-1】\n 第一条完整原文\n镜头细节 \n【1-1-1】重复第二条【1-2-4】跳场景【3-1-1】第三集'}),
   generationImportEpisodeMedia:async({mode,episode})=>({count:mode==='series'?4:3,warnings:[],episodes:mode==='series'?{'1':[{id:'i',kind:'image',name:'角色.png',url:image},{id:'v',kind:'video',name:'动作.mp4',url:'https://media.test/clip.mp4'},{id:'a',kind:'audio',name:'对白.wav',url:'https://media.test/voice.wav'}],'3':[{id:'c',kind:'image',name:'第三集.png',url:image}]}:{[episode]:[{id:'i',kind:'image',name:'角色.png',url:image},{id:'v',kind:'video',name:'动作.mp4',url:'https://media.test/clip.mp4'},{id:'a',kind:'audio',name:'对白.wav',url:'https://media.test/voice.wav'}]}}),
   generationSubmit:async input=>{const calls=JSON.parse(localStorage.getItem('qa-calls')||'[]');calls.push(input);localStorage.setItem('qa-calls',JSON.stringify(calls));},
  };
 },{initial});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://media.test/**',route=>route.fulfill({status:200,body:''}));
 await page.goto('http://127.0.0.1:5192');
 await page.getByRole('button',{name:'图视生成',exact:true}).click();
 await page.getByRole('button',{name:'整本提示词与素材',exact:true}).click();
 await page.getByRole('button',{name:'上传整本提示词',exact:true}).click();
 await page.getByRole('button',{name:'1-1-1',exact:true}).waitFor();
 assert.equal(await page.getByLabel('提示词',{exact:true}).inputValue(),'\n 第一条完整原文\n镜头细节 \n');
 assert.equal(await page.locator('.prompt-book-entries button').count(),2);
 assert.equal(await page.locator('.generation-references figure').count(),0);
 assert.equal(await page.locator('.generation-references .collab-add-ref').count(),0);
 assert.deepEqual(await page.getByLabel('提示词集数',{exact:true}).locator('option').allTextContents(),['第 1 集','第 3 集']);
 await page.getByRole('button',{name:'导入本集文件夹',exact:true}).click();
 await page.getByRole('button',{name:'移除角色.png',exact:true}).waitFor();
 await page.getByLabel('模型',{exact:true}).selectOption(JSON.stringify(['qa',full.id]));
 assert.equal(await page.locator('.generation-references figure').count(),3);
 await page.getByLabel('提示词',{exact:true}).fill('第一条修改');
 await page.getByRole('button',{name:'移除角色.png',exact:true}).click();
 assert.equal(await page.locator('.generation-references figure').count(),2);
 await page.getByRole('button',{name:'移除对白.wav',exact:true}).click();
 await page.locator('.prompt-book-media-details summary').click();
 await page.getByRole('button',{name:'恢复素材 角色.png',exact:true}).click();
 await page.getByRole('button',{name:'移除角色.png',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'移除对白.wav',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'已保留素材 角色.png',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'1-1-1（1）',exact:true}).click();
 assert.equal(await page.locator('.generation-references figure').count(),3);
 await page.getByRole('button',{name:'1-1-1',exact:true}).click();
 assert.equal(await page.locator('.generation-references figure').count(),2);
 assert.equal(await page.getByLabel('提示词',{exact:true}).inputValue(),'第一条修改');
 await page.waitForFunction(()=>{const b=JSON.parse(localStorage.getItem('qa-disk')||'{}').generationWorkflow?.books?.[0];return b?.drafts?.['1-1-1:0']?.excludedIds?.join(',')==='a';});
 await page.reload();await page.getByRole('button',{name:'图视生成',exact:true}).click();
 await page.getByRole('button',{name:'1-1-1',exact:true}).waitFor();
 assert.equal(await page.locator('.generation-references figure').count(),2);
 await page.locator('.prompt-book-media-details summary').click();
 fs.mkdirSync('output/playwright',{recursive:true});
 for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`output/playwright/restore-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.getByRole('button',{name:'恢复素材 对白.wav',exact:true}).click();
 await page.getByRole('button',{name:'移除对白.wav',exact:true}).waitFor();
 assert.equal(await page.locator('.generation-references figure').count(),3);
 await page.getByRole('button',{name:'管理后台',exact:true}).click();
 await page.getByRole('tab',{name:'制作工作流总控'}).click();
 const create=page.getByRole('button',{name:'保存预设并创建工作流',exact:true});
 assert(await create.isDisabled());
 await page.getByRole('button',{name:'运行预跑检查',exact:true}).click();
 assert(await create.isDisabled());
 await page.getByLabel('工作流视频模型',{exact:true}).selectOption(JSON.stringify(['qa',full.id]));
 await page.getByRole('button',{name:'选择输出目录',exact:true}).click();
 await page.getByLabel('本项目提示词、图片选择已人工核对',{exact:true}).check();
 await page.getByRole('button',{name:'运行预跑检查',exact:true}).click();
 assert(await create.isEnabled());
 await page.getByLabel('默认视频秒数',{exact:true}).fill('30');
 assert(await create.isDisabled());
 await page.getByRole('button',{name:'运行预跑检查',exact:true}).click();
 assert(await create.isEnabled());
 await page.getByLabel(/^运行终点/).selectOption('edit');
 await page.getByRole('button',{name:'运行预跑检查',exact:true}).click();
 assert(await create.isDisabled());
 await page.getByLabel(/^运行终点/).selectOption('archive');
 await page.getByRole('button',{name:'运行预跑检查',exact:true}).click();
 await create.click();
 await page.waitForFunction(()=>localStorage.getItem('qa-workflow'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workflow')));
 assert.equal(saved.settings.model,full.id);assert.equal(saved.settings.duration,30);assert.equal(saved.settings.preflightVersion,1);assert.equal(saved.settings.endStage,'archive');
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'output/playwright/workflow-2864.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS single restore + workflow model selection, preflight, invalidation, endpoint guard and saved settings');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

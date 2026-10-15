const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/11599/AppData/Local/OpenAI/Codex/runtimes/cua_node/a9ba6825a525118c/bin/node_modules/playwright');
const out=path.resolve('output/playwright/episode2840');fs.mkdirSync(out,{recursive:true});
let browser,page;const errors=[],report={realApiCalls:0,checks:[]};
(async()=>{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:5798/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const project={id:'episode2840-qa',name:'重复24集隔离验收',owner_id:'qa-owner',style:'AI真人',genre:'现代都市',myRole:'producer',episodes:[{id:'e1',title:'第1集',episodeNumber:1,content:'1-1 房间 日 内\n林舟站在房间。'},{id:'a',title:'第24集 A版',episodeNumber:24,content:'24-1 原稿A完整对白\nA'.repeat(80)},{id:'b',title:'第24集 B版',episodeNumber:24,content:'24-1 原稿B完整对白\nB'.repeat(80)}],analysis_progress:{}};
  const rows=[{id:'prop',name:'【旧道具】',category:'prop',episodes:[24],first_episode:24,description:'保存的道具描述',images:[]}],calls=[];
  window.__qa={project,calls};
  localStorage.clear();localStorage.setItem('xz-role','director');localStorage.setItem('xz-collab-last-project',project.id);localStorage.setItem('xz-collab-last-section','info');
  const empty=async()=>[];
  window.xingzhou={loadState:async()=>({directorProjects:[],apiProfiles:[],mediaProfiles:[]}),saveState:async()=>{},loadDirectorProjects:empty,saveDirectorProjects:async()=>{},authSession:async()=>({id:'qa-owner',username:'qa-owner',roles:['director'],activeRole:'director'}),storageInfo:async()=>({dataDir:'隔离内存'}),appVersion:async()=>'2.8.40',generationList:empty,directorCollabListProjects:empty,
   collabIsProducer:async()=>true,collabListProjects:async()=>[structuredClone(project)],collabGetProject:async()=>structuredClone(project),collabListAssets:async()=>structuredClone(rows),collabListMembers:empty,collabListMedia:empty,collabListMessages:empty,collabListGroups:empty,analysisLoad:async()=>null,artReviewLoadLocal:async()=>null,artReviewSaveLocal:async()=>{},onMediaTaskStatus:()=>()=>{},onUpdateProgress:()=>()=>{},checkUpdate:async()=>({configured:false}),
   collabArtReviewGet:async()=>({episodes:{}}),
   collabResolveEpisodeIdentity:async payload=>{calls.push(structuredClone(payload));if(JSON.stringify(payload.baseEpisodes)!==JSON.stringify(project.episodes))throw Error('分集已变动，请刷新');const original=project.episodes[payload.index];if(payload.operation==='select-primary'){const rejected=project.episodes.filter((e,i)=>e.episodeNumber===original.episodeNumber&&i!==payload.index);project.episodes=project.episodes.filter(e=>!rejected.includes(e));original.episodeIdentityHistory=rejected.map(episode=>({at:new Date().toISOString(),reason:'select-primary',episode}));}else if(payload.operation==='edit'){project.episodes[payload.index]={...original,episodeNumber:payload.episodeNumber,title:payload.title,content:payload.content,episodeIdentityHistory:[...(original.episodeIdentityHistory||[]),{at:new Date().toISOString(),reason:'edit',episode:original}]};}else{project.episodes.splice(payload.index,1);project.episodes[0].episodeIdentityHistory=[...(project.episodes[0].episodeIdentityHistory||[]),{at:new Date().toISOString(),reason:'remove',episode:original}];}return structuredClone(project);}
  };
 });
 await page.goto('http://127.0.0.1:5798/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'项目协作',exact:true}).click();
 await page.getByText('分集编号待核对，项目已正常打开',{exact:true}).waitFor();
 for(const name of ['信息读取','清单核实','美术','资产','分镜','项目群']){await page.locator('.collab-rail').getByRole('button',{name,exact:true}).click();await page.getByText('分集编号待核对，项目已正常打开',{exact:true}).waitFor();}
 report.checks.push('重复24集打开完整协作工作区，所有已授权分区均可进入，原资产保留');
 await page.locator('.collab-rail').getByRole('button',{name:'清单核实',exact:true}).click();
 await page.locator('.episode-identity-issue .episode-identity-version').nth(1).locator('summary').click();
 await page.locator('.episode-identity-issue .episode-identity-version').nth(1).getByRole('button',{name:'选为第 24 集主稿',exact:true}).click();
 await page.waitForFunction(()=>__qa.calls.length===1);await page.getByText('分集历史版本（1 条，供查阅，不参与当前分集分析）',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>__qa.calls[0].index),2);assert.equal(await page.evaluate(()=>__qa.project.episodes.length),2);
 await page.locator('.episode-identity-history>summary').click();await page.locator('.episode-identity-history>details>summary').click();
 assert.match(await page.locator('.episode-identity-history pre').innerText(),/原稿A完整对白/);
 report.checks.push('主动单击B稿立即选主稿，A稿历史完整可查，无新确认弹窗');
 await page.screenshot({path:path.join(out,'01-primary-history.png')});
 await page.locator('.episode-identity-checks>summary').click();await page.locator('.episode-identity-all>summary').click();
 const version=page.locator('.episode-identity-all .episode-identity-version').nth(1);await version.locator('summary').click();await version.getByRole('button',{name:'编辑集号、标题与正文'}).click();
 await page.getByLabel('版本2集号',{exact:true}).fill('25');await page.getByLabel('版本2标题',{exact:true}).fill('第25集 修订稿');await page.getByLabel('版本2正文',{exact:true}).fill('25-1 已核对完整修订正文');await page.getByRole('button',{name:'保存分集修改',exact:true}).click();
 await page.waitForFunction(()=>__qa.calls.length===2&&__qa.project.episodes[1].episodeNumber===25);
 report.checks.push('编辑集号、标题、完整正文使用原数组快照与原始索引，原稿留历史');
 await page.screenshot({path:path.join(out,'02-edited.png')});
 const edited=page.locator('.episode-identity-all .episode-identity-version').nth(1);if(!(await edited.getAttribute('open'))&&await edited.locator('button').first().isHidden())await edited.locator('summary').click();await edited.getByRole('button',{name:'移出当前分集并保留历史'}).click();
 await page.waitForFunction(()=>__qa.calls.length===3&&__qa.project.episodes.length===1);report.checks.push('移出当前分集保留历史');
 await page.evaluate(()=>{__qa.project.myRole='artist';});await page.locator('.collab-rail').getByRole('button',{name:'资产',exact:true}).click();await page.locator('.collab-rail').getByRole('button',{name:'刷新云端数据'}).click();await page.getByText('当前角色只读。请由项目制片选择主稿、修改集号或移入历史。',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'编辑集号、标题与正文',exact:true}).count(),0);report.checks.push('只读角色无处理按钮但历史可看');
 await page.setViewportSize({width:900,height:800});await page.screenshot({path:path.join(out,'03-readonly-900.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);report.passed=true;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(async error=>{report.error=error.stack;report.pageErrors=errors;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(browser)await browser.close();console.error(error);process.exitCode=1;});



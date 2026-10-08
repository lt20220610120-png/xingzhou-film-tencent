// Activated only by the release verifier. Real profiles and project files are never opened.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function configurePackagedSmoke(app) {
  const root = process.env.XINGZHOU_SMOKE_TEST_ROOT;
  if (!root) return false;
  if (!path.isAbsolute(root)) throw new Error('Smoke test root must be absolute');
  globalThis.fetch = async () => { throw new Error('Network disabled during packaged smoke test'); };
  for (const key of ['appData', 'userData', 'documents', 'temp']) {
    const dir = path.join(root, key); fs.mkdirSync(dir, { recursive: true }); app.setPath(key, dir);
  }
  const report = { version: app.getVersion(), errors: [] };
  const finish = (success) => { clearTimeout(deadline); report.success = success; fs.writeFileSync(path.join(root,'report.json'), JSON.stringify(report,null,2)); app.exit(success ? 0 : 1); };
  const deadline = setTimeout(() => { report.errors.push('Startup timed out'); finish(false); }, 25000);
  process.on('uncaughtException', error => { report.errors.push(error.stack || error.message); finish(false); });
  process.on('unhandledRejection', error => { report.errors.push(String(error)); finish(false); });
  app.whenReady().then(() => {
    const { session } = require('electron');
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (_, done) => done({cancel:true}));
  });
  app.on('browser-window-created', (_, win) => {
    win.webContents.on('did-fail-load', (_, code, description) => { report.errors.push(`Load failed ${code} ${description}`); finish(false); });
    win.webContents.once('did-finish-load', async () => {
      try {
        const JSZip = require('jszip');
        const zip = new JSZip();
        zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>行舟安装包验证</w:t></w:r></w:p></w:body></w:document>');
        const buffer = await zip.generateAsync({type:'nodebuffer'});
        const result = await require('mammoth').extractRawText({buffer});
        report.docxImport = result.value.trim() === '行舟安装包验证';
        const creatorContent = '第17集\n17-1 旧书店 日 内\n人物：林舟\n△归还旧包。\n林舟：记忆仍在。';
        const creatorBuffer = require('./creator-documents.cjs').buildCreatorDocument({name:'创作终稿',content:creatorContent,format:'docx'});
        const creatorRoundTrip = await require('mammoth').extractRawText({buffer:creatorBuffer});
        report.creatorWorkspace = {docxRoundTrip:creatorRoundTrip.value.replace(/\n\n/g,'\n').trim() === creatorContent,
          bridge:await win.webContents.executeJavaScript("['saveCreatorDocument','importCreatorVideo','loadState','saveState'].every(name=>typeof window.xingzhou?.[name]==='function')")};
        const { pathToFileURL } = require('node:url');
        const ip = await import(pathToFileURL(path.join(__dirname,'../core/ipWorkspace.js')).href);
        const { IP_BUILTIN_SKILLS } = await import(pathToFileURL(path.join(__dirname,'../core/ipBuiltinSkills.js')).href);
        const { archiveCreatorProject } = await import(pathToFileURL(path.join(__dirname,'../core/creatorWorkspace.js')).href);
        const worldEngine=await import(pathToFileURL(path.join(__dirname,'../world-simulation/engine.js')).href);
        const {putWorld}=await import(pathToFileURL(path.join(__dirname,'../core/worldSimulationAdapter.js')).href);
        const {normalizeState}=await import(pathToFileURL(path.join(__dirname,'../core/projectStore.js')).href);
        const world=worldEngine.createWorld({characters:[{id:'hero',name:'安装包测试人物'}]},{source:{projectId:'world-smoke'}});
        const worldProject=putWorld({id:'world-smoke',name:'世界保存验收',creator:{mode:'framework'},episodes:[{id:'old',result:'原正文'}]},world);
        await win.webContents.executeJavaScript(`window.xingzhou.saveState(${JSON.stringify(normalizeState({scriptProjects:[worldProject]}))})`);
        const restoredWorld=await win.webContents.executeJavaScript('window.xingzhou.loadState()');
        const loadedProject=normalizeState(restoredWorld).scriptProjects.find(p=>p.id==='world-smoke');
        report.worldSimulation={module:true,localRoundTrip:worldEngine.branchState(loadedProject.creator.worldSimulation.worlds[0]).characters.hero.name==='安装包测试人物',originalBody:loadedProject.episodes[0].result==='原正文'};
        let ipState = ip.createIPProject({fruitProjects:[],scriptProjects:[],scriptLibrary:[]},{name:'安装包 IP 验证',duration:60});
        const ipId = ipState.fruitProjects[0].id;
        const novel = '第一章 归还\r\n女主归还包。\r\n第二章 相识\r\n两人相识。';
        ipState = ip.importIPNovel(ipState,ipId,{name:'验证小说.txt',content:novel});
        const chapters = ip.getIPProject(ipState,ipId).creator.ip.source.chapters;
        // Synthetic nodes verify storage and duration validation, not a claim
        // that this tiny fixture contains enough story for fifty real episodes.
        const smokeEpisode = {chapterIds:chapters.map(c=>c.id),outline:'归还后相识'};
        let rejectsUndersized=false;
        try{ip.applyIPPlan(ipState,ipId,{episodes:[smokeEpisode]});}catch(error){rejectsUndersized=/至少50集/.test(error.message);}
        ipState = ip.applyIPPlan(ipState,ipId,{episodes:Array.from({length:50},()=>({...smokeEpisode}))});
        const ipEpisode = ip.getIPProject(ipState,ipId).episodes[1];
        ipState = ip.updateIPDraft(ipState,ipId,ipEpisode.id,creatorContent);
        ipState = archiveCreatorProject(ipState,ipId);
        const ipArchived = ipState.scriptLibrary[0].content;
        ipState = ip.updateIPDraft(ipState,ipId,ipEpisode.id,'收录后继续修改');
        report.ipLibrary = {
          durationFloor:rejectsUndersized && ip.getIPProject(ipState,ipId).creator.ip.plan.episodes.length===50,
          builtinFiles:IP_BUILTIN_SKILLS.map(skill=>skill.files.length + (skill.content ? 1 : 0)),
          chapterMapping:ip.ipOriginal(ip.getIPProject(ipState,ipId),ip.getIPProject(ipState,ipId).episodes[1]) === novel,
          snapshot:ipState.scriptLibrary[0].content === ipArchived && ipArchived.includes(creatorContent),
          textDecoding:require('./text-import.cjs').decodeImportText(Buffer.from([0xd6,0xd0,0xce,0xc4])).content === '中文'
        };
        report.geminiWeb = {modulesLoad:typeof require('./gemini-web.cjs').createGeminiWebService==='function' && typeof require('./gemini-shutdown.cjs').createGeminiQuitHandler==='function',bridge:await win.webContents.executeJavaScript("['geminiWebStatus','geminiWebOpenLogin','geminiWebModels'].every(name=>typeof window.xingzhou?.[name]==='function')")};
        report.doubaoWork = {modulesLoad:typeof require('./doubao-work.cjs').createDoubaoWorkService==='function',bridge:await win.webContents.executeJavaScript("['doubaoWorkStatus','doubaoWorkOpenLogin','doubaoWorkModels'].every(name=>typeof window.xingzhou?.[name]==='function')")};
        report.chatgptWeb={modulesLoad:typeof require('./chatgpt-web.cjs').createChatGPTWebService==='function',bridge:await win.webContents.executeJavaScript("['chatgptWebStatus','chatgptWebOpenLogin','chatgptWebModels'].every(name=>typeof window.xingzhou?.[name]==='function')")};
        const helper = fs.readFileSync(path.join(__dirname, 'workbuddy-archive.py'), 'utf8');
        report.workBuddy = { helperBundled: helper.includes('def extract(') && helper.includes('sqlite3') && helper.includes('--inspect-data'), modulesLoad: typeof require('./workbuddy-panel.cjs').createWorkBuddyPanel === 'function' && typeof require('./workbuddy-service.cjs').createWorkBuddyService === 'function' && typeof require('./workbuddy-update.cjs').createWorkBuddyUpdater === 'function' };
        for (let attempt=0;attempt<30;attempt++) {
          await new Promise(resolve => setTimeout(resolve,250));
          report.page = await win.webContents.executeJavaScript('({ title: document.title, text: document.body.innerText.slice(0,1500), bridge: typeof window.xingzhou?.appVersion === "function", roles: document.querySelectorAll(".studio-role").length })');
          if(report.page.roles===2) break;
        }
        const mediaDir=path.join(root,'documents','行舟影视资料','画布素材','整本提示词素材');
        fs.mkdirSync(mediaDir,{recursive:true});
        const files=['图片.png','音频.wav','视频.mp4'].map((name,index)=>{
          const file=path.join(mediaDir,name);
          fs.writeFileSync(file,index===0?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3ZtqsAAAAASUVORK5CYII=','base64'):Buffer.from([index,1,2,3]));
          return `xzmedia:///${encodeURIComponent(file)}`;
        });
        const {net}=require('electron');
        const results=await Promise.all(files.map(async url=>{try{const response=await net.fetch(url);return {status:response.status,length:(await response.arrayBuffer()).byteLength};}catch(error){return {error:String(error)};}}));
        const image=await win.webContents.executeJavaScript(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({loaded:true,width:img.naturalWidth});img.onerror=()=>resolve({loaded:false});img.src=${JSON.stringify(files[0])};})`);
        report.localMedia={results,image};
        report.workBuddy.bridge = await win.webContents.executeJavaScript('typeof window.xingzhou?.workBuddyOpen === "function" && typeof window.xingzhou?.onWorkBuddyState === "function"');
        report.artReview = await win.webContents.executeJavaScript(`(async () => {
          const api = window.xingzhou;
          const bridge = ['artReviewLoadLocal','artReviewSaveLocal','collabArtReviewSave','collabArtReviewPublish'].every(name => typeof api?.[name] === 'function');
          if (!bridge) return {bridge, localRoundTrip:false};
          const projectId = 'packaged-art-review-smoke';
          await api.artReviewSaveLocal({projectId,data:{episodes:{1:{state:'睡衣',pending:true}}}});
          const restored = await api.artReviewLoadLocal({projectId});
          return {bridge,localRoundTrip:restored?.episodes?.[1]?.state === '睡衣' && restored.episodes[1].pending === true};
        })()`);
        const {safeStorage}=require('electron');
        const sessionDir=path.join(root,'encrypted-session-check');
        fs.mkdirSync(sessionDir,{recursive:true});
        const sessionFile=path.join(sessionDir,'cloud-session.json');
        fs.writeFileSync(sessionFile,JSON.stringify({token:'synthetic-smoke-token',account:{id:'synthetic'}}));
        const secureStore=require('./session-store.cjs').createSessionStore(sessionDir,safeStorage);
        const restored=secureStore.read();
        win.webContents.openDevTools({mode:'bottom',activate:false});
        await new Promise(resolve=>setTimeout(resolve,100));
        report.security={
          systemEncryption:safeStorage.isEncryptionAvailable(),
          migrated:restored?.token==='synthetic-smoke-token' && !fs.readFileSync(sessionFile,'utf8').includes('synthetic-smoke-token'),
          ipcGenerationDenied:await win.webContents.executeJavaScript("window.xingzhou.aiChat({prompt:'synthetic no-login test'}).then(()=>false,error=>/登录/.test(error.message))"),
          csp:await win.webContents.executeJavaScript("!!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')?.content.includes(\"script-src 'self'\")"),
          sandbox:win.webContents.getLastWebPreferences().sandbox===true,
          devToolsDisabled:!win.webContents.isDevToolsOpened(),
        };
        const {session}=require('electron');
        session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)}));
        await win.webContents.executeJavaScript("new Promise(resolve=>{const frame=document.createElement('iframe');frame.id='security-canvas-check';frame.onload=()=>resolve(true);frame.onerror=()=>resolve(false);frame.src='xzapp://canvas/index.html#/canvas';document.body.append(frame);setTimeout(()=>resolve(false),5000);})");
        const embedded=win.webContents.mainFrame.frames.find(frame=>frame.url.startsWith('xzapp://canvas/index.html'));
        if(embedded){
          for(let attempt=0;attempt<20;attempt++){
            const status=await embedded.executeJavaScript("({rendered:document.body.innerText.length>10,bridge:typeof window.xingzhou,title:document.title,body:document.body.innerText.slice(0,100)})");
            report.canvasDiagnostics=status;
            if(status.rendered){report.security.canvasEmbedded=status.bridge==='undefined';break;}
            await new Promise(resolve=>setTimeout(resolve,100));
          }
        }
        report.security.canvasEmbedded=report.security.canvasEmbedded===true;
        if(!embedded)report.canvasDiagnostics={frames:win.webContents.mainFrame.frames.map(frame=>frame.url)};
        await win.webContents.executeJavaScript("document.querySelector('#security-canvas-check')?.remove()");
        finish(Object.values(report.security).every(Boolean) && Object.values(report.worldSimulation).every(Boolean) && report.docxImport && report.creatorWorkspace.docxRoundTrip && report.creatorWorkspace.bridge && report.ipLibrary.durationFloor && report.ipLibrary.builtinFiles.join(',') === '9,3' && report.ipLibrary.chapterMapping && report.ipLibrary.snapshot && report.ipLibrary.textDecoding && report.geminiWeb.modulesLoad && report.geminiWeb.bridge && report.chatgptWeb.modulesLoad && report.chatgptWeb.bridge && report.doubaoWork.modulesLoad && report.doubaoWork.bridge && report.workBuddy.helperBundled && report.workBuddy.modulesLoad && report.workBuddy.bridge && report.artReview.bridge && report.artReview.localRoundTrip && report.page.bridge && report.page.roles === 2 && results.every(item=>item.status===200&&item.length>0) && image.loaded && report.errors.length === 0);
      } catch (error) { report.errors.push(error.stack || error.message); finish(false); }
    });
  });
  return true;
};

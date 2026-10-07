const { app, BrowserWindow, WebContentsView, session, dialog, ipcMain: rawIpcMain, protocol, net, shell, safeStorage } = require('electron');
const path = require('path');
app.setName('行舟影视（腾讯云版）');
app.setAppUserModelId('com.xingzhou.film.tencent');

const { spawn } = require('child_process');
const fs = require('fs');
const isPackagedSmoke = require('./packaged-smoke.cjs')(app);
const { pathToFileURL } = require('url');
const mammoth = require('mammoth');
const { saveCreatorDocument, importCreatorVideo, loadCreatorStateWithBackup } = require('./creator-documents.cjs');
const { downloadInstaller, verifyInstaller } = require('./update-service.cjs');
const { fetchUpdateManifest } = require('./update-manifest.cjs');
const { TRUSTED_MANIFEST_URL, validateManifest, newerVersion } = require('./update-trust.cjs');
const { requestText, testTextConnection } = require('./text-provider.cjs');
const { createGeminiWebService } = require('./gemini-web.cjs');
const { createChatGPTWebService } = require('./chatgpt-web.cjs');
const { createDoubaoWorkService } = require('./doubao-work.cjs');
const { createGeminiQuitHandler } = require('./gemini-shutdown.cjs');
const { generateImage, generateVideo, retryImageDownload } = require('./media-service.cjs');
const { readMediaBytes, configureMediaCache } = require('./media-network.cjs');
const { createCosImageCache } = require('./cos-image-cache.cjs');
const { createAssetImagePreview } = require('./asset-image-preview.cjs');
const { discoverModels } = require('./model-discovery.cjs');
const { importMediaFiles } = require('./media-import.cjs');
const { importEpisodeMedia, importEpisodeFiles, deleteEpisodeMedia } = require('./episode-media-import.cjs');
const { exportImagesToFolder } = require('./image-export.cjs');
const { createCloudAccessService } = require('./cloud-access-service.cjs');
const { createCollabService } = require('./collab-service.cjs');
const { createWorkBuddyService } = require('./workbuddy-service.cjs');
const { createWorkBuddyUpdater } = require('./workbuddy-update.cjs');
const { createWorkBuddyPanel, assertTrustedFrame } = require('./workbuddy-panel.cjs');
const isDev = !app.isPackaged;
const {createSecureIpc,safeExternalUrl,protectWindow,canvasPage}=require('./ipc-security.cjs');
const ipcMain=createSecureIpc({ipcMain:rawIpcMain,getWindow:()=>mainWindow,entryFile:path.join(__dirname,'../dist/index.html'),isDev:isDev&&!isPackagedSmoke,getAccessService:()=>accessService,onIdentityChange:()=>{for(const controller of activeAiRequests.values())controller.abort();}});
if (!isDev) app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'storage-config.json');
const defaultDataDir = () => path.join(app.getPath('documents'), '行舟影视资料');
let accessService, geminiWebService, doubaoWorkService,chatgptWebService;
const getChatGPTWeb=()=>chatgptWebService||(chatgptWebService=createChatGPTWebService({profileDir:path.join(app.getPath('userData'),'chatgpt-browser')}));
const chatgptRun=(config,options)=>getChatGPTWeb().request(config,options);
for(const [channel,method] of Object.entries({'chatgpt-web-status':'status','chatgpt-web-login':'openLogin','chatgpt-web-models':'listModels'}))ipcMain.handle(channel,event=>{assertTrustedFrame(event,mainWindow);return getChatGPTWeb()[method]();});
const getDoubaoWork = () => doubaoWorkService || (doubaoWorkService=createDoubaoWorkService({userDataDir:app.getPath('userData')}));
const doubaoRun = (config,options) => getDoubaoWork().request(config,options);
for(const [channel,method] of Object.entries({'doubao-work-status':'status','doubao-work-login':'openLogin','doubao-work-models':'listModels'}))ipcMain.handle(channel,(event)=>{assertTrustedFrame(event,mainWindow);return getDoubaoWork()[method]();});
const getGeminiWeb = () => geminiWebService || (geminiWebService=createGeminiWebService({profileDir:path.join(app.getPath('userData'),'gemini-browser')}));
const geminiRun = (config,options) => getGeminiWeb().request(config,options);
for(const [channel,method] of Object.entries({'gemini-web-status':'status','gemini-web-login':'openLogin','gemini-web-models':'listModels'}))ipcMain.handle(channel,(event)=>{assertTrustedFrame(event,mainWindow);return getGeminiWeb()[method]();});
let mainWindow, workBuddyService, workBuddyPanel;
function setupWorkBuddy() {
  workBuddyService = createWorkBuddyService({ userDataDir: app.getPath('userData') });
  const updater = createWorkBuddyUpdater({ getRoot: () => workBuddyService.getRoot(), stop: (root) => workBuddyService.stop(root), start: (root) => workBuddyService.start(root), onProgress: (value) => workBuddyPanel?.onProgress(value) });
  workBuddyPanel = createWorkBuddyPanel({ getWindow: () => mainWindow, accessService, service: workBuddyService, updater, WebContentsView, session, shell, onState: (value) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('workbuddy-state', value); } });
}
function assertWorkBuddySender(event) {
  assertTrustedFrame(event, mainWindow);
  if (!workBuddyPanel) throw new Error('WorkBuddy 集成尚未初始化');
}
for (const [channel, action] of Object.entries({
  'workbuddy-status': () => workBuddyPanel.status(),
  'workbuddy-open': (payload) => workBuddyPanel.open(payload),
  'workbuddy-resume': (payload) => workBuddyPanel.resume(payload),
  'workbuddy-bounds': (bounds) => workBuddyPanel.setBounds(bounds),
  'workbuddy-close': () => workBuddyPanel.close(),
  'workbuddy-check-update': () => workBuddyPanel.checkUpdate(),
  'workbuddy-update': () => workBuddyPanel.update(),
  'workbuddy-update-state': () => workBuddyPanel.updateState(),
  'workbuddy-select-root': async () => {
    await workBuddyPanel.authorize();
    if ((await workBuddyPanel.updateState()).busy) throw new Error('更新期间不能切换部署目录');
    await workBuddyPanel.close();
    const chosen = await dialog.showOpenDialog(mainWindow, { title: '选择 WorkBuddy Manager 部署目录', properties: ['openDirectory'] });
    if (chosen.canceled || !chosen.filePaths[0]) return null;
    await workBuddyPanel.authorize();
    if (workBuddyPanel.isUpdating()) throw new Error('更新期间不能切换部署目录');
    return workBuddyService.selectRoot(chosen.filePaths[0]);
  },
})) ipcMain.handle(channel, (event, payload) => { assertWorkBuddySender(event); return action(payload); });
function readJson(file, fallback=null){ try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback} }
function ensureDir(dir){ fs.mkdirSync(dir,{recursive:true}); return dir; }
function getDataDir(){ const config=readJson(CONFIG_FILE(),{}); return ensureDir(config.dataDir||defaultDataDir()); }
function dataFile(dir=getDataDir()){ return path.join(dir,'xingzhou-data.json'); }
function directorProjectsDir(dir=getDataDir()){ return ensureDir(path.join(dir,'导演工作台的项目')); }
function directorProjectsFile(dir=getDataDir()){ return path.join(directorProjectsDir(dir),'director-projects.json'); }
function storageInfo(){ const dir=getDataDir(); return {dataDir:dir,dataFile:dataFile(dir),directorProjectsDir:directorProjectsDir(dir),directorProjectsFile:directorProjectsFile(dir),engine:'JSON 本地资料库'}; }

function appendStartupLog(message){try{fs.appendFileSync(path.join(app.getPath('userData'),'startup.log'),`${new Date().toISOString()} ${message}\n`,'utf8')}catch{}}
function secureMainWindow(win){
 protectWindow(win,{entryFile:path.join(__dirname,'../dist/index.html'),isDev:isDev&&!isPackagedSmoke,allowFrameUrl:canvasPage,openExternal:url=>shell.openExternal(url)});
 if(!isDev){win.setMenu(null);win.setMenuBarVisibility(false);}
}
process.on('uncaughtException',(error)=>appendStartupLog(`uncaughtException ${error?.stack||error}`));
process.on('unhandledRejection',(error)=>appendStartupLog(`unhandledRejection ${error?.stack||error}`));
function createWindow(){ const win=new BrowserWindow({show:!isPackagedSmoke,width:1500,height:940,minWidth:1120,minHeight:720,backgroundColor:'#f4f1ea',title:'行舟影视',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,devTools:isDev&&!isPackagedSmoke}});mainWindow=win;secureMainWindow(win);win.on('close',event=>{if(workBuddyPanel?.isUpdating())event.preventDefault();});win.on('closed',()=>{if(mainWindow===win){mainWindow=null;workBuddyPanel?.revoke();}});win.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)workBuddyPanel?.revoke();});let recovered=false;win.webContents.on('did-fail-load',(_,code,description,url,isMainFrame)=>{if(!isMainFrame)return;appendStartupLog(`did-fail-load ${code} ${description} ${url}`);if(!recovered){recovered=true;setTimeout(()=>win.reload(),300)}});win.webContents.on('render-process-gone',(_,details)=>{appendStartupLog(`render-process-gone ${details.reason} ${details.exitCode}`);if(!recovered&&!win.isDestroyed()){recovered=true;setTimeout(()=>win.reload(),300)}});if(isDev&&!isPackagedSmoke)win.loadURL('http://127.0.0.1:5173');else win.loadFile(path.join(__dirname,'../dist/index.html')).catch(error=>appendStartupLog(`loadFile ${error.message}`)); }
ipcMain.handle('save-txt',async(_,{name,content})=>{const r=await dialog.showSaveDialog({defaultPath:`${name}.txt`,filters:[{name:'TXT 剧本文档',extensions:['txt']}]});if(r.canceled)return null;fs.writeFileSync(r.filePath,'\ufeff'+content,'utf8');return r.filePath});
ipcMain.handle('save-creator-document', (_, payload) => saveCreatorDocument(payload, { dialog, window: mainWindow }));
ipcMain.handle('import-creator-video', () => importCreatorVideo({ dialog, window: mainWindow }));
ipcMain.handle('save-txt-batch',async(_,{folderName,files})=>{const r=await dialog.showOpenDialog({title:'选择导出位置',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;const safe=(s)=>String(s||'导出').replace(/[\\/:*?"<>|]/g,'_').slice(0,120);const dir=ensureDir(path.join(r.filePaths[0],safe(folderName)));for(const f of files||[]){fs.writeFileSync(path.join(dir,`${safe(f.name)}.txt`),'\ufeff'+(f.content||''),'utf8')}return dir});
ipcMain.handle('storage-info',()=>storageInfo());
const stateBackupLoads = new Map();
function loadPersistedState() {
 const file = dataFile();
 const pending = loadCreatorStateWithBackup(file);
 // Retain failures to block automatic writes until the renderer successfully reloads.
 stateBackupLoads.set(file, pending);
 return pending;
}
ipcMain.handle('load-state',()=>loadPersistedState());
ipcMain.handle('save-state',async(_,state)=>{
 ensureDir(getDataDir());const file=dataFile();
 await (stateBackupLoads.get(file)||loadPersistedState());
 fs.writeFileSync(file,JSON.stringify(state,null,2),'utf8');return storageInfo();
});
ipcMain.handle('load-director-projects',()=>{const file=directorProjectsFile();const data=readJson(file,null);if(Array.isArray(data))return data;const backup=readJson(file.replace(/\.json$/,'.backup.json'),null);return Array.isArray(backup)?backup:data;});
ipcMain.handle('save-director-projects',(_,projects)=>{ensureDir(directorProjectsDir());const file=directorProjectsFile();const next=projects||[];const prev=readJson(file,null);if(Array.isArray(prev)&&prev.length&&next.length<prev.length){try{fs.writeFileSync(file.replace(/\.json$/,'.backup.json'),JSON.stringify(prev,null,2),'utf8')}catch{}}fs.writeFileSync(file,JSON.stringify(next,null,2),'utf8');return file});
function assertDirectorQuickSender(event) {
 if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame)throw new Error('只允许主工作区访问导演生成进度');
 if(!readCloudSession()?.account?.id)throw new Error('请先登录行舟影视');
}
const directorQuickStore=()=>require('./director-quick-checkpoints.cjs').createDirectorQuickCheckpoints(getDataDir(),()=>readCloudSession()?.account?.id);
for(const [channel,method] of Object.entries({'director-quick-list-runs':'list','director-quick-load-run':'load','director-quick-save-run':'save','director-quick-remove-run':'remove'})){
 ipcMain.handle(channel,(event,payload)=>{assertDirectorQuickSender(event);return directorQuickStore()[method](payload);});
}
let selectedDataDirectory=null;
async function chooseDataDirectory(){selectedDataDirectory=null;const r=await dialog.showOpenDialog({title:'选择行舟影视资料保存位置',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;selectedDataDirectory=r.filePaths[0];return selectedDataDirectory;}
function applyDataDirectory(currentState){
 if(!selectedDataDirectory)throw new Error('请先选择资料保存位置');
 const next=ensureDir(selectedDataDirectory);selectedDataDirectory=null;
 const oldFile=dataFile(),nextFile=dataFile(next),oldDirectorFile=directorProjectsFile(),nextDirectorFile=directorProjectsFile(next);
 if(path.resolve(oldFile)!==path.resolve(nextFile)){if(fs.existsSync(oldFile)&&!fs.existsSync(nextFile))fs.copyFileSync(oldFile,nextFile);else if(!fs.existsSync(nextFile)&&currentState)fs.writeFileSync(nextFile,JSON.stringify(currentState,null,2),'utf8')}
 if(path.resolve(oldDirectorFile)!==path.resolve(nextDirectorFile)&&fs.existsSync(oldDirectorFile)&&!fs.existsSync(nextDirectorFile)){ensureDir(path.dirname(nextDirectorFile));fs.copyFileSync(oldDirectorFile,nextDirectorFile)}
 require('./director-quick-checkpoints.cjs').migrateDirectorQuickCheckpoints(getDataDir(),next);
 ensureDir(path.dirname(CONFIG_FILE()));fs.writeFileSync(CONFIG_FILE(),JSON.stringify({dataDir:next},null,2),'utf8');
 return {info:storageInfo(),state:readJson(nextFile,currentState),directorProjects:readJson(nextDirectorFile,null)};
}
ipcMain.handle('choose-data-dir',()=>chooseDataDirectory());
ipcMain.handle('apply-data-dir',(_,currentState)=>applyDataDirectory(currentState));
ipcMain.handle('select-data-dir',async(_,currentState)=>await chooseDataDirectory()?applyDataDirectory(currentState):null);
ipcMain.handle('open-data-dir',()=>shell.openPath(getDataDir()));
function walkImportFiles(rootDir){
 const files=[];const MAX_FILES=200;const MAX_TOTAL_BYTES=8*1024*1024;let total=0;
 const walk=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.name.startsWith('.')||entry.name==='node_modules')continue;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory()){walk(full);continue}
  if(!entry.isFile())continue;
  const size=fs.statSync(full).size;total+=size;
  if(files.length>=MAX_FILES||total>MAX_TOTAL_BYTES)throw new Error('Skill 目录过大：最多 200 个文件且总计不超过 8 MB');
  files.push({path:path.relative(rootDir,full).split(path.sep).join('/'),content:fs.readFileSync(full,'utf8').replace(/^\uFEFF/,'')});
 }};walk(rootDir);return files;
}
ipcMain.handle('import-skill-directory',async()=>{const r=await dialog.showOpenDialog({title:'选择完整 Skill 目录',properties:['openDirectory']});if(r.canceled||!r.filePaths[0])return null;const rootDir=r.filePaths[0];return {rootName:path.basename(rootDir),files:walkImportFiles(rootDir)}});
ipcMain.handle('import-skill-document',async()=>{const r=await dialog.showOpenDialog({title:'导入 Skill 文档',properties:['openFile'],filters:[{name:'Skill 文档',extensions:['txt','md','markdown','text']}]});if(r.canceled||!r.filePaths[0])return null;const filePath=r.filePaths[0];return {fileName:path.basename(filePath),content:fs.readFileSync(filePath,'utf8').replace(/^\uFEFF/,'')}});
ipcMain.handle('import-full-script',async()=>{const r=await dialog.showOpenDialog({title:'导入完整剧本',properties:['openFile'],filters:[{name:'剧本文档',extensions:['txt','md','text','docx']}]});if(r.canceled||!r.filePaths[0])return null;const filePath=r.filePaths[0];const ext=path.extname(filePath).toLowerCase();let content,encoding='docx';if(ext==='.docx')content=(await mammoth.extractRawText({path:filePath})).value;else ({content,encoding}=require('./text-import.cjs').decodeImportText(fs.readFileSync(filePath)));return {filePath,fileName:path.basename(filePath),content,encoding}});
const activeAiRequests=new Map();
const aiTaskProgress=new Map();
const safeProviderDiagnostic=value=>{
 if(!value||typeof value!=='object')return undefined;
 const result={};
 for(const key of ['frameCount','receivedBytes','outputCharacters'])if(Number.isSafeInteger(value[key])&&value[key]>=0)result[key]=value[key];
 for(const key of ['hasDoneMarker','streamEOF'])if(typeof value[key]==='boolean')result[key]=value[key];
 if(value.completionMarker===null||['','[DONE]','response.completed','message_stop','finish_reason'].includes(value.completionMarker))result.completionMarker=value.completionMarker;
 if(value.finishReason===null||['','stop','length','max_tokens','content_filter','tool_calls','end_turn','stop_sequence','aborted','insufficient_system_resource','other'].includes(value.finishReason))result.finishReason=value.finishReason;
 return Object.keys(result).length?result:undefined;
};
ipcMain.handle('ai-task-status',(_,p)=>aiTaskProgress.get(String(p?.taskId||''))||null);
ipcMain.handle('ai-chat',async(event,payload)=>{
 const taskId=String(payload?.taskId||'');const controller=new AbortController();
 const revoke=()=>controller.abort();event?.securitySignal?.addEventListener('abort',revoke,{once:true});
 if(event?.securitySignal?.aborted)controller.abort();
 if(taskId){activeAiRequests.get(taskId)?.abort();activeAiRequests.set(taskId,controller)}
 try{const output=await requestText({...payload,signal:controller.signal},{geminiRun,doubaoRun,chatgptRun,onProgress:status=>{if(taskId)aiTaskProgress.set(taskId,status);}});return payload.resultEnvelope?{ok:true,output}:output}
 catch(error){if(payload.resultEnvelope){const diagnostic=safeProviderDiagnostic(error.providerDiagnostic);return {ok:false,code:error?.name==='AbortError'?'STOPPED':String(error?.code||'FAILED'),error:error?.name==='AbortError'?'任务已停止':error.message,partialText:error.partialText||'',...(diagnostic?{providerDiagnostic:diagnostic}:{})};}if(error?.name==='AbortError')throw new Error('任务已停止');throw error}
 finally{event?.securitySignal?.removeEventListener('abort',revoke);if(taskId&&activeAiRequests.get(taskId)===controller){activeAiRequests.delete(taskId);aiTaskProgress.delete(taskId);}}
});
const analysisStore=()=>require('./analysis-checkpoints.cjs').createAnalysisCheckpoints(getDataDir(),()=>readCloudSession()?.account?.id||'local');
ipcMain.handle('analysis-load',(_,p)=>analysisStore().load(p));
ipcMain.handle('analysis-save',(_,p)=>analysisStore().save(p));
const artReviewStore=()=>require('./analysis-checkpoints.cjs').createAnalysisCheckpoints(getDataDir(),()=>readCloudSession()?.account?.id||'local','art-review-checkpoints');
ipcMain.handle('art-review-load-local',(_,p)=>artReviewStore().load(p));
ipcMain.handle('art-review-save-local',(_,p)=>artReviewStore().save(p));
ipcMain.handle('collab-art-review-save',(_,p)=>collabService.saveArtReview(p));
ipcMain.handle('collab-art-review-publish',(_,p)=>collabService.publishArtReview(p));
ipcMain.handle('collab-publish-analysis',(_,p)=>collabService.publishAnalysis(p));
ipcMain.handle('cancel-ai-task',(_,payload)=>{const controller=activeAiRequests.get(String(payload?.taskId||''));if(!controller)return false;controller.abort();return true});
ipcMain.handle('test-ai-connection',async(_,_config)=>testTextConnection(_config,{geminiRun,doubaoRun,chatgptRun}));
ipcMain.handle('app-version',()=>app.getVersion());
ipcMain.handle('check-update',async()=>{const {manifest,source}=await fetchUpdateManifest(TRUSTED_MANIFEST_URL);return {configured:true,currentVersion:app.getVersion(),manifest,source}});
let downloadedInstaller=null,activeDownload=null;
ipcMain.handle('download-update',async(event,payload)=>{
 if(activeDownload)return activeDownload;
 downloadedInstaller=null;
 activeDownload=(async()=>{
  // Renderer arguments are a request, never proof of a trusted release.
  const {manifest}=await fetchUpdateManifest(TRUSTED_MANIFEST_URL);
  if(payload?.url!==manifest.installerUrl||payload?.version!==manifest.version)throw new Error('更新版本已变化，请重新检查更新');
  if(!newerVersion(manifest.version,app.getVersion()))throw new Error('不能安装相同版本或旧版本');
  const dir=ensureDir(path.join(app.getPath('userData'),'updates'));
  const filePath=await downloadInstaller({url:manifest.installerUrl,...manifest,destinationDir:dir,onProgress:p=>{if(!event.sender.isDestroyed())event.sender.send('update-progress',p)}});
  downloadedInstaller={filePath,manifest};return {filePath};
 })().finally(()=>{activeDownload=null});return activeDownload;
});
ipcMain.handle('install-update',async()=>{
 if(!downloadedInstaller)throw new Error('尚未下载更新安装包');
 const {filePath,manifest}=downloadedInstaller;validateManifest(manifest);
 if(!newerVersion(manifest.version,app.getVersion()))throw new Error('不能安装相同版本或旧版本');
 await verifyInstaller(filePath,manifest);
 const child=spawn(filePath,['/S'],{detached:true,stdio:'ignore',windowsHide:true});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
 child.unref();setTimeout(()=>app.quit(),350);return true;
});
ipcMain.handle('open-external',(_,url)=>shell.openExternal(safeExternalUrl(url)));
ipcMain.handle('auth-update-profile',(_,p)=>accessService.updateProfile(p));
ipcMain.handle('select-profile-avatar',async()=>{
 const result=await dialog.showOpenDialog({title:'选择个人头像',properties:['openFile'],filters:[{name:'头像图片',extensions:['png','jpg','jpeg','webp']}]});
 if(result.canceled||!result.filePaths[0])return null;
 const image=await require('electron').nativeImage.createThumbnailFromPath(result.filePaths[0],{width:256,height:256});
 if(image.isEmpty())throw new Error('无法读取该图片');
 const data='data:image/jpeg;base64,'+image.toJPEG(85).toString('base64');if(data.length>240000)throw new Error('头像文件过大，请选择较小图片');return data;
});
ipcMain.handle('auth-session',()=>accessService.session());
ipcMain.handle('auth-register',(_,payload)=>accessService.register(payload));
ipcMain.handle('auth-login',async(_,payload)=>{await workBuddyPanel?.revoke();return accessService.login(payload)});
ipcMain.handle('auth-logout',async()=>{const closing=workBuddyPanel?.revoke();const logout=accessService.logout();await closing;return logout});
ipcMain.handle('auth-unlock-role',(_,payload)=>accessService.unlock(payload));
ipcMain.handle('auth-send-email-code',(_,payload)=>accessService.sendEmailCode(payload));
ipcMain.handle('auth-recover',(_,payload)=>accessService.recover(payload));
ipcMain.handle('admin-list-users',()=>accessService.adminListUsers());
ipcMain.handle('admin-delete-user',(_,payload)=>accessService.adminDeleteUser(payload));
ipcMain.handle('admin-set-banned',(_,payload)=>accessService.adminSetBanned(payload));
ipcMain.handle('admin-create-invite',(_,payload)=>accessService.adminCreateInvite(payload));
ipcMain.handle('admin-list-invites',()=>accessService.adminListInvites());
ipcMain.handle('admin-disable-invite',(_,payload)=>accessService.adminDisableInvite(payload));
let collabService;
function readCloudSession(){ return accessService?.readSession() || null; }
ipcMain.handle('collab-is-producer',()=>collabService.isProducer());
ipcMain.handle('collab-admin-set-producer',(_,payload)=>collabService.adminSetProducer(payload));
ipcMain.handle('collab-create-project',(_,payload)=>collabService.createProject(payload));
ipcMain.handle('collab-list-projects',()=>collabService.listProjects());
ipcMain.handle('collab-get-project',(_,payload)=>collabService.getProject(payload));
ipcMain.handle('collab-patch-storyboard',(_,p)=>collabService.patchStoryboard(p));
ipcMain.handle('collab-update-project',(_,payload)=>collabService.updateProject(payload));
ipcMain.handle('collab-append-episode',(_,payload)=>collabService.appendEpisode(payload));
ipcMain.handle('collab-link-director',(_,payload)=>collabService.linkDirector(payload));
ipcMain.handle('collab-set-project-locked',(_,payload)=>collabService.setProjectLocked(payload));
ipcMain.handle('director-collab-create-project',(_,payload)=>collabService.createDirectorProject(payload));
ipcMain.handle('director-collab-list-projects',()=>collabService.listDirectorProjects());
ipcMain.handle('director-collab-get-project',(_,payload)=>collabService.getDirectorProject(payload));
ipcMain.handle('director-collab-update-project',(_,payload)=>collabService.updateDirectorProject(payload));
ipcMain.handle('director-collab-delete-project',(_,payload)=>collabService.deleteDirectorProject(payload));
ipcMain.handle('director-collab-set-locked',(_,payload)=>collabService.setDirectorProjectLocked(payload));
ipcMain.handle('director-collab-list-members',(_,payload)=>collabService.directorListMembers(payload));
ipcMain.handle('director-collab-add-member',(_,payload)=>collabService.directorAddMember(payload));
ipcMain.handle('director-collab-remove-member',(_,payload)=>collabService.directorRemoveMember(payload));
ipcMain.handle('collab-delete-project',(_,payload)=>collabService.deleteProject(payload));
ipcMain.handle('collab-restore-project',(_,payload)=>collabService.restoreProject(payload));
ipcMain.handle('collab-replace-assets',(_,payload)=>collabService.replaceAssets(payload));
ipcMain.handle('collab-create-asset',(_,payload)=>collabService.createAsset(payload));
ipcMain.handle('collab-list-assets',(_,payload)=>collabService.listAssets(payload));
ipcMain.handle('collab-update-asset',(_,payload)=>collabService.updateAsset(payload));

ipcMain.handle('collab-generate-asset-image',async(event,payload)=>{const filePath=await generateImage({endpoint:payload.endpoint,apiKey:payload.apiKey,model:payload.model,prompt:payload.prompt,size:payload.size,references:payload.references||[],destDir:mediaDir(),signal:event.securitySignal});return collabService.attachAssetImage({projectId:payload.projectId,assetId:payload.assetId,filePath})});
ipcMain.handle('collab-upload-asset-image',async(_,payload)=>{const r=await dialog.showOpenDialog({title:'选择资产图片',properties:['openFile'],filters:[{name:'图片文件',extensions:['png','jpg','jpeg','webp']}]});if(r.canceled||!r.filePaths[0])return null;return collabService.attachAssetImage({...payload,filePath:r.filePaths[0]})});
ipcMain.handle('collab-attach-generated-asset-image',(_,payload)=>collabService.attachGeneratedAssetImage(payload));
ipcMain.handle('collab-delete-asset-image',(_,payload)=>collabService.deleteAssetImage(payload));
ipcMain.handle('collab-clear-asset-images',(_,payload)=>collabService.clearAssetImages(payload));
ipcMain.handle('discover-models', (_, config) => config?.provider==='chatgptWeb'?getChatGPTWeb().listModels():config?.provider==='doubaoWork'?getDoubaoWork().listModels():config?.provider==='geminiWeb'?getGeminiWeb().listModels():discoverModels(config));
ipcMain.handle('collab-resolve-asset-image', (_, payload) => collabService.resolveAssetImage(payload));
const imageCacheAccount = () => readCloudSession()?.account?.id || '';
let activeImageCache, activeImageCacheDir;
configureMediaCache({read:(url,scope,load)=>{
 const directory=path.join(getDataDir(),'.cloud-image-cache');
 if(directory!==activeImageCacheDir){activeImageCache=createCosImageCache({directory});activeImageCacheDir=directory;}
 return activeImageCache.read(url,scope,load);
}},imageCacheAccount);
const localPreviewCache = require('./local-preview-cache.cjs').createLocalPreviewCache({directory:()=>path.join(getDataDir(),'.cloud-preview-cache')});
const loadAssetImage = createAssetImagePreview({resolveImage:p=>collabService.resolveAssetImage(p),readBytes:readMediaBytes,readAccount:imageCacheAccount,previewCache:localPreviewCache});
ipcMain.handle('collab-load-asset-image', (_, payload) => loadAssetImage(payload));
async function renewImageReferences(payload) {
 const references = await Promise.all((payload.references || []).map(async ref => ref.assetId ? {...ref, ...(await collabService.resolveAssetImage({projectId:ref.projectId||payload.projectId,assetId:ref.assetId,imageId:ref.imageId||(ref.id===ref.assetId?'legacy':ref.id)||'legacy'})),id:ref.id} : ref));
 return {...payload,references};
}
ipcMain.handle('collab-export-images',async(_,{folderName='美术图片',images=[],archive=true,filename='图片',layout='flat'})=>{
 const safe=s=>String(s||'图片').replace(/[\\/:*?"<>|]/g,'_').slice(0,100);
 const imageExt=image=>{const ext=path.extname(String(image?.filename||'')).toLowerCase();return ['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)?ext:'.png'};
 const fetchImage=async image=>{const resolved=((image.id&&image.id!=='legacy')||image.assetId) ? await collabService.resolveAssetImage({projectId:image.projectId,assetId:image.assetId,imageId:image.id}) : image;if(!resolved?.url)throw new Error('图片地址为空');return (await readMediaBytes(resolved.url,{label:'图片下载'})).bytes};
 const uniqueFile=target=>{if(!fs.existsSync(target))return target;const ext=path.extname(target);const base=target.slice(0,-ext.length);let index=2;while(fs.existsSync(`${base} (${index})${ext}`))index+=1;return `${base} (${index})${ext}`};
 if(!Array.isArray(images)||!images.length)throw new Error('没有可导出的图片');
 const first=images[0];
 if(!archive){const ext=imageExt(first);const r=await dialog.showSaveDialog({title:'保存图片',defaultPath:`${safe(filename||first.assetName||'图片')}${ext}`,filters:[{name:'图片文件',extensions:[ext.slice(1)]}]});if(r.canceled||!r.filePath)return null;fs.writeFileSync(r.filePath,await fetchImage(first));return {file:r.filePath,count:1}}
 const r=await dialog.showOpenDialog({title:'选择图片导出位置',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;
 const dir=path.join(r.filePaths[0],safe(folderName));
 return exportImagesToFolder({images,dir,layout,fetchImage});
});
ipcMain.handle('collab-list-members',(_,payload)=>collabService.listMembers(payload));
ipcMain.handle('collab-add-member',(_,payload)=>collabService.addMember(payload));
ipcMain.handle('collab-update-member-role',(_,payload)=>collabService.updateMemberRole(payload));
ipcMain.handle('collab-remove-member',(_,payload)=>collabService.removeMember(payload));
ipcMain.handle('collab-list-tasks',(_,payload)=>collabService.listTasks(payload));
ipcMain.handle('collab-assign-task',(_,payload)=>collabService.assignTask(payload));
ipcMain.handle('collab-update-task',(_,payload)=>collabService.updateTask(payload));
ipcMain.handle('collab-delete-task',(_,payload)=>collabService.deleteTask(payload));
ipcMain.handle('collab-list-media',(_,payload)=>collabService.listMedia(payload));
ipcMain.handle('collab-generate-video',async(event,payload)=>{const filePath=await generateVideo({endpoint:payload.endpoint,apiKey:payload.apiKey,model:payload.model,prompt:payload.prompt,ratio:payload.ratio,duration:payload.duration,firstFramePath:payload.firstFramePath,destDir:mediaDir(),signal:event.securitySignal,onStatus:s=>{if(!event.sender.isDestroyed())event.sender.send('media-task-status',{nodeId:payload.nodeId,status:s})}});return collabService.uploadMedia({projectId:payload.projectId,episode:payload.episode,scene:payload.scene,kind:'video',filePath,note:payload.note||''})});
ipcMain.handle('collab-upload-media',async(_,payload)=>{const r=await dialog.showOpenDialog({title:'上传素材（图片/音频/视频）',properties:['openFile'],filters:[{name:'素材文件',extensions:['png','jpg','jpeg','webp','gif','mp3','wav','m4a','mp4','mov','webm']}]});if(r.canceled||!r.filePaths[0])return null;const ext=path.extname(r.filePaths[0]).toLowerCase();const kind=['.mp4','.mov','.webm'].includes(ext)?'video':(['.mp3','.wav','.m4a'].includes(ext)?'audio':'image');return collabService.uploadMedia({projectId:payload.projectId,episode:payload.episode,scene:payload.scene,kind,filePath:r.filePaths[0],note:payload.note||''})});
ipcMain.handle('collab-record-generated-media',(_,payload)=>collabService.recordGeneratedMedia(payload));
ipcMain.handle('collab-delete-media',(_,payload)=>collabService.deleteMedia(payload));
ipcMain.handle('collab-list-messages',(_,payload)=>collabService.listMessages(payload));
ipcMain.handle('collab-send-message',(_,payload)=>collabService.sendMessage(payload));
ipcMain.handle('collab-send-image',async(_,payload)=>{const r=await dialog.showOpenDialog({title:'发送图片',properties:['openFile'],filters:[{name:'图片文件',extensions:['png','jpg','jpeg','webp','gif']}]});if(r.canceled||!r.filePaths[0])return null;return collabService.sendMessage({projectId:payload.projectId,content:payload.content||'',imagePath:r.filePaths[0]})});
ipcMain.handle('collab-get-stats',(_,payload)=>collabService.getStats(payload));
function mediaDir(){return ensureDir(path.join(getDataDir(),'画布素材'))}
const {createGenerationManagers,generationRetainedPaths}=require('./generation-jobs.cjs');
const generationManagers=createGenerationManagers();
const jobs=()=>generationManagers(mediaDir());
ipcMain.handle('generation-archive',(_,p)=>jobs().archive(p));
ipcMain.handle('generation-clear',(_,p={})=>jobs().clear({...p,retainedPaths:[...generationRetainedPaths(readJson(dataFile(),{})),...generationRetainedPaths(readJson(directorProjectsFile(),[])),...generationRetainedPaths(p.retainedPaths)]}));
ipcMain.handle('generation-list',()=>jobs().list());
ipcMain.handle('generation-submit',async(event,p)=>jobs().submit({...await renewImageReferences(p),signal:event.securitySignal}));
ipcMain.handle('generation-refresh',(_,p)=>jobs().refresh(p));
ipcMain.handle('generation-recorded',(_,p)=>jobs().markRecorded(p));
ipcMain.handle('media-generate-image',async(event,payload)=>{try{return {filePath:await generateImage({...await renewImageReferences(payload),destDir:mediaDir(),signal:event.securitySignal})}}catch(error){if(error.downloadReceiptId)return {pendingDownload:{id:error.downloadReceiptId},error:error.message};throw error}});
ipcMain.handle('media-retry-image-download',async(_,payload)=>{try{return {filePath:await retryImageDownload(payload.receiptId,mediaDir())}}catch(error){if(error.downloadReceiptId)return {pendingDownload:{id:error.downloadReceiptId},error:error.message};throw error}});
ipcMain.handle('media-generate-video',async(event,payload)=>({filePath:await generateVideo({...payload,destDir:mediaDir(),signal:event.securitySignal,onStatus:s=>{if(!event.sender.isDestroyed())event.sender.send('media-task-status',{nodeId:payload.nodeId,status:s})}})}));
ipcMain.handle('media-import-file',async(_,kind)=>(await importMediaFiles({dialog,destDir:mediaDir(),kind}))[0] || null);
ipcMain.handle('media-import-files',async(_,kind)=>importMediaFiles({dialog,destDir:mediaDir(),kind,multiple:true}));
ipcMain.handle('generation-import-episode-media',async(_,payload={})=>importEpisodeMedia({dialog,destDir:mediaDir(),mode:payload.mode,episode:payload.episode}));
ipcMain.handle('generation-import-episode-files',async(_,payload={})=>importEpisodeFiles({dialog,destDir:mediaDir(),kind:payload.kind,episode:payload.episode}));
ipcMain.handle('generation-delete-book-media',async(_,payload={})=>deleteEpisodeMedia({destDir:mediaDir(),paths:payload.paths,retainedPaths:payload.retainedPaths}));
ipcMain.handle('media-export-file',async(_,{filePath,url,kind})=>{if(!filePath&&url){if(!/^https?:\/\//.test(url))throw new Error('下载地址无效');filePath=await require('./media-service.cjs').downloadToFile(url,mediaDir(),kind==='image'?'png':'mp4');}if(!filePath||!fs.existsSync(filePath))throw new Error('素材文件不存在');const r=await dialog.showSaveDialog({defaultPath:path.basename(filePath)});if(r.canceled)return null;fs.copyFileSync(filePath,r.filePath);return r.filePath});
let canvasWindow=null;
ipcMain.handle('open-canvas-window',()=>{if(canvasWindow&&!canvasWindow.isDestroyed()){canvasWindow.focus();return true}canvasWindow=new BrowserWindow({width:1560,height:960,minWidth:1024,minHeight:640,backgroundColor:'#1c1917',title:'行舟影视 · 无限画布',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,devTools:isDev&&!isPackagedSmoke}});protectWindow(canvasWindow,{allowUrl:canvasPage,openExternal:url=>shell.openExternal(url)});canvasWindow.setMenuBarVisibility(false);canvasWindow.loadURL(`xzapp://canvas/index.html?v=${encodeURIComponent(app.getVersion())}#/canvas`);canvasWindow.on('closed',()=>{canvasWindow=null});return true});
protocol.registerSchemesAsPrivileged([{scheme:'xzmedia',privileges:{secure:true,supportFetchAPI:true,stream:true}},{scheme:'xzapp',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
function registerCanvasAppProtocol(){const appDir=path.normalize(path.join(__dirname,'../canvas-app'));protocol.handle('xzapp',(request)=>{const url=new URL(request.url);let rel=decodeURIComponent(url.pathname).replace(/^\/+/,'');if(!rel||rel==='')rel='index.html';const resolved=path.normalize(path.join(appDir,rel));if(!resolved.startsWith(appDir))return new Response('forbidden',{status:403});if(!fs.existsSync(resolved))return net.fetch(pathToFileURL(path.join(appDir,'index.html')).toString());return net.fetch(pathToFileURL(resolved).toString())})}
app.whenReady().then(()=>{if(!isPackagedSmoke)app.setPath('userData',path.join(app.getPath('appData'),'行舟影视-腾讯云版'));try{registerCanvasAppProtocol()}catch(error){appendStartupLog(`canvas-protocol ${error?.stack||error}`)}try{protocol.handle('xzmedia',(request)=>{const filePath=decodeURIComponent(request.url.replace(/^xzmedia:\/\//,'').replace(/^\//,''));const resolved=path.normalize(filePath);const relative=path.relative(path.normalize(getDataDir()),resolved);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))return new Response('forbidden',{status:403});return net.fetch(pathToFileURL(resolved).toString())})}catch(error){appendStartupLog(`media-protocol ${error?.stack||error}`)}accessService=createCloudAccessService(app.getPath('userData'),{safeStorage,onInvalidSession:()=>{ipcMain.invalidate();Promise.resolve(workBuddyPanel?.revoke()).catch(()=>{});}});collabService=createCollabService(readCloudSession);setupWorkBuddy();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})}).catch(error=>{try{appendStartupLog(`ready ${error?.stack||error}`);createWindow()}catch(fallbackError){appendStartupLog(`fallback-window ${fallbackError?.stack||fallbackError}`)}});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

app.on('before-quit',createGeminiQuitHandler({getService:()=>geminiWebService||doubaoWorkService||chatgptWebService?{close:()=>Promise.all([geminiWebService,doubaoWorkService,chatgptWebService].filter(Boolean).map(service=>service.close()))}:null,isUpdating:()=>!!workBuddyPanel?.isUpdating(),quit:()=>app.quit()}));

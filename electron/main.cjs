const { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } = require('electron');
const path = require('path');
app.setName('行舟影视（腾讯云版）');
app.setAppUserModelId('com.xingzhou.film.tencent');
app.setPath('userData', path.join(app.getPath('appData'), '行舟影视-腾讯云版'));
const { spawn } = require('child_process');
const fs = require('fs');
const { pathToFileURL } = require('url');
const mammoth = require('mammoth');
const { downloadInstaller } = require('./update-service.cjs');
const { fetchUpdateManifest } = require('./update-manifest.cjs');
const { requestChat, testAiConnection } = require('./ai-service.cjs');
const { generateImage, generateVideo } = require('./media-service.cjs');
const { createCloudAccessService } = require('./cloud-access-service.cjs');
const { createCollabService } = require('./collab-service.cjs');
const isDev = !app.isPackaged;
if (!isDev) app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'storage-config.json');
const defaultDataDir = () => path.join(app.getPath('documents'), '行舟影视资料');
let accessService;
function readJson(file, fallback=null){ try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback} }
function ensureDir(dir){ fs.mkdirSync(dir,{recursive:true}); return dir; }
function getDataDir(){ const config=readJson(CONFIG_FILE(),{}); return ensureDir(config.dataDir||defaultDataDir()); }
function dataFile(dir=getDataDir()){ return path.join(dir,'xingzhou-data.json'); }
function directorProjectsDir(dir=getDataDir()){ return ensureDir(path.join(dir,'导演工作台的项目')); }
function directorProjectsFile(dir=getDataDir()){ return path.join(directorProjectsDir(dir),'director-projects.json'); }
function storageInfo(){ const dir=getDataDir(); return {dataDir:dir,dataFile:dataFile(dir),directorProjectsDir:directorProjectsDir(dir),directorProjectsFile:directorProjectsFile(dir),engine:'JSON 本地资料库'}; }

function appendStartupLog(message){try{fs.appendFileSync(path.join(app.getPath('userData'),'startup.log'),`${new Date().toISOString()} ${message}\n`,'utf8')}catch{}}
function createWindow(){ const win=new BrowserWindow({width:1500,height:940,minWidth:1120,minHeight:720,backgroundColor:'#f4f1ea',title:'行舟影视',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}});let recovered=false;win.webContents.on('did-fail-load',(_,code,description,url,isMainFrame)=>{if(!isMainFrame)return;appendStartupLog(`did-fail-load ${code} ${description} ${url}`);if(!recovered){recovered=true;setTimeout(()=>win.reload(),300)}});win.webContents.on('render-process-gone',(_,details)=>{appendStartupLog(`render-process-gone ${details.reason} ${details.exitCode}`);if(!recovered&&!win.isDestroyed()){recovered=true;setTimeout(()=>win.reload(),300)}});if(isDev)win.loadURL('http://127.0.0.1:5173');else win.loadFile(path.join(__dirname,'../dist/index.html')).catch(error=>appendStartupLog(`loadFile ${error.message}`)); }
ipcMain.handle('save-txt',async(_,{name,content})=>{const r=await dialog.showSaveDialog({defaultPath:`${name}.txt`,filters:[{name:'TXT 剧本文档',extensions:['txt']}]});if(r.canceled)return null;fs.writeFileSync(r.filePath,'\ufeff'+content,'utf8');return r.filePath});
ipcMain.handle('save-txt-batch',async(_,{folderName,files})=>{const r=await dialog.showOpenDialog({title:'选择导出位置',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;const safe=(s)=>String(s||'导出').replace(/[\\/:*?"<>|]/g,'_').slice(0,120);const dir=ensureDir(path.join(r.filePaths[0],safe(folderName)));for(const f of files||[]){fs.writeFileSync(path.join(dir,`${safe(f.name)}.txt`),'\ufeff'+(f.content||''),'utf8')}return dir});
ipcMain.handle('storage-info',()=>storageInfo());
ipcMain.handle('load-state',()=>readJson(dataFile(),null));
ipcMain.handle('save-state',(_,state)=>{ensureDir(getDataDir());fs.writeFileSync(dataFile(),JSON.stringify(state,null,2),'utf8');return storageInfo()});
ipcMain.handle('load-director-projects',()=>{const file=directorProjectsFile();const data=readJson(file,null);if(Array.isArray(data))return data;const backup=readJson(file.replace(/\.json$/,'.backup.json'),null);return Array.isArray(backup)?backup:data;});
ipcMain.handle('save-director-projects',(_,projects)=>{ensureDir(directorProjectsDir());const file=directorProjectsFile();const next=projects||[];const prev=readJson(file,null);if(Array.isArray(prev)&&prev.length&&next.length<prev.length){try{fs.writeFileSync(file.replace(/\.json$/,'.backup.json'),JSON.stringify(prev,null,2),'utf8')}catch{}}fs.writeFileSync(file,JSON.stringify(next,null,2),'utf8');return file});
ipcMain.handle('select-data-dir',async(_,currentState)=>{const r=await dialog.showOpenDialog({title:'选择行舟影视资料保存位置',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;const next=ensureDir(r.filePaths[0]);const oldFile=dataFile();const nextFile=dataFile(next);const oldDirectorFile=directorProjectsFile();const nextDirectorFile=directorProjectsFile(next);if(path.resolve(oldFile)!==path.resolve(nextFile)){if(fs.existsSync(oldFile)&&!fs.existsSync(nextFile))fs.copyFileSync(oldFile,nextFile);else if(!fs.existsSync(nextFile)&&currentState)fs.writeFileSync(nextFile,JSON.stringify(currentState,null,2),'utf8')}if(path.resolve(oldDirectorFile)!==path.resolve(nextDirectorFile)&&fs.existsSync(oldDirectorFile)&&!fs.existsSync(nextDirectorFile)){ensureDir(path.dirname(nextDirectorFile));fs.copyFileSync(oldDirectorFile,nextDirectorFile)}ensureDir(path.dirname(CONFIG_FILE()));fs.writeFileSync(CONFIG_FILE(),JSON.stringify({dataDir:next},null,2),'utf8');return {info:storageInfo(),state:readJson(nextFile,currentState),directorProjects:readJson(nextDirectorFile,null)}});
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
ipcMain.handle('import-full-script',async()=>{const r=await dialog.showOpenDialog({title:'导入完整剧本',properties:['openFile'],filters:[{name:'剧本文档',extensions:['txt','md','text','docx']}]});if(r.canceled||!r.filePaths[0])return null;const filePath=r.filePaths[0];const ext=path.extname(filePath).toLowerCase();let content;if(ext==='.docx')content=(await mammoth.extractRawText({path:filePath})).value;else content=fs.readFileSync(filePath,'utf8').replace(/^\uFEFF/,'');return {filePath,fileName:path.basename(filePath),content}});
const activeAiRequests=new Map();
ipcMain.handle('ai-chat',async(_,payload)=>{
 const taskId=String(payload?.taskId||'');const controller=new AbortController();
 if(taskId){activeAiRequests.get(taskId)?.abort();activeAiRequests.set(taskId,controller)}
 try{return await requestChat({...payload,signal:controller.signal})}
 catch(error){if(error?.name==='AbortError')throw new Error('任务已停止');throw error}
 finally{if(taskId&&activeAiRequests.get(taskId)===controller)activeAiRequests.delete(taskId)}
});
ipcMain.handle('cancel-ai-task',(_,payload)=>{const controller=activeAiRequests.get(String(payload?.taskId||''));if(!controller)return false;controller.abort();return true});
ipcMain.handle('test-ai-connection',async(_,_config)=>testAiConnection(_config));
ipcMain.handle('app-version',()=>app.getVersion());
ipcMain.handle('check-update',async(_,manifestUrl)=>{if(!manifestUrl)return {configured:false,currentVersion:app.getVersion()};const {manifest,source}=await fetchUpdateManifest(manifestUrl);return {configured:true,currentVersion:app.getVersion(),manifest,source}});
let downloadedInstaller=null,activeDownload=null;
ipcMain.handle('download-update',async(event,{url,version})=>{if(activeDownload)return activeDownload;const dir=ensureDir(path.join(app.getPath('userData'),'updates'));activeDownload=downloadInstaller({url,version,destinationDir:dir,onProgress:p=>{if(!event.sender.isDestroyed())event.sender.send('update-progress',p)}}).then(filePath=>(downloadedInstaller=filePath,{filePath})).finally(()=>{activeDownload=null});return activeDownload});
ipcMain.handle('install-update',async()=>{if(!downloadedInstaller||!fs.existsSync(downloadedInstaller))throw new Error('尚未下载更新安装包');const buf=Buffer.alloc(2);const fd=fs.openSync(downloadedInstaller,'r');fs.readSync(fd,buf,0,2,0);fs.closeSync(fd);if(buf[0]!==0x4d||buf[1]!==0x5a){const target=path.join(path.dirname(__dirname),'resources','app.asar');const backup=target+'.bak';if(fs.existsSync(target)){if(fs.existsSync(backup))fs.unlinkSync(backup);fs.copyFileSync(target,backup)}fs.copyFileSync(downloadedInstaller,target);setTimeout(()=>app.quit(),500);return true}const child=spawn(downloadedInstaller,['/S'],{detached:true,stdio:'ignore',windowsHide:false});child.unref();setTimeout(()=>app.quit(),350);return true});
ipcMain.handle('open-external',(_,url)=>shell.openExternal(url));
ipcMain.handle('auth-session',()=>accessService.session());
ipcMain.handle('auth-register',(_,payload)=>accessService.register(payload));
ipcMain.handle('auth-login',(_,payload)=>accessService.login(payload));
ipcMain.handle('auth-logout',()=>accessService.logout());
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
function readCloudSession(){ return readJson(path.join(app.getPath('userData'),'cloud-session.json'),null); }
ipcMain.handle('collab-is-producer',()=>collabService.isProducer());
ipcMain.handle('collab-admin-set-producer',(_,payload)=>collabService.adminSetProducer(payload));
ipcMain.handle('collab-create-project',(_,payload)=>collabService.createProject(payload));
ipcMain.handle('collab-list-projects',()=>collabService.listProjects());
ipcMain.handle('collab-get-project',(_,payload)=>collabService.getProject(payload));
ipcMain.handle('collab-update-project',(_,payload)=>collabService.updateProject(payload));
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

ipcMain.handle('collab-generate-asset-image',async(_,payload)=>{const filePath=await generateImage({endpoint:payload.endpoint,apiKey:payload.apiKey,model:payload.model,prompt:payload.prompt,size:payload.size,destDir:mediaDir()});return collabService.attachAssetImage({projectId:payload.projectId,assetId:payload.assetId,filePath})});
ipcMain.handle('collab-upload-asset-image',async(_,payload)=>{const r=await dialog.showOpenDialog({title:'选择资产图片',properties:['openFile'],filters:[{name:'图片文件',extensions:['png','jpg','jpeg','webp']}]});if(r.canceled||!r.filePaths[0])return null;return collabService.attachAssetImage({...payload,filePath:r.filePaths[0]})});
ipcMain.handle('collab-attach-generated-asset-image',(_,payload)=>collabService.attachGeneratedAssetImage(payload));
ipcMain.handle('collab-delete-asset-image',(_,payload)=>collabService.deleteAssetImage(payload));
ipcMain.handle('collab-clear-asset-images',(_,payload)=>collabService.clearAssetImages(payload));
ipcMain.handle('collab-export-images',async(_,{folderName='美术图片',images=[],archive=true,filename='图片'})=>{
 const safe=s=>String(s||'图片').replace(/[\\/:*?"<>|]/g,'_').slice(0,100);
 const imageExt=image=>{const ext=path.extname(String(image?.filename||'')).toLowerCase();return ['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)?ext:'.png'};
 const fetchImage=async image=>{if(!image?.url)throw new Error('图片地址为空');const response=await fetch(String(image.url));if(!response.ok)throw new Error(`HTTP ${response.status}`);return Buffer.from(await response.arrayBuffer())};
 const uniqueFile=target=>{if(!fs.existsSync(target))return target;const ext=path.extname(target);const base=target.slice(0,-ext.length);let index=2;while(fs.existsSync(`${base} (${index})${ext}`))index+=1;return `${base} (${index})${ext}`};
 if(!Array.isArray(images)||!images.length)throw new Error('没有可导出的图片');
 const first=images[0];
 if(!archive){const ext=imageExt(first);const r=await dialog.showSaveDialog({title:'保存图片',defaultPath:`${safe(filename||first.assetName||'图片')}${ext}`,filters:[{name:'图片文件',extensions:[ext.slice(1)]}]});if(r.canceled||!r.filePath)return null;fs.writeFileSync(r.filePath,await fetchImage(first));return {file:r.filePath,count:1}}
 const r=await dialog.showOpenDialog({title:'选择图片导出位置',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;
 const dir=ensureDir(path.join(r.filePaths[0],safe(folderName)));const failures=[];
 await Promise.all(images.map(async(image,index)=>{try{const ext=imageExt(image);const target=path.join(dir,`${String(index+1).padStart(3,'0')}-${safe(image.assetName||image.note||'图片')}${ext}`);fs.writeFileSync(uniqueFile(target),await fetchImage(image))}catch(error){failures.push(`${image.assetName||image.id||index+1}: ${error.message}`)}}));
 if(failures.length)throw new Error(`导出完成，但有 ${failures.length} 张失败：${failures.join('；')}`);return {dir,count:images.length}
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
ipcMain.handle('collab-generate-video',async(event,payload)=>{const filePath=await generateVideo({endpoint:payload.endpoint,apiKey:payload.apiKey,model:payload.model,prompt:payload.prompt,ratio:payload.ratio,duration:payload.duration,firstFramePath:payload.firstFramePath,destDir:mediaDir(),onStatus:s=>{if(!event.sender.isDestroyed())event.sender.send('media-task-status',{nodeId:payload.nodeId,status:s})}});return collabService.uploadMedia({projectId:payload.projectId,episode:payload.episode,scene:payload.scene,kind:'video',filePath,note:payload.note||''})});
ipcMain.handle('collab-upload-media',async(_,payload)=>{const r=await dialog.showOpenDialog({title:'上传素材（图片/音频/视频）',properties:['openFile'],filters:[{name:'素材文件',extensions:['png','jpg','jpeg','webp','gif','mp3','wav','m4a','mp4','mov','webm']}]});if(r.canceled||!r.filePaths[0])return null;const ext=path.extname(r.filePaths[0]).toLowerCase();const kind=['.mp4','.mov','.webm'].includes(ext)?'video':(['.mp3','.wav','.m4a'].includes(ext)?'audio':'image');return collabService.uploadMedia({projectId:payload.projectId,episode:payload.episode,scene:payload.scene,kind,filePath:r.filePaths[0],note:payload.note||''})});
ipcMain.handle('collab-record-generated-media',(_,payload)=>collabService.recordGeneratedMedia(payload));
ipcMain.handle('collab-delete-media',(_,payload)=>collabService.deleteMedia(payload));
ipcMain.handle('collab-list-messages',(_,payload)=>collabService.listMessages(payload));
ipcMain.handle('collab-send-message',(_,payload)=>collabService.sendMessage(payload));
ipcMain.handle('collab-send-image',async(_,payload)=>{const r=await dialog.showOpenDialog({title:'发送图片',properties:['openFile'],filters:[{name:'图片文件',extensions:['png','jpg','jpeg','webp','gif']}]});if(r.canceled||!r.filePaths[0])return null;return collabService.sendMessage({projectId:payload.projectId,content:payload.content||'',imagePath:r.filePaths[0]})});
ipcMain.handle('collab-get-stats',(_,payload)=>collabService.getStats(payload));
function mediaDir(){return ensureDir(path.join(getDataDir(),'画布素材'))}
ipcMain.handle('media-generate-image',async(_,payload)=>({filePath:await generateImage({...payload,destDir:mediaDir()})}));
ipcMain.handle('media-generate-video',async(event,payload)=>({filePath:await generateVideo({...payload,destDir:mediaDir(),onStatus:s=>{if(!event.sender.isDestroyed())event.sender.send('media-task-status',{nodeId:payload.nodeId,status:s})}})}));
ipcMain.handle('media-import-file',async(_,kind)=>{const filters=kind==='video'?[{name:'视频文件',extensions:['mp4','mov','webm']}]:[{name:'图片文件',extensions:['png','jpg','jpeg','webp']}];const r=await dialog.showOpenDialog({title:kind==='video'?'导入视频':'导入图片',properties:['openFile'],filters});if(r.canceled||!r.filePaths[0])return null;const src=r.filePaths[0];const dest=path.join(mediaDir(),`${Date.now()}_${path.basename(src)}`);fs.copyFileSync(src,dest);return {filePath:dest}});
ipcMain.handle('media-export-file',async(_,{filePath})=>{if(!filePath||!fs.existsSync(filePath))throw new Error('素材文件不存在');const r=await dialog.showSaveDialog({defaultPath:path.basename(filePath)});if(r.canceled)return null;fs.copyFileSync(filePath,r.filePath);return r.filePath});
let canvasWindow=null;
ipcMain.handle('open-canvas-window',()=>{if(canvasWindow&&!canvasWindow.isDestroyed()){canvasWindow.focus();return true}canvasWindow=new BrowserWindow({width:1560,height:960,minWidth:1024,minHeight:640,backgroundColor:'#1c1917',title:'行舟影视 · 无限画布',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{contextIsolation:true,nodeIntegration:false}});canvasWindow.setMenuBarVisibility(false);canvasWindow.loadURL('xzapp://canvas/index.html');canvasWindow.on('closed',()=>{canvasWindow=null});return true});
protocol.registerSchemesAsPrivileged([{scheme:'xzmedia',privileges:{secure:true,supportFetchAPI:true,stream:true}},{scheme:'xzapp',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
function registerCanvasAppProtocol(){const appDir=path.normalize(path.join(__dirname,'../canvas-app'));protocol.handle('xzapp',(request)=>{const url=new URL(request.url);let rel=decodeURIComponent(url.pathname).replace(/^\/+/,'');if(!rel||rel==='')rel='index.html';const resolved=path.normalize(path.join(appDir,rel));if(!resolved.startsWith(appDir))return new Response('forbidden',{status:403});if(!fs.existsSync(resolved))return net.fetch(pathToFileURL(path.join(appDir,'index.html')).toString());return net.fetch(pathToFileURL(resolved).toString())})}
app.whenReady().then(()=>{registerCanvasAppProtocol();protocol.handle('xzmedia',(request)=>{const filePath=decodeURIComponent(request.url.replace(/^xzmedia:\/\//,'').replace(/^\//,''));const resolved=path.normalize(filePath);if(!resolved.startsWith(path.normalize(getDataDir())))return new Response('forbidden',{status:403});return net.fetch(pathToFileURL(resolved).toString())});accessService=createCloudAccessService(app.getPath('userData'));collabService=createCollabService(readCloudSession);createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { downloadInstaller } = require('./update-service.cjs');
const { fetchUpdateManifest } = require('./update-manifest.cjs');
const { requestChat, testAiConnection } = require('./ai-service.cjs');
const isDev = !app.isPackaged;
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'storage-config.json');
const defaultDataDir = () => path.join(app.getPath('documents'), '行舟影视资料');
function readJson(file, fallback=null){ try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback} }
function ensureDir(dir){ fs.mkdirSync(dir,{recursive:true}); return dir; }
function getDataDir(){ const config=readJson(CONFIG_FILE(),{}); return ensureDir(config.dataDir||defaultDataDir()); }
function dataFile(dir=getDataDir()){ return path.join(dir,'xingzhou-data.json'); }
function storageInfo(){ const dir=getDataDir(); return {dataDir:dir,dataFile:dataFile(dir),engine:'JSON 本地资料库'}; }

function createWindow(){ const win=new BrowserWindow({width:1500,height:940,minWidth:1120,minHeight:720,backgroundColor:'#f4f1ea',title:'行舟影视',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}}); if(isDev)win.loadURL('http://127.0.0.1:5173');else win.loadFile(path.join(__dirname,'../dist/index.html')); }
ipcMain.handle('save-txt',async(_,{name,content})=>{const r=await dialog.showSaveDialog({defaultPath:`${name}.txt`,filters:[{name:'TXT 剧本文档',extensions:['txt']}]});if(r.canceled)return null;fs.writeFileSync(r.filePath,'\ufeff'+content,'utf8');return r.filePath});
ipcMain.handle('storage-info',()=>storageInfo());
ipcMain.handle('load-state',()=>readJson(dataFile(),null));
ipcMain.handle('save-state',(_,state)=>{ensureDir(getDataDir());fs.writeFileSync(dataFile(),JSON.stringify(state,null,2),'utf8');return storageInfo()});
ipcMain.handle('select-data-dir',async(_,currentState)=>{const r=await dialog.showOpenDialog({title:'选择行舟影视资料保存位置',properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths[0])return null;const next=ensureDir(r.filePaths[0]);const oldFile=dataFile();const nextFile=dataFile(next);if(path.resolve(oldFile)!==path.resolve(nextFile)){if(fs.existsSync(oldFile)&&!fs.existsSync(nextFile))fs.copyFileSync(oldFile,nextFile);else if(!fs.existsSync(nextFile)&&currentState)fs.writeFileSync(nextFile,JSON.stringify(currentState,null,2),'utf8')}ensureDir(path.dirname(CONFIG_FILE()));fs.writeFileSync(CONFIG_FILE(),JSON.stringify({dataDir:next},null,2),'utf8');return {info:storageInfo(),state:readJson(nextFile,currentState)}});
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
ipcMain.handle('ai-chat',async(_,{endpoint,apiKey,model,messages})=>requestChat({endpoint,apiKey,model,messages}));
ipcMain.handle('test-ai-connection',async(_,_config)=>testAiConnection(_config));
ipcMain.handle('app-version',()=>app.getVersion());
ipcMain.handle('check-update',async(_,manifestUrl)=>{if(!manifestUrl)return {configured:false,currentVersion:app.getVersion()};const {manifest,source}=await fetchUpdateManifest(manifestUrl);return {configured:true,currentVersion:app.getVersion(),manifest,source}});
let downloadedInstaller=null,activeDownload=null;
ipcMain.handle('download-update',async(event,{url,version})=>{if(activeDownload)return activeDownload;const dir=ensureDir(path.join(app.getPath('userData'),'updates'));activeDownload=downloadInstaller({url,version,destinationDir:dir,onProgress:p=>{if(!event.sender.isDestroyed())event.sender.send('update-progress',p)}}).then(filePath=>(downloadedInstaller=filePath,{filePath})).finally(()=>{activeDownload=null});return activeDownload});
ipcMain.handle('install-update',async()=>{if(!downloadedInstaller||!fs.existsSync(downloadedInstaller))throw new Error('尚未下载更新安装包');const buf=Buffer.alloc(2);const fd=fs.openSync(downloadedInstaller,'r');fs.readSync(fd,buf,0,2,0);fs.closeSync(fd);if(buf[0]!==0x4d||buf[1]!==0x5a){const target=path.join(path.dirname(__dirname),'resources','app.asar');const backup=target+'.bak';if(fs.existsSync(target)){if(fs.existsSync(backup))fs.unlinkSync(backup);fs.copyFileSync(target,backup)}fs.copyFileSync(downloadedInstaller,target);setTimeout(()=>app.quit(),500);return true}const child=spawn(downloadedInstaller,['/S'],{detached:true,stdio:'ignore',windowsHide:false});child.unref();setTimeout(()=>app.quit(),350);return true});
ipcMain.handle('open-external',(_,url)=>shell.openExternal(url));
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

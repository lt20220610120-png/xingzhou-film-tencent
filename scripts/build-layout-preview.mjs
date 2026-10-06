import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import createSeed from './layout-preview-seed.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'output','layout-preview');
if(!fs.existsSync(path.join(root,'dist','index.html')))throw new Error('Run npm run build first.');
fs.mkdirSync(output,{recursive:true});
function copyTree(from,to) {
 fs.mkdirSync(to,{recursive:true});
 for(const item of fs.readdirSync(from,{withFileTypes:true})) {
  const source=path.join(from,item.name),destination=path.join(to,item.name);
  if(item.isDirectory())copyTree(source,destination);else if(item.isFile())fs.copyFileSync(source,destination);
 }
}
copyTree(path.join(root,'dist'),path.join(output,'dist'));
const seed=await createSeed();
const bootstrap=`
const seed=${JSON.stringify(seed)};
if(!localStorage.getItem('xingzhou-film-v1')){
 localStorage.setItem('xingzhou-film-v1',JSON.stringify(seed.state));
 localStorage.setItem('xz-role','creator');localStorage.setItem('xz-creator-channel','rewrite');
 localStorage.setItem('xz-creator-script',seed.id);localStorage.setItem('xz-rewrite-pane:'+seed.id,'macroOutline');
}
const cancelled=new Set();
window.xingzhou=new Proxy({
 authSession:async()=>({id:'layout-preview',username:'布局预览 · 示例数据',roles:['creator','director'],activeRole:'creator'}),
 loadState:async()=>null,loadDirectorProjects:async()=>null,saveState:async()=>true,saveDirectorProjects:async()=>true,
 storageInfo:async()=>({dataDir:'独立布局预览示例数据',dataFile:'preview-profile',engine:'预览模拟环境'}),
 collabIsProducer:async()=>true,checkUpdate:async()=>({configured:false}),
 cancelAiTask:async({taskId})=>{cancelled.add(taskId);return true;},
 importFullScript:async()=>null,
 aiChat:async req=>{
  await new Promise(r=>setTimeout(r,400));if(cancelled.has(req.taskId))throw new Error('预览任务已停止');
  const text=req.messages.map(m=>m.content).join('\\n');
  if(text.includes('完整拆解当前唯一对标剧本'))return JSON.stringify({settings:'示例都市设定',macroOutline:seed.macro,outline:seed.mainline,characters:'示例人物动机与关系'});
  if(text.includes('主线是按大纲小事件归组'))return JSON.stringify(text.includes('仅拆解当前唯一对标剧本')?{outline:seed.mainline}:seed.mainline);
  if(text.includes('只整理阶段式故事骨架'))return JSON.stringify(text.includes('仅拆解当前唯一对标剧本')?{macroOutline:seed.macro}:seed.macro);
  return '这是布局预览的模拟候选。这里可以试用查看、编辑与采用操作，内容来自示例数据。';
 }
},{get(t,k){if(k in t)return t[k];return String(k).startsWith('on')?()=>()=>{}:async()=>[];}});
const openCreator=setInterval(()=>{const button=document.querySelector('.sidebar button[aria-label="创作剧本"]');if(button){clearInterval(openCreator);button.click();}},80);
setTimeout(()=>clearInterval(openCreator),15000);
`;
fs.writeFileSync(path.join(output,'dist','preview-bootstrap.js'),bootstrap);
const index=path.join(output,'dist','index.html');
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('<head>','<head>\n<script src="./preview-bootstrap.js"></script>').replace('<title>行舟影视</title>','<title>行舟影视 · 布局预览</title>'));
fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({name:'xingzhou-layout-preview',version:'0.0.0',main:'preview-main.cjs'},null,2));
fs.writeFileSync(path.join(output,'preview-main.cjs'),`
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const profile=path.join(__dirname,'preview-profile');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
const verify=process.argv.includes('--verify');
if(!app.requestSingleInstanceLock())app.quit();else app.whenReady().then(()=>{
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,done)=>done({cancel:true}));
 const win=new BrowserWindow({width:1700,height:1050,show:!verify,title:'行舟影视 — 协作浮窗演示（独立示例数据）',webPreferences:{nodeIntegration:false,contextIsolation:true}});
 win.setMenuBarVisibility(false);win.loadFile(path.join(__dirname,'dist','index.html'));
 if(verify)win.webContents.once('did-finish-load',async()=>{
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
   await new Promise(r=>setTimeout(r,150));
   const ready=await win.webContents.executeJavaScript('!!document.querySelector(".workspace-preserved:not([hidden]) .rewrite-view-toolbar")');
   if(ready){
    await new Promise(r=>setTimeout(r,300));
    const result=await win.webContents.executeJavaScript('({title:document.title,floating:!!document.querySelector("[aria-label=移动项目协作浮窗]"),groups:document.querySelectorAll(".rewrite-analysis-column>div:not([hidden]) [aria-label=大事件组切换] button").length,errors:document.querySelectorAll(".render-error-page").length})');
    result.pass=result.floating&&result.groups>=3&&result.errors===0;
    fs.writeFileSync(path.join(__dirname,'native-verification.json'),JSON.stringify(result,null,2));
    fs.writeFileSync(path.join(__dirname,'native-preview.png'),(await win.webContents.capturePage()).toPNG());
    app.exit(result.pass?0:1);return;
   }
  }
  fs.writeFileSync(path.join(__dirname,'native-verification.json'),JSON.stringify({pass:false,error:'Preview did not mount'}));app.exit(1);
 });
 app.on('second-instance',()=>{if(win.isMinimized())win.restore();win.focus();});
});
app.on('window-all-closed',()=>app.quit());
`);
const runtimes=['qa/electron-runtime/electron.exe','node_modules/electron/dist/electron.exe'];
const runtime=runtimes.map(p=>path.join(root,p)).find(p=>fs.existsSync(p));
if(!runtime)throw new Error('No Electron runtime available for the preview.');
const relativeRuntime=path.relative(output,runtime);
// ASCII launcher text avoids CMD's system code-page decoding of Chinese paths.
fs.writeFileSync(path.join(output,'打开布局预览.cmd'),`@echo off\r\nstart "" "%~dp0${relativeRuntime}" "%~dp0."\r\n`);
fs.writeFileSync(path.join(output,'说明.txt'),'这是独立布局预览，使用示例项目和模拟 Agent。\r\n双击“打开布局预览.cmd”，点击“打开项目协作”，拖住标题栏移动浮窗。\r\n不会替换正式软件或读取正式项目；与正式软件相互独立。\r\n预览中的编辑保存在本文件夹的 preview-profile。\r\n');
console.log(output);

const fs=require('node:fs'),path=require('node:path');
function installRuntimeHealth({app,getWindow,intervalMs=60000}){
 const file=path.join(app.getPath('userData'),'runtime-health.jsonl');
 const record=(type,details={})=>{try{
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)&&fs.statSync(file).size>2*1024*1024){try{fs.renameSync(file,file+'.previous');}catch{}}
  const memory=process.memoryUsage();
  fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),version:app.getVersion(),type,...details,memory:{rss:memory.rss,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,external:memory.external}})+'\n');
 }catch{}};
 const sample=async()=>{const win=getWindow();if(!win||win.isDestroyed())return;try{const renderer=await win.webContents.getProcessMemoryInfo();record('memory',{renderer});}catch{}};
 app.on('child-process-gone',(_event,d)=>record('child-process-gone',{reason:d.reason,exitCode:d.exitCode,processType:d.type}));
 app.on('render-process-gone',(_event,_contents,d)=>record('render-process-gone',{reason:d.reason,exitCode:d.exitCode}));
 process.on('uncaughtExceptionMonitor',error=>record('uncaughtException',{code:error.code||'',name:error.name||'Error'}));
 const timer=setInterval(()=>void sample(),intervalMs);timer.unref();record('startup');
 return {record,sample,close:()=>clearInterval(timer)};
}
function installSingleInstance({app,getWindow,skip=false}){
 if(skip)return true;if(!app.requestSingleInstanceLock()){app.quit();return false;}
 app.on('second-instance',()=>{const win=getWindow();if(!win||win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();});return true;
}
module.exports={installRuntimeHealth,installSingleInstance};

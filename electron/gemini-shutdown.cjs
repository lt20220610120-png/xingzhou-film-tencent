// Electron does not await async before-quit listeners. Defer the first quit
// until the owned browser closes, then let the recursive quit proceed.
function createGeminiQuitHandler({getService,isUpdating,quit,beforeCleanup,finishCriticalCleanup,onSaveError=()=>{},timeoutMs=6500}) {
 let ready=false,closing=false;
 const handler=event=>{
  if(isUpdating()){event.preventDefault();return;}
  if(ready)return;
  const service=getService();
  if(!service&&!beforeCleanup&&!finishCriticalCleanup)return;
  event.preventDefault();
  if(closing)return;
  closing=true;
  const closeBrowsers=()=>{
   let timer;
   const timeout=new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);});
   let cleanup;
   try{cleanup=service?.close();}catch{cleanup=undefined;}
   const critical=Promise.resolve().then(finishCriticalCleanup);
   Promise.allSettled([Promise.race([Promise.resolve(cleanup).catch(()=>{}),timeout]),critical]).finally(()=>{
    clearTimeout(timer);ready=true;quit();
   });
  };
  // Disk writes must finish before the browser-only timeout begins.
  if(beforeCleanup)Promise.resolve().then(beforeCleanup).then(closeBrowsers,error=>{closing=false;onSaveError(error);});
  else closeBrowsers();
 };
 handler.canClose=()=>ready;
 return handler;
}
function closeDesktopResources(tasks,onFailure=()=>{}){
 return Promise.allSettled(Object.entries(tasks).map(([name,close])=>Promise.resolve().then(close).catch(error=>{onFailure(name,error);throw error;})));
}
module.exports={createGeminiQuitHandler,closeDesktopResources};

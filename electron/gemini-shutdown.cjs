// Electron does not await async before-quit listeners. Defer the first quit
// until the owned browser closes, then let the recursive quit proceed.
function createGeminiQuitHandler({getService,isUpdating,quit,beforeCleanup,onSaveError=()=>{},timeoutMs=6500}) {
 let ready=false,closing=false;
 const handler=event=>{
  if(isUpdating()){event.preventDefault();return;}
  if(ready)return;
  const service=getService();
  if(!service&&!beforeCleanup)return;
  event.preventDefault();
  if(closing)return;
  closing=true;
  const closeBrowsers=()=>{
   let timer;
   const timeout=new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);});
   let cleanup;
   try{cleanup=service?.close();}catch{cleanup=undefined;}
   Promise.race([Promise.resolve(cleanup).catch(()=>{}),timeout]).finally(()=>{
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
module.exports={createGeminiQuitHandler};

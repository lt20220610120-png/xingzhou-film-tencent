// Electron does not await async before-quit listeners. Defer the first quit
// until the owned browser closes, then let the recursive quit proceed.
function createGeminiQuitHandler({getService,isUpdating,quit,timeoutMs=6500}) {
 let ready=false,closing=false;
 return event=>{
  if(isUpdating()){event.preventDefault();return;}
  if(ready)return;
  const service=getService();
  if(!service)return;
  event.preventDefault();
  if(closing)return;
  closing=true;
  let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);});
  let cleanup;
  try{cleanup=service.close();}catch{cleanup=undefined;}
  Promise.race([Promise.resolve(cleanup).catch(()=>{}),timeout]).finally(()=>{
   clearTimeout(timer);ready=true;quit();
  });
 };
}
module.exports={createGeminiQuitHandler};

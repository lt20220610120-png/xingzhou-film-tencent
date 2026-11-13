const {validateManifest,newerVersion}=require('./update-trust.cjs');

function registerUpdateHandlers({ipcMain,getVersion,checkManifest,download,install,verifyManifest=validateManifest}){
 let checkedManifest=null,downloaded=null,activeDownload=null,activeInstall=null;
 ipcMain.handle('check-update',async()=>{
  const {manifest,source}=await checkManifest();
  checkedManifest=verifyManifest(manifest);
  return {configured:true,currentVersion:getVersion(),manifest:checkedManifest,source};
 });
 ipcMain.handle('download-update',async(event,payload)=>{
  const manifest=checkedManifest;
  // Only a release previously verified and returned by the main process is eligible.
  if(!manifest||payload?.version!==manifest.version)throw Error('更新版本已变化，请重新检查更新');
  if(!newerVersion(manifest.version,getVersion()))throw Error('不能安装相同版本或旧版本');
  if(activeInstall)throw Error('正在启动安装程序');
  if(activeDownload){
   if(activeDownload.manifest!==manifest&&activeDownload.manifest.signature.value!==manifest.signature.value)throw Error('正在下载另一版本，请稍后重试');
   return activeDownload.promise;
  }
  downloaded=null;
  const promise=(async()=>{
   const filePath=await download(manifest,p=>{if(!event.sender.isDestroyed())event.sender.send('update-progress',p);});
   downloaded={filePath,manifest};
   return {filePath};
  })().finally(()=>{activeDownload=null;});
  activeDownload={manifest,promise};
  return promise;
 });
 ipcMain.handle('install-update',async()=>{
  if(activeInstall)return activeInstall;
  if(!downloaded)throw Error('尚未下载更新安装包');
  const {filePath,manifest}=downloaded;
  verifyManifest(manifest);
  if(!newerVersion(manifest.version,getVersion()))throw Error('不能安装相同版本或旧版本');
  activeInstall=Promise.resolve().then(()=>install(filePath,manifest)).catch(error=>{activeInstall=null;throw error;});
  return activeInstall;
 });
}

module.exports={registerUpdateHandlers};

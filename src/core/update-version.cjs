function versionParts(version){
 return String(version||'').replace(/^v/i,'').split('.').map(part=>Number.parseInt(part,10)||0);
}
function isNewerVersion(candidate,current){
 const a=versionParts(candidate),b=versionParts(current),length=Math.max(a.length,b.length);
 for(let i=0;i<length;i++){const delta=(a[i]||0)-(b[i]||0);if(delta)return delta>0;}
 return false;
}
function interpretUpdateResult(result){
 const manifest=result?.manifest;
 const currentVersion=result?.currentVersion;
 if(!manifest?.version)throw new Error('更新清单缺少版本号');
 if(!manifest?.installerUrl)throw new Error('更新清单缺少安装包地址');
 const available=isNewerVersion(manifest.version,currentVersion);
 return {version:manifest.version,installerUrl:manifest.installerUrl,notes:manifest.notes||'',currentVersion,available,status:available?`发现新版本 ${manifest.version}`:`当前已是最新版本：${currentVersion}`};
}
module.exports={isNewerVersion,interpretUpdateResult};

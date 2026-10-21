const fs=require('node:fs'),path=require('node:path');
// Keep the installation path stable: Edge/Chrome retain pairing and extension ID.
function syncLikeExtension(userData,{existingOnly=false,source=path.join(__dirname,'../browser-extension/like-connector')}={}){
 const folder=path.join(userData,'like-browser-extension','1.0.0');
 if(existingOnly&&!fs.existsSync(path.join(folder,'manifest.json')))return null;
 fs.mkdirSync(folder,{recursive:true});
 for(const name of ['manifest.json','background.js','content.js','main.js','popup.html','popup.js']){
  const bytes=fs.readFileSync(path.join(source,name)),file=path.join(folder,name);
  if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))continue;
  fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);
 }
 return folder;
}
module.exports={syncLikeExtension};

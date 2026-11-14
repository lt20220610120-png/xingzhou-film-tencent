const fs=require('node:fs');
const path=require('node:path');

const ACCOUNT_FILES=['cloud-session.json','software-device-key.json','software-license-card.json','software-license-route.json'];

function migrateLegacyAccountState({appData,userData}){
 const legacy=path.join(appData,'行舟影视');
 if(path.resolve(legacy)===path.resolve(userData)||!fs.existsSync(legacy))return [];
 fs.mkdirSync(userData,{recursive:true});
 const moved=[];
 for(const name of ACCOUNT_FILES){
  const source=path.join(legacy,name),target=path.join(userData,name);
  if(fs.existsSync(target)||!fs.existsSync(source))continue;
  const stat=fs.lstatSync(source);
  if(!stat.isFile()||stat.isSymbolicLink())continue;
  fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  moved.push(name);
 }
 return moved;
}

module.exports={migrateLegacyAccountState,ACCOUNT_FILES};

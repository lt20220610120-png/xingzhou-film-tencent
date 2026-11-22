const fs=require('node:fs');
const path=require('node:path');
const {isChildPath}=require('./workspace-file.cjs');

const safeName=value=>{
 const name=String(value||'导出').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120).replace(/[. ]+$/,'')||'导出';
 return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)?'_'+name:name;
};

function writeTextBatch(root,folderName,files=[]){
 const parent=fs.realpathSync(root),folder=path.join(parent,safeName(folderName));
 fs.mkdirSync(folder,{recursive:true});
 const resolved=fs.realpathSync(folder);
 if(!isChildPath(parent,resolved))throw Error('导出文件夹不在选定位置');
 for(const file of files){
  const name=safeName(file.name);
  for(let counter=1;;counter++){
   const filename=name+(counter===1?'':` (${counter})`)+'.txt';
   try{fs.writeFileSync(path.join(resolved,filename),'\ufeff'+(file.content||''),{encoding:'utf8',flag:'wx'});break;}
   catch(error){if(error.code!=='EEXIST')throw error;}
  }
 }
 return resolved;
}
module.exports={writeTextBatch};

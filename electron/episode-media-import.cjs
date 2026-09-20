const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const EXTENSIONS={image:['.png','.jpg','.jpeg','.webp'],video:['.mp4','.mov','.webm'],audio:['.mp3','.wav','.m4a','.aac','.ogg']};

function episodeNumber(name){
 const normalized=name.normalize('NFKC').trim();
 const match=normalized.match(/^([\d零〇一二两三四五六七八九十百千]+)$/)||normalized.match(/第\s*([\d零〇一二两三四五六七八九十百千]+)\s*集/);
 if(!match)return null;
 const token=match[1];let value;
 if(/^\d+$/.test(token))value=Number(token);
 else {
  const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if(!/[十百千]/.test(token))value=Number([...token].map(c=>digits[c]).join(''));
  else {value=0;let digit=0;for(const c of token){if(c in digits)digit=digits[c];else{value+=(digit||1)*({'十':10,'百':100,'千':1000}[c]);digit=0;}}value+=digit;}
 }
 return Number.isSafeInteger(value)&&value>0?value:null;
}

async function hashFile(filePath){
 const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(filePath))hash.update(chunk);return hash.digest('hex');
}

async function collectFolder(root,destination,files,warnings,depth=0){
 if(depth>32)throw new Error('素材目录层级超过 32 层，请整理后重新导入。');
 const entries=await fs.promises.readdir(root,{withFileTypes:true});
 entries.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
 for(const entry of entries){
  const filePath=path.join(root,entry.name);
  if(path.resolve(filePath).toLowerCase()===destination.toLowerCase())continue;
  if(entry.isSymbolicLink()){warnings.add('已跳过符号链接');continue;}
  if(entry.isDirectory())await collectFolder(filePath,destination,files,warnings,depth+1);
  else if(entry.isFile()){
   const ext=path.extname(entry.name).toLowerCase();
   const kind=Object.keys(EXTENSIONS).find(k=>EXTENSIONS[k].includes(ext));
   if(kind){files.push({filePath,name:entry.name,ext,kind});if(files.length>10000)throw new Error('单次导入最多 10000 个素材，请按集分批导入。');}
  }
 }
}

async function importEpisodeMedia({dialog,destDir,mode='episode',episode}){
 if(!['episode','series'].includes(mode))throw new Error('无效的素材导入方式');
 if(mode==='episode'&&(!Number.isSafeInteger(episode)||episode<1))throw new Error('请先选择要导入素材的集数');
 const result=await dialog.showOpenDialog({title:mode==='series'?'选择整部素材文件夹（内含各集子文件夹）':`选择第 ${episode} 集素材文件夹`,properties:['openDirectory']});
 if(result.canceled||!result.filePaths?.[0])return null;
 const root=path.resolve(result.filePaths[0]),destination=path.resolve(destDir,'整本提示词素材');
 const relative=path.relative(destination,root);
 if(!relative||(!relative.startsWith('..')&&!path.isAbsolute(relative)))throw new Error('请选择原始素材文件夹，不要选择软件的素材保存目录。');
 const warnings=new Set(),groups=new Map();
 if(mode==='episode')groups.set(episode,[root]);
 else {
  for(const dir of await fs.promises.readdir(root,{withFileTypes:true})){
   if(!dir.isDirectory())continue;
   const number=episodeNumber(dir.name);
   if(!number){warnings.add(`未识别集数，已跳过：${dir.name}`);continue;}
   groups.set(number,[...(groups.get(number)||[]),path.join(root,dir.name)]);
  }
 }
 // Discover everything before copying so malformed/deep folders never partially attach.
 const planned=new Map();
 for(const [number,folders] of groups){const files=[];for(const folder of folders)await collectFolder(folder,destination,files,warnings);planned.set(number,files);}
 await fs.promises.mkdir(destination,{recursive:true});
 const episodes={};let count=0;
 for(const [number,files] of planned){
  const refs=[],seen=new Set();
  for(const file of files){
   const hash=await hashFile(file.filePath),id=`folder-${hash}-${file.ext.slice(1)}`;
   if(seen.has(id))continue;seen.add(id);
   const target=path.join(destination,`${hash}${file.ext}`);
   // Content-addressed files are shared across prompts and repeated imports.
   try{await fs.promises.copyFile(file.filePath,target,fs.constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
   refs.push({id,filePath:target,name:file.name,kind:file.kind});count++;
  }
  episodes[number]=refs;
 }
 return {episodes,count,warnings:[...warnings]};
}
module.exports={episodeNumber,importEpisodeMedia};

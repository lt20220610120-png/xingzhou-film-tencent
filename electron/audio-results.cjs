const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
function createAudioResultStore({dataDir,resultsDir}){
 const indexPath=path.join(dataDir,'audio-results.json');
 const root=()=>path.resolve(resultsDir());
 const read=async()=>{try{const value=JSON.parse(await fsp.readFile(indexPath,'utf8'));return Array.isArray(value)?value:[];}catch(e){if(e.code==='ENOENT')return [];throw Error('语音结果索引读取失败');}};
 const write=async rows=>{await fsp.mkdir(path.dirname(indexPath),{recursive:true});const tmp=indexPath+'.tmp';await fsp.writeFile(tmp,JSON.stringify(rows),'utf8');await fsp.rename(tmp,indexPath);};
 const check=file=>{const absolute=path.resolve(String(file||'')),relative=path.relative(root(),absolute);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('语音文件不在语音生成目录');return absolute;};
 return {
  async list(){const rows=await read(),live=[];for(const row of rows){try{const file=check(row.filePath);const stat=await fsp.stat(file);if(stat.isFile())live.push({...row,filePath:file,bytes:row.bytes||stat.size});}catch{}}if(live.length!==rows.length)await write(live);return live.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));},
  async record(input){const file=check(input.filePath);const stat=await fsp.stat(file);if(!stat.isFile())throw Error('语音结果不是文件');const rows=await read(),id=String(input.id||crypto.randomUUID());const row={...input,id,filePath:file,bytes:Number(input.bytes||stat.size),saved:Boolean(input.saved),createdAt:Number(input.createdAt||Date.now())};const next=[...rows.filter(x=>x.id!==id),row];await write(next);return row;},
  async save(id){const rows=await read(),row=rows.find(x=>x.id===id);if(!row)throw Error('语音结果不存在');row.saved=true;await write(rows);return row;},
  async remove(id){const rows=await read(),row=rows.find(x=>x.id===id);if(!row)return false;const file=check(row.filePath);await fsp.rm(file,{force:true});await write(rows.filter(x=>x.id!==id));return true;},
  async clear(){const rows=await read(),managed=new Set(rows.map(row=>path.basename(row.filePath)));for(const row of rows){try{await fsp.rm(check(row.filePath),{force:true});}catch{}}try{for(const name of await fsp.readdir(root()))if(/\.(?:wav|mp3|m4a|aac|ogg|flac)$/i.test(name)&&!managed.has(name))await fsp.rm(check(path.join(root(),name)),{force:true});}catch{}await write([]);return rows.length;},
 };
}
module.exports={createAudioResultStore};

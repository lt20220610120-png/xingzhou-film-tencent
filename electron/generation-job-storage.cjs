const fs=require('node:fs'),crypto=require('node:crypto');
const {atomicWriteSync,renameWithRetrySync}=require('./atomic-json.cjs');
function atomic(file,rows){atomicWriteSync(file,JSON.stringify(rows));}
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_HISTORY_JSON'});
function isolateHistory(file,error){
 if(!(error instanceof SyntaxError)&&error.code!=='INVALID_HISTORY_JSON')throw error;
 const backup=file+'.corrupt-'+Date.now()+'-'+crypto.randomUUID()+'.bak';
 renameWithRetrySync(file,backup);
 return backup;
}
function readHistoryJson(file,validate,fallback){
 try{
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!validate(data))throw invalid('历史记录格式不正确');
  return data;
 }catch(error){
  if(error.code==='ENOENT')return fallback;
  isolateHistory(file,error);
  return fallback;
 }
}
function readJobs(file){
 if(!fs.existsSync(file))return [];
 const bytes=fs.readFileSync(file),text=bytes.toString('utf8');let rows;
 try{rows=JSON.parse(text);}catch(original){
  let depth=0,string=false,escape=false,end=-1;const start=text.search(/\S/);if(text[start]!=='[')throw original;
  for(let i=start;i<text.length;i++){const c=text[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}if(c==='"')string=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}'){depth--;if(depth===0){end=i+1;break;}}}
  if(end<0)throw original;
  try{rows=JSON.parse(text.slice(0,end));}catch{throw original;}
  const tail=text.slice(end).trim();if(!tail)throw original;if(/^[\[{]/.test(tail))throw invalid('任务记录包含另一份可能完整的文档，原记录保留，请核对');
  let another=false;try{JSON.parse(tail);another=true;}catch{}if(another)throw invalid('任务记录包含多个文档，原记录保留，请核对');
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r||typeof r.id!=='string'||!r.id||typeof r.status!=='string')||new Set(rows.map(r=>r.id)).size!==rows.length)throw original;
  // Preserve every byte before removing only a proven-invalid trailing fragment.
  fs.writeFileSync(file+'.corrupt-'+Date.now()+'-'+crypto.randomUUID()+'.bak',bytes,{flag:'wx'});atomic(file,rows);
 }
 if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=='string'||typeof row.status!=='string'))throw invalid('生成任务记录格式不正确，原记录已保留');return rows;
}
function createJobHistory(file,{onIsolated=()=>{}}={}){
 let cached,version;
 const stamp=()=>{
  try{const s=fs.statSync(file,{bigint:true});return [s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
 };
 return {
  read(){
   const live=stamp();
   if(cached&&live===version)return cached;
   try{cached=live===null?[]:readJobs(file);}
   catch(error){const backup=isolateHistory(file,error);cached=[];onIsolated(backup);}
   version=stamp();
   return cached;
  },
  write(rows){
   atomic(file,rows);
   cached=rows;
   version=stamp();
  },
 };
}
module.exports={readJobs,atomic,createJobHistory,readHistoryJson};

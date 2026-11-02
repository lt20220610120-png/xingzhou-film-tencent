const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function atomic(file,rows){const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});try{fs.writeFileSync(tmp,JSON.stringify(rows),{flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function readJobs(file){
 if(!fs.existsSync(file))return [];
 const bytes=fs.readFileSync(file),text=bytes.toString('utf8');let rows;
 try{rows=JSON.parse(text);}catch(original){
  let depth=0,string=false,escape=false,end=-1;const start=text.search(/\S/);if(text[start]!=='[')throw original;
  for(let i=start;i<text.length;i++){const c=text[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}if(c==='"')string=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}'){depth--;if(depth===0){end=i+1;break;}}}
  if(end<0)throw original;
  try{rows=JSON.parse(text.slice(0,end));}catch{throw original;}
  const tail=text.slice(end).trim();if(!tail)throw original;if(/^[\[{]/.test(tail))throw Error('任务记录包含另一份可能完整的文档，原记录保留，请核对');
  let another=false;try{JSON.parse(tail);another=true;}catch{}if(another)throw Error('任务记录包含多个文档，原记录保留，请核对');
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r||typeof r.id!=='string'||!r.id||typeof r.status!=='string')||new Set(rows.map(r=>r.id)).size!==rows.length)throw original;
  // Preserve every byte before removing only a proven-invalid trailing fragment.
  fs.writeFileSync(file+'.corrupt-'+Date.now()+'-'+crypto.randomUUID()+'.bak',bytes,{flag:'wx'});atomic(file,rows);
 }
 if(!Array.isArray(rows))throw Error('生成任务记录必须是数组，原记录已保留');return rows;
}
module.exports={readJobs,atomic};

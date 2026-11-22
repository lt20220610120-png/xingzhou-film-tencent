const fs=require('node:fs/promises'),{constants}=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sha256File}=require('./file-digest.cjs');
const safe=s=>String(s||'未命名').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,90)||'未命名';
const missing=error=>{if(error.code==='ENOENT')return null;throw error;};
async function compareExisting(destination,input,existing){
 if(!existing.isFile())throw Error('已有不同内容的同名文件，已保留');
 const [saved,incoming]=await Promise.all([sha256File(destination),sha256File(input)]);
 if(saved!==incoming)throw Error('已有不同内容的同名文件，已保留');
}
async function publishFile(temporary,destination){
 try{await fs.link(temporary,destination);}
 catch(error){
  if(process.platform!=='win32'||!['EPERM','ENOTSUP','EOPNOTSUPP','ENOSYS','EACCES'].includes(error.code))throw error;
  // Windows volumes such as exFAT cannot hard-link. File.Move on the same
  // volume publishes the staged file without replacing a concurrent export.
  const {promisify}=require('node:util'),{execFile}=require('node:child_process');
  const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  await promisify(execFile)(powershell,['-NoProfile','-NonInteractive','-Command','[System.IO.File]::Move($env:XZ_EXPORT_TEMPORARY, $env:XZ_EXPORT_DESTINATION)'],{
   windowsHide:true,timeout:20000,env:{...process.env,XZ_EXPORT_TEMPORARY:temporary,XZ_EXPORT_DESTINATION:destination},
  });
 }
}
async function copyExport(input,destination,guard){
 const existing=await fs.lstat(destination).catch(missing);
 if(existing)return compareExisting(destination,input,existing);
 const temporary=path.join(path.dirname(destination),'.xz-export-'+crypto.randomUUID()+'.partial');
 try{
  await fs.copyFile(input,temporary,constants.COPYFILE_EXCL);
  await guard();
  try{await publishFile(temporary,destination);}
  catch(error){
   const concurrent=await fs.lstat(destination).catch(missing);
   if(!concurrent)throw error;
   await compareExisting(destination,temporary,concurrent);
  }
 }finally{await fs.unlink(temporary).catch(missing);}
}
async function exportProjectVideos({project,ids,jobs,media,folder,mediaRoot,download,guard=async()=>{}}){
 if(!Array.isArray(ids)||ids.length>20000)throw Error('请选择有效的视频范围');
 const [base,root]=await Promise.all([fs.realpath(mediaRoot),fs.realpath(folder)]),errors=[],seen=new Set();let completed=0;
 for(const item of ids){const key=JSON.stringify([item.jobId,item.mediaId]);if(seen.has(key))continue;seen.add(key);try{
  await guard();const job=item.jobId?jobs.find(j=>j.id===item.jobId&&j.projectId===project.id&&j.kind==='video'&&j.status==='success'):null;
  const source=item.mediaId?media.find(m=>m.id===item.mediaId&&m.kind==='video'):job;
  if(!source)throw Error('视频不存在或尚未完成');
  const episode=Number(source.episode);if(!Number.isInteger(episode)||episode<1)throw Error('视频缺少有效集数');
  const shotId=source.shotId||String(source.note||'').match(/\[shot:([^\]]+)\]/)?.[1],shot=shotId?(project.episodes||[]).flatMap(e=>e.storyboardPrompts||e.prompts||[]).find(s=>s.id===shotId||s.sourcePromptId===shotId):null;
  const label=shot?.label||source.shotLabel||source.promptLabel||source.note||source.scene||source.id;
  let input=source.filePath;
  if(!input||!await fs.stat(input).catch(()=>null)){if(!/^https?:\/\//i.test(source.url||''))throw Error('视频下载地址不可用');input=await download(source.url,base,'mp4');}
  input=await fs.realpath(input);const rel=path.relative(base,input);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('视频不在素材目录');
  if(!(await fs.stat(input)).size)throw Error('视频文件为空');
  await guard();const dir=path.join(root,safe(project.name),`第${episode}集`);await fs.mkdir(dir,{recursive:true});
  // Never follow a user-created destination junction outside the selected root.
  const output=await fs.realpath(dir),destRel=path.relative(root,output);
  if(!destRel||destRel.startsWith('..')||path.isAbsolute(destRel))throw Error('输出目录指向所选文件夹之外');
  const dest=path.join(output,`${safe(label)}-${safe(source.id)}${path.extname(input)||'.mp4'}`);
  await copyExport(input,dest,guard);
  completed++;
 }catch(e){errors.push(e.message);}}
 return {completed,errors};
}
module.exports={exportProjectVideos};

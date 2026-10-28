const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const safe=s=>String(s||'未命名').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,90)||'未命名';
async function exportProjectVideos({project,ids,jobs,media,folder,mediaRoot,download,guard=async()=>{}}){
 if(!Array.isArray(ids)||ids.length>20000)throw Error('请选择有效的视频范围');
 const base=fs.realpathSync(mediaRoot),root=fs.realpathSync(folder),errors=[];let completed=0;
 for(const item of ids){try{
  await guard();const job=item.jobId?jobs.find(j=>j.id===item.jobId&&j.projectId===project.id&&j.kind==='video'&&j.status==='success'):null;
  const source=item.mediaId?media.find(m=>m.id===item.mediaId&&m.kind==='video'):job;
  if(!source)throw Error('视频不存在或尚未完成');
  const episode=Number(source.episode);if(!Number.isInteger(episode)||episode<1)throw Error('视频缺少有效集数');
  const label=source.shotLabel||source.promptLabel||source.note||source.scene||source.id;
  let input=source.filePath;
  if(!input||!fs.existsSync(input)){if(!/^https?:\/\//i.test(source.url||''))throw Error('视频下载地址不可用');input=await download(source.url,base,'mp4');}
  input=fs.realpathSync(input);const rel=path.relative(base,input);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('视频不在素材目录');
  if(!fs.statSync(input).size)throw Error('视频文件为空');
  await guard();const dir=path.join(root,safe(project.name),`第${episode}集`);fs.mkdirSync(dir,{recursive:true});
  // Never follow a user-created destination junction outside the selected root.
  const destRel=path.relative(root,fs.realpathSync(dir));if(destRel.startsWith('..')||path.isAbsolute(destRel))throw Error('输出目录指向所选文件夹之外');
  const dest=path.join(dir,`${safe(label)}-${safe(source.id)}${path.extname(input)||'.mp4'}`);
  if(fs.existsSync(dest)){const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(fs.lstatSync(dest).isSymbolicLink()||digest(dest)!==digest(input))throw Error('已有不同内容的同名文件，已保留');}
  else{const temp=dest+'.'+crypto.randomUUID()+'.partial';fs.copyFileSync(input,temp,fs.constants.COPYFILE_EXCL);fs.renameSync(temp,dest);}
  completed++;
 }catch(e){errors.push(e.message);}}
 return {completed,errors};
}
module.exports={exportProjectVideos};

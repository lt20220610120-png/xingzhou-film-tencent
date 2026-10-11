import {parseMasterScript} from './scriptImport.js';
export const directorEpisodeCount=p=>(p.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传').length;
export function appendDirectorEpisode(project,content,source=project.masterScript||''){
 const text=String(content||'').trim();if(!text)throw Error('请填写本集内容');
 if(project.cloudLocked||project.canWrite===false||project.permissions?.canWrite===false)throw Error('项目已锁定或没有添加权限');
 const parsed=parseMasterScript(text).episodes.filter(e=>e.kind!=='setting');
 const bodies=parsed.length?parsed:[{content:text}];
 const firstNumber=directorEpisodeCount(project)+1;
 const added=bodies.map((e,i)=>({id:crypto.randomUUID(),title:`第${firstNumber+i}集`,content:e.content,kind:'episode',prompts:[]}));
 if(added.some(e=>!e.content?.trim()))throw Error('新增分集没有正文，请补全后添加');
 const wrapped=source.split(/\r?\n/).some(line=>/^【[^】]+】$/.test(line.trim())&&parseMasterScript(line).episodes.some(e=>e.kind==='episode'));
 const tail=added.map(e=>`${wrapped?`【${e.title}】`:e.title}\n${e.content}`).join('\n\n');
 return {episodes:[...(project.episodes||[]),...added],masterScript:[source.trim(),tail].filter(Boolean).join('\n\n'),added,firstNumber};
}
// Keep the same episode IDs when a disk write fails. Retrying saves the
// already-applied addition instead of appending the same content twice.
export function prepareDirectorEpisodeAddition(previous,project,content,source,accountId){
 const text=String(content||'').trim();
 if(previous?.accountId===accountId&&previous.projectId===project.id&&previous.content===text){
  if(!previous.result.added.every(e=>project.episodes?.some(current=>current.id===e.id)))throw Error('新增分集已变化，请关闭弹窗后重新检查项目');
  return {...previous,result:{...previous.result,episodes:project.episodes,masterScript:project.masterScript},applied:true};
 }
 return {accountId,projectId:project.id,content:text,result:appendDirectorEpisode(project,text,source),applied:false};
}

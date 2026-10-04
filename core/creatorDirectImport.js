import { uid } from './projectStore.js';
import { normalizeCreatorProject } from './creatorWorkspace.js';
import { createIPProject,importIPNovel } from './ipWorkspace.js';

export const projectNameFromFile=fileName=>String(fileName||'').split(/[\\/]/).at(-1).replace(/\.(?:txt|docx|md)$/i,'').trim()||'导入作品';
const documentText=document=>{
 const content=typeof document?.content==='string'?document.content:'';
 if(!content.trim())throw new Error('文档没有可读取的正文，请重新选择文件');
 return content;
};

/** Boundaries are offsets into the untouched imported text. Scene numbers and
 * numbered story lists must never accidentally become episode boundaries. */
export function parseCompletedScript(content){
 documentText({content});
 const heading=/^[ \t]*(?:#{1,6}[ \t]*)?(?:【)?((?:第[零〇一二两三四五六七八九十百千万\d]+[集幕部]|Episode[ \t]+\d+|EP[ \t]*\d+)[^\r\n]*?)(?:】)?[ \t]*(?:\r?\n|\r|$)/gim;
 const starts=[...content.matchAll(heading)].map(m=>({start:m.index,bodyStart:m.index+m[0].length,title:m[1].replace(/】$/,'').trim()}));
 if(!starts.length)return {detected:false,episodes:[{title:'第1集',type:'episode',content,start:0,end:content.length}]};
 const episodes=[];
 if(starts[0].start>0)episodes.push({title:'设定和小传',type:'settings',content:content.slice(0,starts[0].start),start:0,end:starts[0].start});
 starts.forEach((s,i)=>{const end=starts[i+1]?.start??content.length;episodes.push({...s,end,type:'episode',content:content.slice(s.bodyStart,end)});});
 return {detected:true,episodes};
}

// Allocate identifiers and validate files before setState, so React replaying an
// updater cannot create another project or leave an empty project on failure.
export function prepareNovelProject(document,{duration=60,selection='',groupId=null}={}){
 documentText(document);
 const empty={fruitProjects:[]},created=createIPProject(empty,{name:projectNameFromFile(document.fileName||document.name),duration,groupId});
 const imported=importIPNovel(created,created.fruitProjects[0].id,{...document,name:document.fileName||document.name});
 const project=imported.fruitProjects[0];
 return {...project,creator:{...project.creator,ip:{...project.creator.ip,selection}}};
}

export function prepareCompletedProject(document,{kind='fruit',groupId=null}={}){
 if(!['fruit','ip'].includes(kind))throw new Error('未知成品库类型');
 const content=documentText(document),parsed=parseCompletedScript(content),timestamp=new Date().toISOString();
 const base=kind==='ip'?createIPProject({fruitProjects:[]},{name:projectNameFromFile(document.fileName||document.name),groupId}).fruitProjects[0]
  :normalizeCreatorProject({id:uid(),name:projectNameFromFile(document.fileName||document.name),rating:0,groupId,createdAt:timestamp,updatedAt:timestamp,episodes:[],creator:{mode:'fruit'}},'fruit');
 const entries=kind==='ip'&&!parsed.episodes.some(e=>e.type==='settings')?[{title:'设定和小传',type:'settings',content:'',start:0,end:0},...parsed.episodes]:parsed.episodes;
 const episodes=entries.map(e=>({id:uid(),title:e.title,type:e.type,rawText:e.content,scriptText:e.content,sourceStart:e.start,sourceEnd:e.end,
  inputType:'txt',fileName:document.fileName||document.name||'',finalConfirmed:true,stale:false,status:'completed',chapterIds:[],
  ipVersions:kind==='ip'&&e.content.trim()?[{id:uid(),createdAt:timestamp,label:'导入的完成剧本',content:e.content,chapterIds:[]}]:[],
 }));
 return normalizeCreatorProject({...base,episodes,creator:{...base.creator,
  directImport:{fileName:document.fileName||document.name||'',filePath:document.filePath||'',encoding:document.encoding||'',content,detected:parsed.detected,importedAt:timestamp},
  ...(kind==='ip'?{ip:{...base.creator.ip,completedImport:true}}:{}),
 }},'fruit');
}

export function appendPreparedProject(state,project){
 if(!project?.id||!project?.creator||!Array.isArray(project.episodes))throw new Error('导入项目无效');
 if((state.fruitProjects||[]).some(p=>p.id===project.id))throw new Error('导入项目已存在，请返回成品库继续编辑');
 return {...state,fruitProjects:[...(state.fruitProjects||[]),project]};
}

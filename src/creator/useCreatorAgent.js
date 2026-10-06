import {creatorTaskSlot,creatorTasksConflict,creatorTaskActivity} from '../../core/creatorTaskSlots.js';
import { useRef, useState } from 'react';
import { uid } from '../../core/projectStore.js';
import { normalizeCreatorProject, updateCreatorProject, appendCreatorRecord, creatorInputFingerprint } from '../../core/creatorWorkspace.js';
import { runCreatorTask } from '../../core/creatorAi.js';
import {rewriteWorldInput} from '../../core/rewriteWorld.js';

export function useCreatorAgent({state,setState,getState,api}) {
 const latest=useRef(state);latest.current=state; const jobs=useRef(new Map()); const [activity,setActivity]=useState({});
 const updateRecord=(kind,projectId,recordId,patch)=>setState(s=>{
  const project=s[kind==='fruit'?'fruitProjects':'scriptProjects']?.find(p=>p.id===projectId);if(!project)return s;
  return updateCreatorProject(s,kind,projectId,{records:(project.creator?.records||[]).map(r=>r.id===recordId?{...r,...patch}:r)});
 });
 const run=async({kind,projectId,target,instruction,profile,skillId,scope='project',chat=false,displayInstruction})=>{
  target={...target,scope};
  const currentState=getState?.()||latest.current;
  const project=normalizeCreatorProject(currentState[kind==='fruit'?'fruitProjects':'scriptProjects'].find(p=>p.id===projectId),kind);
  if(!project)throw new Error('项目已移除');
  const rewrite=project.creator.mode==='rewrite',base=`${kind}:${projectId}`,slot=creatorTaskSlot(kind,projectId,target,rewrite);
  if([...jobs.current.entries()].some(([key,job])=>(key===base||key.startsWith(`${base}:`))&&(!rewrite||creatorTasksConflict(job.target,target))))throw new Error('此区域已有任务运行，请等待或停止当前任务');
  const id=`creator-${uid()}`,job={id,target,cancelled:false,reading:-1};jobs.current.set(slot,job);
  const record={id,type:'ai',target:{...target},inputFingerprint:creatorInputFingerprint(project,target),output:'',status:'running',instruction,createdAt:new Date().toISOString(),model:profile.model,skillId,...(target.task==='rewriteWorldSim'?{worldInputSnapshot:rewriteWorldInput(project,target)}:{})};
  setState(s=>{
   let next=appendCreatorRecord(s,kind,projectId,record);
   if(chat){const p=next[kind==='fruit'?'fruitProjects':'scriptProjects'].find(p=>p.id===projectId);next=updateCreatorProject(next,kind,projectId,{chat:[...(p.creator?.chat||[]),{id:uid(),role:'user',content:displayInstruction??instruction,stage:target.section||target.episodeId,createdAt:record.createdAt}]});}
   return next;
  });
  setActivity(a=>({...a,[slot]:{id,target,label:'准备资料',running:true}}));
  try{
   const result=await runCreatorTask({api,state:currentState,project,kind,target,profile,skillId,instruction,taskId:id,scope,isCancelled:()=>job.cancelled,onProgress:progress=>{if(progress.label?.startsWith('阅读资料'))job.reading=progress.completed;else job.reading=-1;setActivity(a=>({...a,[slot]:{...progress,id,target,running:true}}));}});
   if(job.cancelled)throw new Error('任务已停止');
   updateRecord(kind,projectId,id,{output:result.output,status:'pending',meta:result.meta,finishedAt:new Date().toISOString()});
   if(chat)setState(s=>{const p=s[kind==='fruit'?'fruitProjects':'scriptProjects'].find(p=>p.id===projectId);if(!p)return s;return updateCreatorProject(s,kind,projectId,{chat:[...(p.creator?.chat||[]),{id:uid(),role:'assistant',content:result.output,recordId:id,stage:target.section||target.episodeId,model:profile.model,createdAt:new Date().toISOString()}]});});
   return id;
  }catch(error){updateRecord(kind,projectId,id,{status:job.cancelled?'cancelled':'failed',error:error.message,output:error.partialText||'',finishedAt:new Date().toISOString()});throw error;}
  finally{jobs.current.delete(slot);setActivity(a=>({...a,[slot]:{running:false}}));}
 };
 const cancel=async(kind,projectId,target)=>{
  const base=`${kind}:${projectId}`;
  const matches=[...jobs.current.entries()].filter(([slot,job])=>(slot===base||slot.startsWith(`${base}:`))&&(!target||creatorTaskActivity({[slot]:{running:true,target:job.target}},kind,projectId,target).running));
  await Promise.allSettled(matches.flatMap(([,job])=>{job.cancelled=true;return [api.cancelAiTask?.({taskId:job.id}),job.reading>=0?api.cancelAiTask?.({taskId:`${job.id}:read-${job.reading}`}):Promise.resolve()];}));
 };
 return {run,cancel,activity,getActivity:(kind,projectId,target)=>creatorTaskActivity(activity,kind,projectId,target),discoverModels:config=>api.discoverModels?.(config)};
}

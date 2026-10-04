import { useRef,useState } from 'react';
import { getIPProject,mutateIP,ipFingerprint,saveIPVersion,appendIPVersion } from '../../core/ipWorkspace.js';
import { runIPTask } from '../../core/ipAi.js';

export function useIPAgent({state,setState,getState,api}){
 const latest=useRef(state);latest.current=state;
 const jobs=useRef(new Map()),queues=useRef(new Map()),[activity,setActivity]=useState({});
 const run=async({projectId,task,episodeId,profile,instruction='',fromQueue=false})=>{
  if(jobs.current.has(projectId)||queues.current.has(projectId)&&!fromQueue)throw new Error('本项目已有任务在运行');
  const read=()=>getState?.()||latest.current;
  if(episodeId)setState(s=>saveIPVersion(s,projectId,episodeId));
  const project=getIPProject(read(),projectId);if(!project)throw new Error('项目已移除');
  const id=`ip-task-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,job={id,cancelled:false,current:id};jobs.current.set(projectId,job);
  const record={id,type:'ip-task',target:{episodeId},task,model:profile?.model,instruction,createdAt:new Date().toISOString(),status:'running',output:'',diagnostics:[]};
  const patch=delta=>setState(s=>mutateIP(s,projectId,p=>({...p,creator:{...p.creator,records:p.creator.records.map(r=>r.id===id?{...r,...delta}:r)}})));
  setState(s=>mutateIP(s,projectId,p=>({...p,creator:{...p.creator,records:[...p.creator.records,record]}})));
  try{
   const result=await runIPTask({api,project,task,episodeId,profile,instruction,taskId:id,isCancelled:()=>job.cancelled,allowReviewedPrevious:fromQueue,
    onProgress:a=>{job.current=a.taskId;setActivity(s=>({...s,[projectId]:{...a,running:true}}));},
    onRead:r=>setState(s=>mutateIP(s,projectId,p=>p.creator.ip.source?.id!==r.sourceId?p:{...p,creator:{...p.creator,ip:{...p.creator.ip,reading:[...(p.creator.ip.reading||[]).filter(old=>!(old.start===r.start&&old.end===r.end)),r]}}})),
    onDraft:v=>{if(v.type==='version')setState(s=>appendIPVersion(s,projectId,episodeId,{...v,model:profile.model}));else setState(s=>mutateIP(s,projectId,p=>({...p,creator:{...p.creator,records:p.creator.records.map(r=>r.id!==id?r:{...r,output:v.content,diagnostics:[...(r.diagnostics||[]),{...v,createdAt:new Date().toISOString()}]})}})));}
   });
   if(job.cancelled)throw new Error('任务已停止');
   if(result.type==='plan')setState(s=>mutateIP(s,projectId,p=>({...p,creator:{...p.creator,ip:{...p.creator.ip,planCandidates:[...(p.creator.ip.planCandidates||[]),{id,plan:result.plan,sourceId:result.sourceId,createdAt:new Date().toISOString()}]}}})));
   else setState(s=>{const p=getIPProject(s,projectId);if(!p)return s;const unchanged=ipFingerprint(p,episodeId)===result.fingerprint;return appendIPVersion(s,projectId,episodeId,{...result,model:profile.model,stale:!unchanged},{activate:unchanged&&!p.episodes.find(e=>e.id===episodeId)?.scriptText?.trim()});});
   patch({status:'completed',output:result.output||result.content,finishedAt:new Date().toISOString()});
   return result;
  }catch(e){patch({status:job.cancelled?'cancelled':'failed',error:e.message,partialText:e.partialText||'',finishedAt:new Date().toISOString()});throw e;}
  finally{jobs.current.delete(projectId);setActivity(s=>({...s,[projectId]:{running:false}}));}
 };
 const runRemaining=async({projectId,profile,instruction=''})=>{
  if(jobs.current.has(projectId)||queues.current.has(projectId))throw new Error('本项目已有任务在运行');
  const queue={cancelled:false};queues.current.set(projectId,queue);let completed=0;
  try{
   for(;;){
    if(queue.cancelled)throw new Error('连续转写已停止，已生成的分集与版本仍保留');
    const p=getIPProject(getState?.()||latest.current,projectId);if(!p)throw new Error('项目已移除');
    const next=p.episodes.find(e=>e.type==='episode'&&!e.scriptText?.trim());if(!next)break;
    const result=await run({projectId,task:'episode',episodeId:next.id,profile,instruction,fromQueue:true});completed++;
    if(result.issues?.length)throw new Error(`${next.title}已保存，有 ${result.issues.length} 项待核问题。请查看本集原文对照，修改并确认后继续。`);
    const fresh=getIPProject(getState?.()||latest.current,projectId)?.episodes.find(e=>e.id===next.id);
    if(fresh?.scriptText!==result.content)throw new Error(`${next.title}的输入在生成时变化，结果已留在版本中，请核对采用后继续`);
   }
   return completed;
  }finally{queues.current.delete(projectId);setActivity(s=>({...s,[projectId]:{running:false}}));}
 };
 const cancel=async projectId=>{const queue=queues.current.get(projectId);if(queue)queue.cancelled=true;const job=jobs.current.get(projectId);if(!job)return;job.cancelled=true;try{await api.cancelAiTask?.({taskId:job.current});}catch{/* The local cancellation flag still prevents adoption and the next request. */}};
 return {run,runRemaining,cancel,activity};
}

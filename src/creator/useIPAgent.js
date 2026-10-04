import { useRef,useState } from 'react';
import { getIPProject,mutateIP,ipFingerprint,saveIPVersion,appendIPVersion,runRemainingIPTasks } from '../../core/ipWorkspace.js';
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
  const record={id,type:'ip-task',target:{episodeId},task,model:profile?.model,instruction,createdAt:new Date().toISOString(),status:'running',generation:{status:'running',stage:task},output:'',diagnostics:[]};
  let outcome={status:'failed',stage:task,label:'任务未完成'};
  const patch=delta=>setState(s=>mutateIP(s,projectId,p=>({...p,creator:{...p.creator,records:p.creator.records.map(r=>r.id===id?{...r,...delta}:r)}})));
  setState(s=>mutateIP(s,projectId,p=>({...p,creator:{...p.creator,records:[...p.creator.records,record]}})));
  try{
   const result=await runIPTask({api,project,task,episodeId,profile,instruction,taskId:id,isCancelled:()=>job.cancelled,allowReviewedPrevious:fromQueue,
    onProgress:a=>{job.current=a.taskId;setActivity(s=>({...s,[projectId]:{...a,running:true,status:'running',stage:task}}));},
    onRead:r=>setState(s=>mutateIP(s,projectId,p=>p.creator.ip.source?.id!==r.sourceId?p:{...p,creator:{...p.creator,ip:{...p.creator.ip,reading:[...(p.creator.ip.reading||[]).filter(old=>!(old.start===r.start&&old.end===r.end)),r]}}})),
    onDraft:v=>{
     if(v.type==='version')setState(s=>appendIPVersion(s,projectId,episodeId,{...v,model:profile.model}));
     else setState(s=>{
      let next=mutateIP(s,projectId,p=>({...p,creator:{...p.creator,records:p.creator.records.map(r=>r.id!==id?r:{...r,output:v.content,diagnostics:[...(r.diagnostics||[]),{...v,createdAt:new Date().toISOString()}]})}}));
      if(v.type==='settings-ready'&&v.episodeId){const p=getIPProject(next,projectId),unchanged=p&&ipFingerprint(p,v.episodeId)===v.version.fingerprint;next=appendIPVersion(next,projectId,v.episodeId,{...v.version,model:profile.model,stale:!unchanged},{activate:unchanged&&!p.episodes.find(e=>e.id===v.episodeId)?.scriptText?.trim(),invalidateLater:false});}
      return next;
     });
    }
   });
   if(job.cancelled)throw new Error('任务已停止');
   if(result.type==='plan')setState(s=>mutateIP(s,projectId,p=>({...p,creator:{...p.creator,ip:{...p.creator.ip,planCandidates:[...(p.creator.ip.planCandidates||[]),{id,plan:result.plan,sourceId:result.sourceId,createdAt:new Date().toISOString()}]}}})));
   else setState(s=>{const p=getIPProject(s,projectId);if(!p)return s;const unchanged=ipFingerprint(p,episodeId)===result.fingerprint,e=p.episodes.find(e=>e.id===episodeId);return appendIPVersion(s,projectId,episodeId,{...result,model:profile.model,stale:!unchanged},{activate:unchanged&&!e?.scriptText?.trim(),invalidateLater:!(task==='settings'&&e?.type==='settings'&&!e.scriptText?.trim())});});
   outcome={status:'completed',stage:task,label:task==='plan'?`分集规划已生成：${result.plan.episodes.length} 集${result.generation.settings==='generated'?'，设定与小传已生成':''}`:task==='settings'?'设定与人物小传已生成':'本集正文已生成',generation:result.generation||{status:'completed',stage:task}};
   patch({status:'completed',generation:outcome.generation,output:result.output||result.content,finishedAt:new Date().toISOString()});
   return result;
  }catch(e){outcome={status:job.cancelled?'cancelled':'failed',stage:task,label:e.message};patch({status:outcome.status,generation:{status:outcome.status,stage:task},error:e.message,partialText:e.partialText||'',finishedAt:new Date().toISOString()});throw e;}
  finally{jobs.current.delete(projectId);setActivity(s=>({...s,[projectId]:queues.current.has(projectId)?{...outcome,running:true,label:outcome.status==='completed'?'准备下一步…':outcome.label}:{...outcome,running:false}}));}
 };
 const runRemaining=async({projectId,profile,instruction=''})=>{
  if(jobs.current.has(projectId)||queues.current.has(projectId))throw new Error('本项目已有任务在运行');
  const queue={cancelled:false};queues.current.set(projectId,queue);
  try{
   return await runRemainingIPTasks({getProject:()=>getIPProject(getState?.()||latest.current,projectId),isCancelled:()=>queue.cancelled,runTask:input=>run({projectId,profile,instruction,fromQueue:true,...input}),onActivity:a=>setActivity(s=>({...s,[projectId]:a}))});
  }finally{queues.current.delete(projectId);setActivity(s=>({...s,[projectId]:{...s[projectId],running:false}}));}
 };
 const cancel=async projectId=>{const queue=queues.current.get(projectId);if(queue)queue.cancelled=true;const job=jobs.current.get(projectId);if(!job)return;job.cancelled=true;try{await api.cancelAiTask?.({taskId:job.current});}catch{/* The local cancellation flag still prevents adoption and the next request. */}};
 return {run,runRemaining,cancel,activity};
}

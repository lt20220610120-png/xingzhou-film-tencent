import {ipSettingsReviewReason,isIPModelRefusal} from './ipWorkspace.js';

/** First plan auto-adopts; subsequent planning waits only for plan selection. */
export async function runIPAdaptationFlow({getProject,runTask,adoptPlan,plan,continueDraft=false,isCancelled=()=>false,onActivity=()=>{}}){
 const check=()=>{if(isCancelled())throw new Error('任务已停止，已完成内容保留');};
 check();const initial=getProject(),existing=initial?.creator.ip.plan,hasEdition=!!existing||!!initial?.creator.ip.editions?.length;
 const inputs=p=>JSON.stringify([p?.creator.ip.source?.id,p?.creator.ip.duration,p?.creator.ip.requirements||'']),initialInputs=inputs(initial);
 if(!plan&&!continueDraft){
  const result=await runTask({task:'plan',firstDraftMode:true});check();
  if(hasEdition||inputs(getProject())!==initialInputs)return {...result,type:'planCandidate'};
  plan=result.plan;
 }
 if(plan){onActivity({label:'采用规划并建立分集…',running:true});await adoptPlan(plan,{replace:hasEdition});check();}
 const project=getProject(),settings=project?.episodes.find(e=>e.type==='settings');
 if(!project?.creator.ip.plan)throw new Error('请先生成分集规划');
 if(!settings?.scriptText?.trim()||settings.stale||isIPModelRefusal(settings.scriptText)||ipSettingsReviewReason(project)){
  await runTask({task:'settings',episodeId:settings?.id});check();
 }
 const result=await runTask({task:'firstDraft'});check();return result;
}

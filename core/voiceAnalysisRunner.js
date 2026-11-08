import {listCollabEpisodes} from './collabEpisodes.js';
import {voiceAnalysisMessages,validateEpisodeVoices} from './characterVoices.js';
import {requestArtModel} from './artModelQueue.js';
export async function ensureEpisodeVoices({episode,store,api,profile,job={},onProgress=()=>{}}){
  if(!profile)throw Error('请选择对白读取模型');
  if(job.cancelled)return;
  const n=episode.episodeNumber,record=store.snapshot().episodes[n];
  if(record?.sourceContent!==String(episode.content||''))throw Error(`第 ${n} 集清单与正文不一致，请先信息读取`);
  if(record.voiceAnalysis?.sourceContent===String(episode.content||'')&&record.voiceAnalysis.schema>=2&&record.voiceAnalysis.prepared)return {skipped:true};
  job.notice=`读取第 ${n} 集正常对白`;const taskId=crypto.randomUUID();job.taskIds||=[];job.taskIds.push(taskId);onProgress();
  try{
  let analysis,lastError;
  for(let attempt=0;attempt<2&&!job.cancelled;attempt++){
   const messages=voiceAnalysisMessages(episode,record.scenes);
   if(lastError)messages[0]={...messages[0],content:messages[0].content+'\n上次返回未通过校验：'+lastError.message+'。请依据场景原文修正完整JSON。年龄未明示时使用default，不编造阶段或逐字依据。'};
   try{
    const response=await requestArtModel(api,{...profile,profileId:profile.id,messages,taskId,analysisMode:true,maxOutputTokens:8192,resultEnvelope:true},{job});
    if(job.cancelled)return;
    if(response?.ok===false)throw Error(response.error||'对白读取失败');
    const raw=typeof response==='string'?response:response.output;
    const data=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
    analysis=validateEpisodeVoices(episode,record.scenes,data);
    if(!analysis.prepared)throw Error('对白已识别，但人物对白或语言尚未补全');
    break;
   }catch(e){if(job.cancelled)return;lastError=e;analysis=null;}
  }
  if(job.cancelled)return;
  if(!analysis)throw lastError;
  await store.update(n,r=>{if(job.cancelled||r.sourceContent!==analysis.sourceContent)throw Error('正文已变化，旧对白结果未应用');return {...r,voiceAnalysis:analysis,voiceError:''};});
  onProgress();
  }finally{job.taskIds=job.taskIds.filter(id=>id!==taskId);}
}
export async function readProjectVoices({project,store,api,profile,job={},onProgress=()=>{},targetEpisodeNumbers}){
 if(!profile)throw Error('请选择对白读取模型');
 const result={done:0,skipped:0,errors:[]};
 for(const episode of listCollabEpisodes(project.episodes).filter(ep=>!targetEpisodeNumbers?.length||targetEpisodeNumbers.includes(ep.episodeNumber))){
  if(job.cancelled)break;
  try{
   const outcome=await ensureEpisodeVoices({episode,store,api,profile,job,onProgress});
   if(!job.cancelled){if(outcome?.skipped)result.skipped++;else result.done++;}
  }catch(e){
   if(job.cancelled)break;
   const message=`第 ${episode.episodeNumber} 集：${e.message}`;result.errors.push(message);
   if(store.snapshot().episodes?.[episode.episodeNumber])await store.update(episode.episodeNumber,r=>job.cancelled||r.sourceContent!==String(episode.content||'')?r:{...r,voiceError:e.message});
   job.notice=message+'；继续读取后续分集';onProgress();
  }
 }
 return result;
}

import {listCollabEpisodes} from './collabEpisodes.js';
import {voiceAnalysisMessages,validateEpisodeVoices} from './characterVoices.js';
import {requestArtModel} from './artModelQueue.js';
export async function readProjectVoices({project,store,api,profile,job={},onProgress=()=>{}}){
 if(!profile)throw Error('请选择对白读取模型');
 for(const episode of listCollabEpisodes(project.episodes)){
  if(job.cancelled)break;
  const n=episode.episodeNumber,record=store.snapshot().episodes[n];
  if(record?.sourceContent!==String(episode.content||''))throw Error(`第 ${n} 集清单与正文不一致，请先信息读取`);
  if(record.voiceAnalysis?.sourceContent===String(episode.content||''))continue;
  job.notice=`读取第 ${n} 集正常对白`;job.taskId=crypto.randomUUID();onProgress();
  const response=await requestArtModel(api,{...profile,profileId:profile.id,messages:voiceAnalysisMessages(episode,record.scenes),taskId:job.taskId,analysisMode:true,maxOutputTokens:8192,resultEnvelope:true},{job});
  if(job.cancelled)break;
  if(response?.ok===false)throw Error(response.error||'对白读取失败');
  const raw=typeof response==='string'?response:response.output;
  const data=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
  const analysis=validateEpisodeVoices(episode,record.scenes,data);
  await store.update(n,r=>{if(job.cancelled||r.sourceContent!==analysis.sourceContent)throw Error('正文已变化，旧对白结果未应用');return {...r,voiceAnalysis:analysis,voiceError:''};});
  onProgress();
 }
}

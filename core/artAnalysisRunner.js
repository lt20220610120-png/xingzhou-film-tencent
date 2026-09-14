import {parseArtAnalysis,buildAssetRows} from './collabStore.js';
import {buildEpisodeAnalysisMessages} from './collabArtSkill.js';

export function splitAnalysisText(text, limit=2400) {
  const pieces=[];let rest=String(text||'');
  while(rest.length>limit){let cut=rest.lastIndexOf('\n',limit);if(cut<limit/2)cut=limit;else cut++;pieces.push(rest.slice(0,cut));rest=rest.slice(cut);}
  if(rest)pieces.push(rest);return pieces.length?pieces:[''];
}
export async function analysisFingerprint(genre,episode){
  const bytes=new TextEncoder().encode(JSON.stringify(['art-v4-bounded-1',genre,episode.title,episode.content]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validateArtOutput(output,episodeNumber){
  const parsed=parseArtAnalysis(output);
  const episode=parsed.episodes.find(e=>e.episode===episodeNumber);
  if(!episode || !/人物[：:]/.test(output)||!/场景[：:]/.test(output)||!/道具[：:]/.test(output))throw new Error('本段未返回完整的人物、场景、道具清单，已保留原始输出');
  return buildAssetRows({episodes:[episode]});
}
export async function runArtAnalysis({project,genre,profile,api,job,load,save,onProgress}){
  // Every request uses the captured profile; global defaults never participate.
  const selected=structuredClone(profile);
  const episodes=(project.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传');
  if(!episodes.length)throw new Error('没有可分析的分集，请先同步导演项目');
  const ledger=await load()||{episodes:{}};ledger.episodes ||= {};
  const outputNames=new Set();let completed=0;
  for(const [index,episode] of episodes.entries()){
    const number=index+1,key=String(number),fingerprint=await analysisFingerprint(genre,episode);
    let record=ledger.episodes[key];
    if(!record||record.fingerprint!==fingerprint){
      const remote=project.analysis_progress?.[key];
      record=remote?.fingerprint===fingerprint?{fingerprint,chunks:[episode.content||''],outputs:[remote.output],published:true}:{fingerprint,chunks:splitAnalysisText(episode.content),outputs:[],published:false};
      ledger.episodes[key]=record;await save(ledger);
    }
    if(record.failure && /截断|推理|正文|完整/.test(record.failure.message||'')){
      const part=record.failure.part,text=record.chunks[part];
      if(text?.length>900){
        record.failedAttempts=[...(record.failedAttempts||[]),record.failure];
        const smaller=splitAnalysisText(text,Math.ceil(text.length/2));
        record.chunks.splice(part,1,...smaller);record.outputs.splice(part,1,...smaller.map(()=>null));
        delete record.failure;await save(ledger);
      }
    }
    for(let part=0;part<record.chunks.length;part++){
      if(record.outputs[part])continue;
      if(job.cancelled)throw new Error('任务已停止');
      job.notice=`${selected.name} · ${selected.model}｜第 ${number}/${episodes.length} 集 · 第 ${part+1}/${record.chunks.length} 段（已保存 ${completed} 集）`;
      onProgress?.();job.taskId=crypto.randomUUID();
      const names=[...outputNames].slice(-240).join('、');
      const messages=buildEpisodeAnalysisMessages({genre,episodeNumber:number,title:episode.title,content:record.chunks[part],previousSummaries:names?[`已建立的资产名称（相同名称复用免描）：${names}`]:[]});
      const result=await api.aiChat({...selected,profileId:selected.id,messages,taskId:job.taskId,analysisMode:true,maxOutputTokens:16384,resultEnvelope:true});
      const output=typeof result==='string'?result:result.output;
      if(result?.ok===false){record.failure={part,message:result.error,partialText:result.partialText||''};await save(ledger);throw new Error(result.error);}
      record.rawOutput=output;await save(ledger);
      let rows;try{rows=validateArtOutput(output,number);}catch(e){record.failure={part,message:e.message,partialText:output||''};await save(ledger);throw e;}
      record.outputs[part]=output;delete record.failure;delete record.rawOutput;
      record.model=selected.model;record.profileId=selected.id;
      await save(ledger);rows.forEach(r=>outputNames.add(r.name));
    }
    const combined=record.outputs.join('\n\n');
    buildAssetRows(parseArtAnalysis(combined)).forEach(r=>outputNames.add(r.name));
    // Publish is separate from paid generation: reconnect only retries saving.
    if(!record.published){
      job.notice=`第 ${number} 集已保存到本机，正在同步云端…`;onProgress?.();
      await api.collabPublishAnalysis({projectId:project.id,episodeNumber:number,sourceContent:episode.content||'',fingerprint,output:combined,assets:buildAssetRows(parseArtAnalysis(combined)),baseOutput:project.analysis_progress?.[key]?.output||''});
      record.published=true;await save(ledger);
    }
    completed++;job.completed=completed;job.taskId='';
  }
  return {completed,total:episodes.length};
}

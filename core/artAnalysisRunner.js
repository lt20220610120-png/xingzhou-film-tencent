import {parseArtAnalysis,buildAssetRows} from './collabStore.js';
import {buildEpisodeAnalysisMessages} from './collabArtSkill.js';

export function splitAnalysisText(text, limit=1400) {
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
  // A failed cloud upload never invalidates paid local output. Only one cloud
  // writer runs at a time; retries reuse the same fingerprint and base snapshot.
  let cloudUnavailable=false;
  job.sync=async()=>{
    if(job.syncing)return;
    job.syncing=true;
    try {
      for (const [key,record] of Object.entries(ledger.episodes)) {
        if(record.published || record.outputs.length!==record.chunks.length || record.outputs.some(x=>!x))continue;
        const episode=episodes[Number(key)-1];
        if(!episode || record.fingerprint!==await analysisFingerprint(genre,episode))continue;
        try {
          await api.collabPublishAnalysis({projectId:project.id,episodeNumber:Number(key),sourceContent:episode.content||'',fingerprint:record.fingerprint,output:record.outputs.join('\n\n'),assets:buildAssetRows(parseArtAnalysis(record.outputs.join('\n\n'))),baseOutput:record.baseOutput??project.analysis_progress?.[key]?.output??''});
          record.published=true;delete record.syncError;await save(ledger);
        } catch(error) {
          record.syncError=error.message;await save(ledger);cloudUnavailable=true;break;
        }
      }
      job.pending=Object.values(ledger.episodes).filter(r=>!r.published&&r.outputs.length===r.chunks.length&&r.outputs.every(Boolean)).length;
    } finally {job.syncing=false;onProgress?.();}
  };
  const outputNames=new Set(),characterAnchors=new Map();let completed=0;
  const remember=rows=>rows.forEach(row=>{outputNames.add(row.name);if(row.category==='character' && row.description?.length>100 && !characterAnchors.has(row.name))characterAnchors.set(row.name,row.description);});
  for(const [index,episode] of episodes.entries()){
    const number=index+1,key=String(number),fingerprint=await analysisFingerprint(genre,episode);
    let record=ledger.episodes[key];
    if(!record||record.fingerprint!==fingerprint){
      const remote=project.analysis_progress?.[key];
      record=remote?.fingerprint===fingerprint?{fingerprint,chunks:[episode.content||''],outputs:[remote.output],published:true}:{fingerprint,chunks:splitAnalysisText(episode.content),outputs:[],published:false};
      ledger.episodes[key]=record;await save(ledger);
    }
    record.baseOutput ??= project.analysis_progress?.[key]?.output || '';
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
      if(record.outputs[part]){remember(buildAssetRows(parseArtAnalysis(record.outputs[part])));continue;}
      if(job.cancelled)throw new Error('任务已停止');
      job.notice=`${selected.name} · ${selected.model}｜第 ${number}/${episodes.length} 集 · 第 ${part+1}/${record.chunks.length} 段（已保存 ${completed} 集）`;
      onProgress?.();job.taskId=crypto.randomUUID();
      const names=[...outputNames].slice(-240).join('、');
      const anchors=[...characterAnchors].filter(([name])=>record.chunks[part].includes(name.split(/[-—（(]/)[0])).slice(0,6).map(([name,description])=>`${name}：${description}`).join('\n').slice(0,10000);
      const messages=buildEpisodeAnalysisMessages({genre,episodeNumber:number,title:episode.title,content:record.chunks[part],previousSummaries:[names&&`已建立的资产名称（相同名称复用免描）：${names}`,anchors&&`既有角色定妆锚点（换装时保留面貌，不照搬旧衣服）：\n${anchors}`].filter(Boolean)});
      const started=Date.now(),baseNotice=job.notice,taskId=job.taskId;
      const progressTimer=setInterval(async()=>{
        try{const status=await api.aiTaskStatus?.({taskId});if(job.taskId!==taskId)return;job.notice=`${baseNotice} · ${Math.round((Date.now()-started)/1000)} 秒 · ${status?.receivedBytes?`已接收 ${Math.round(status.receivedBytes/1024)} KB，正在生成正文`:'等待接口响应'}`;onProgress?.();}catch{}
      },1000);
      let result;
      try{result=await api.aiChat({...selected,profileId:selected.id,messages,taskId,analysisMode:true,maxOutputTokens:16384,resultEnvelope:true});}
      finally{clearInterval(progressTimer);}
      const output=typeof result==='string'?result:result.output;
      if(result?.ok===false){record.failure={part,message:result.error,partialText:result.partialText||''};await save(ledger);throw new Error(result.error);}
      record.rawOutput=output;await save(ledger);
      let rows;try{rows=validateArtOutput(output,number);}catch(e){record.failure={part,message:e.message,partialText:output||''};await save(ledger);throw e;}
      record.outputs[part]=output;delete record.failure;delete record.rawOutput;
      record.model=selected.model;record.profileId=selected.id;
      await save(ledger);remember(rows);
    }
    const combined=record.outputs.join('\n\n');
    remember(buildAssetRows(parseArtAnalysis(combined)));
    // Publish is separate from paid generation: reconnect only retries saving.
    if(!record.published && !cloudUnavailable){
      job.notice=`第 ${number} 集已保存到本机，正在同步云端…`;onProgress?.();
      await job.sync();
    }
    completed++;job.completed=completed;job.taskId='';
  }
  job.pending=Object.values(ledger.episodes).filter(r=>!r.published&&r.outputs.length===r.chunks.length&&r.outputs.every(Boolean)).length;
  return {completed,total:episodes.length,pending:job.pending};
}

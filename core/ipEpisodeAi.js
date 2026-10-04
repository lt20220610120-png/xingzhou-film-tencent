import { buildSkillMessages } from './skillContext.js';
import { ipOriginal, ipHash, ipFingerprint, parseIPJson, inspectIPScript } from './ipWorkspace.js';
import { episodeSourceRanges, rangeChapters, resolveSourceQuotes } from './ipSourceRanges.js';

const truncated=e=>e?.code==='OUTPUT_TRUNCATED'||/输出被截断|输出截断|output.*truncat|max[_ ]?tokens/i.test(e?.message||'');
const transient=e=>/timeout|超时|fetch|network|网络|ECONN|502|503|504|429|限流|temporar/i.test(e?.message||'');
export const reviewedIPBody=(e,sourceId)=>!e.stale&&(e.finalConfirmed||(e.ipVersions||[]).some(v=>v.content===e.scriptText&&v.sourceId===sourceId&&v.comparison&&Array.isArray(v.issues)));
// The same checkpoint key is retained across retries. Only the final screenplay
// becomes a visible version; partial output and audits stay in task records.
export async function writeIPEpisode({project,episodeId,profile,instruction='',skill,base,invoke,onDraft,isCancelled,allowReviewedPrevious}) {
 const ip=project.creator.ip,source=ip.source,episode=project.episodes.find(e=>e.id===episodeId);
 if(!episode||episode.type!=='episode')throw new Error('请选择具体分集');
 if(!ip.plan||ip.plan.sourceId!==source.id)throw new Error('请先通读小说并采用当前来源的分集规划');
 if(episode.sourceId&&episode.sourceId!==source.id)throw new Error('本集关联旧版小说，请先核对原文范围');
 const ranges=episodeSourceRanges(episode,source),chapters=rangeChapters(ranges,source).map(c=>c.id);
 if(!ranges.length)throw new Error('请先选择本集对应的小说范围');
 const number=project.episodes.filter(e=>e.type==='episode').findIndex(e=>e.id===episodeId)+1;
 const previous=project.episodes.filter(e=>e.type==='episode').slice(0,number-1);
 if(previous.some(e=>!e.scriptText?.trim()))throw new Error('请先完成此前各集正文，再按顺序转写本集');
 if(previous.some(e=>!e.finalConfirmed&&!(allowReviewedPrevious&&reviewedIPBody(e,source.id))||e.stale))throw new Error('此前正文有待确认或变化的集，请核对并确认后再继续');
 const fingerprint=ipFingerprint(project,episodeId),key=ipHash(JSON.stringify([fingerprint,instruction,skill,profile.model]));
 const checkpoints=(project.creator.records||[]).flatMap(r=>r.diagnostics||[]).filter(d=>d.type==='episode-checkpoint'&&d.key===key&&d.episodeId===episodeId);
 const cached=stage=>checkpoints.findLast(d=>d.stage===stage);
 const save=async(stage,content,complete=true,extra={})=>{const d={type:'episode-checkpoint',key,episodeId,stage,content,complete,...extra};checkpoints.push(d);await onDraft(d);};
 const call=async(messages,suffix,label,budget=8192)=>{
  for(let attempt=0;;attempt++)try{return await invoke(messages,`${suffix}${attempt?'-retry'+attempt:''}`,label,budget);}
  catch(e){if(isCancelled()||!transient(e)||attempt>=2)throw e;await onDraft({type:'episode-retry',content:e.partialText||'',stage:suffix,error:e.message});}
 };
 const original=ipOriginal(project,episode),budget=Math.max(1000,Math.ceil((ip.duration===120?70000:40000)/ip.plan.episodes.length));
 const context=[{role:'user',content:`${base}\n当前任务：${episode.scriptText?'依修改要求重写':'忠实转写'}第${number}集。先依次完整重读以下第1至${number-1}集最新正文，再读下一条消息中的原文。摘要不替代回读。\n全剧主线与真实终点：${JSON.stringify(ip.plan)}\n设定：${project.episodes.find(e=>e.type==='settings')?.scriptText||'暂未提取'}\n\n${previous.map(e=>`【${e.title} 最新正文全文】\n${e.scriptText}`).join('\n\n')}`},
 {role:'user',content:`【本集对应小说完整原文】\n${original}\n\n【本集细纲】\n${episode.outline||''}\n【当前右侧稿】\n${episode.scriptText||'尚未生成'}\n章节仅作来源目录，不要求写完整章，也不要求按章切集。以本集选定故事的因果和停点取舍，允许从章内开始或结束；不要将相邻集的场面提前演出。单集预算约${budget}字，可依有效戏份调整，不为字数新增事实。使用 ### 场景${number}-1 内景/外景 地点 日/夜，人物名单、动作、对白、OS/VO；一场一地一时。只输出本集干净正文，来源对照卡另行保存。`}];
 const messages=[...buildSkillMessages(skill,'','小说忠实改编助手').slice(0,-1),...context];
 const plain=async(stage,input,label)=>{
  const old=cached(stage);if(old?.complete)return old.content;
  let output=old?.content||'';
  for(let part=0;part<8;part++){
   let chunk;
   try{chunk=await call(output?[...input,{role:'assistant',content:output},{role:'user',content:'上次输出在此中断。直接从最后一个未写完的字句接续，直到本集正文结束；不要重复已输出部分，不重写开头，不补工作说明。'}]:input,output?`${stage}-continue-${part}`:stage,`${label}${output?' · 自动接续':''}`);}
   catch(e){if(e.partialText){output+=e.partialText;await save(stage,output,false);}if(isCancelled()||!truncated(e))throw e;continue;}
   // Some providers repeat a tail at the continuation boundary.
   let overlap=0;for(let n=Math.min(output.length,chunk.length,1000);n>=20;n--)if(output.endsWith(chunk.slice(0,n))){overlap=n;break;}
   output+=chunk.slice(overlap);await save(stage,output,true);return output;
  }
  throw new Error('本集长输出已保存进度，接口持续截断；再次继续将从保存的位置接续');
 };
 let draft=cached('write')?.content;
 // Recover an initial paid draft produced by 2.7.1 when its inputs still match.
 const index=project.episodes.indexOf(episode);
 const legacyFingerprint=ipHash(JSON.stringify({source:source.id,duration:ip.duration,plan:ip.plan,episode:{id:episode.id,sourceId:episode.sourceId,chapterIds:episode.chapterIds,outline:episode.outline,scriptText:episode.scriptText},previous:project.episodes.slice(0,index).map(e=>[e.id,e.sourceId,e.chapterIds,e.scriptText])}));
 const legacy=!draft&&!episode.sourceRanges&&episode.ipVersions?.findLast(v=>(v.fingerprint===fingerprint||v.fingerprint===legacyFingerprint)&&v.sourceId===source.id&&v.label==='Skill 初稿 · 待对照');
 if(legacy&&!instruction){draft=legacy.content;await save('write',draft);}
 draft=await plain('write',messages,`第${number}集：回读此前正文与小说，转写场景`);
 const reviewPrompt=`本轮只做当集逐场审稿，不再输出正文。对照上面小说与之前最新正文，检查原句、动作、知情、数值、地点、时间、终点。返回简短纯 JSON：{"comparison":"来源章节/原句定位、逐场动作链、保留与删减、发现的问题，不超过700字","corrections":["需要实际修正的错误，明确正文位置和原文依据；无则空数组"],"issues":["材料不足等仍须人工核查的具体问题；原文未展开的设定如已忠实保留不算错误"],"sourceQuotes":[{"startQuote":"本集入选故事起点的原文连续原句，至少12字","endQuote":"本集故事实际停点原文连续原句，至少12字"}]}。源定位允许章内任意切点；不得为了显示章节范围改变故事。正文不放进 JSON；不用Markdown包裹；不能声称做了未做的核对。`;
 const audit=async(content,stage)=>{
  const old=cached(stage);if(old?.complete)return JSON.parse(old.content);
  let last='',error='';
  for(let attempt=0;attempt<3;attempt++){
   const input=[...messages,{role:'assistant',content},{role:'user',content:reviewPrompt+(attempt?`\n上次审稿结构无法解析，请重新返回上述短JSON。错误：${error}。不要重写正文。`:'')}];
   try{
    last=await call(input,`${stage}${attempt?'-format'+attempt:''}`,`第${number}集：逐场核对${attempt?' · 自动修复审稿格式':''}`,3072);
    const result=parseIPJson(last);
    if(typeof result.comparison!=='string'||!result.comparison.trim()||!Array.isArray(result.issues)||result.issues.some(i=>typeof i!=='string')||result.corrections!==undefined&&(!Array.isArray(result.corrections)||result.corrections.some(i=>typeof i!=='string')))throw new Error('缺少对照卡或问题列表');
    await save(stage,JSON.stringify(result));return result;
   }catch(e){if(isCancelled()||!truncated(e)&&!e.message.includes('结构')&&!e.message.includes('对照卡'))throw e;error=e.message;await onDraft({type:'review-error',content:last||e.partialText||'',stage});}
  }
  // A malformed card must not discard a completed screenplay or repeat writing.
  const result={comparison:last||'审稿未返回有效对照卡',issues:['审稿接口连续返回不规范结构，本集正文已保存，需人工核对。'],corrections:[]};
  await save(stage,JSON.stringify(result));return result;
 };
 let result=await audit(draft,'review');
 for(let round=0;round<2&&result.corrections?.length;round++){
  draft=await plain(`revision-${round}`,[...messages,{role:'assistant',content:draft},{role:'user',content:`依据下列原文对照问题修正当前稿，只输出完整修正后的干净本集正文；未涉及部分保持，禁止补剧情。\n${result.corrections.join('\n')}`}],`第${number}集：自动修正原文对照问题`);
  result=await audit(draft,`audit-${round}`);
 }
 let sourceRanges=ranges,mappingIssue=[];
 if(result.sourceQuotes?.length)try{sourceRanges=resolveSourceQuotes(result.sourceQuotes,source,ranges);}catch{mappingIssue=['来源定位句未能唯一匹配，暂保留规划中的原文范围，可手动调整。'];}
 const meta={sourceId:source.id,chapterIds:rangeChapters(sourceRanges,source).map(c=>c.id),sourceRanges,fingerprint,generationKey:key,coverage:previous.map(e=>({episodeId:e.id,title:e.title,characters:e.scriptText.length,contentHash:ipHash(e.scriptText)}))};
 // Old mock/provider schemas may still return a script. Preserve compatibility,
 // while our requests never require a long screenplay in a JSON string.
 const content=result.script?.trim()?result.script:draft;
 return {...meta,type:'version',content,label:'Skill 转写与对照完成稿',comparison:result.comparison,issues:[...new Set([...(result.issues||[]),...(result.corrections||[]),...mappingIssue,...inspectIPScript(content,number)])]};
}

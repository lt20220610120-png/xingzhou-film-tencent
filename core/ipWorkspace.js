import { normalizeCreatorProject, buildCreatorText } from './creatorWorkspace.js';
import { episodeSourceRanges, validateSourceRanges, rangeChapters } from './ipSourceRanges.js';

let sequence=0;
const uid=()=>`ip_${Date.now().toString(36)}_${sequence++}_${Math.random().toString(36).slice(2,7)}`;
const now=()=>new Date().toISOString();
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
export const ipHash=text=>{let h=2166136261;for(const c of String(text)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
export const ipSettingsScopeKey=(sourceId,plan)=>ipHash(JSON.stringify({sourceId,mainline:plan?.mainline||'',ending:plan?.ending||''}));
export const ipAutomaticSettingsVersion=(episode)=>episode?.ipVersions?.findLast(v=>v.content===episode.scriptText&&v.sourceId===episode.sourceId&&v.settingsScopeKey===episode.settingsScopeKey&&String(v.generationKey||'').startsWith('settings-'));
export function ipSettingsReviewReason(project,plan=project.creator.ip.plan){
 const settings=project.episodes.find(e=>e.type==='settings'),source=project.creator.ip.source;
 if(!settings?.scriptText?.trim())return '';
 if(settings.sourceId!==source?.id)return '当前设定与小传关联旧版或未核实的小说来源';
 if(settings.stale)return '当前设定与小传的来源或改编范围已经变化';
 const scope=ipSettingsScopeKey(source?.id,plan),automatic=ipAutomaticSettingsVersion(settings);
 if(automatic?.settingsScopeKey===scope)return '';
 if(settings.finalConfirmed){
  const confirmedScope=settings.settingsScopeKey||automatic?.settingsScopeKey;
  if(confirmedScope&&confirmedScope!==scope)return '当前设定与小传对应另一条主线或真实停点';
  if(!confirmedScope&&project.creator.ip.plan&&ipSettingsScopeKey(source?.id,project.creator.ip.plan)!==scope)return '新规划改变了主线或停点，原有人工设定需要重新核对';
  return '';
 }
 return automatic?'当前自动设定与小传尚未核实为本次主线与真实停点':'当前人工设定与小传尚未确认，请先核对';
}
export const ipSettingsNeedReview=(project,plan)=>!!ipSettingsReviewReason(project,plan);
export function assertIPSettingsReady(project){
 const reason=ipSettingsReviewReason(project);if(!reason)return;
 const episodeId=project.episodes.find(e=>e.type==='settings')?.id;
 throw Object.assign(new Error(`${reason}。请打开“设定和小传”，核对当前小说后重新提取并采用候选，或确认当前人工稿，再继续转写。已有文字会保留。`),{code:'IP_SETTINGS_REVIEW_REQUIRED',episodeId});
}
export const getIPProject=(state,id)=>state.fruitProjects?.find(p=>p.id===id&&p.creator?.mode==='ip');
export function mutateIP(state,id,fn){
 return {...state,fruitProjects:state.fruitProjects.map(p=>p.id!==id?p:{...fn(normalizeCreatorProject(p,'fruit')),updatedAt:now()})};
}
export function createIPProject(state,{name,duration=60,groupId=null}){
 if(!name?.trim())throw new Error('请填写项目名称');
 const p=normalizeCreatorProject({id:uid(),name:name.trim(),groupId,createdAt:now(),updatedAt:now(),episodes:[{id:uid(),title:'设定和小传',type:'settings',rawText:'',scriptText:'',ipVersions:[]}],creator:{mode:'ip',ip:{duration:duration===120?120:60,sources:[],source:null,plan:null,planCandidates:[],reading:[]}}},'fruit');
 return {...state,fruitProjects:[...(state.fruitProjects||[]),p]};
}
export function parseNovel(content,id=uid()){
 if(!String(content||'').trim())throw new Error('小说文档没有可读取的正文');
 // Offsets refer to the imported text verbatim, including CRLF and blank lines.
 const starts=[...content.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(?:第[零〇一二两三四五六七八九十百千万\d]+[章回节]|chapter[ \t]+\d+)[^\r\n]*$/gim)].map(m=>({start:m.index,title:m[0].trim()}));
 if(!starts.length)starts.push({start:0,title:'全文（未识别章节）'});
 else if(starts[0].start>0)starts.unshift({start:0,title:'序／开篇材料'});
 const chapters=starts.map((c,i)=>({...c,id:`${id}_c${i+1}`,number:i+1,end:starts[i+1]?.start??content.length}));
 return {id,content,chapters,fingerprint:ipHash(content),createdAt:now()};
}
export function importIPNovel(state,id,document){
 const source={...parseNovel(document.content),name:document.name||document.fileName||'小说',filePath:document.filePath||''};
 return mutateIP(state,id,p=>({...p,episodes:p.episodes.map(e=>({...e,sourceId:e.sourceId||p.creator.ip.source?.id||source.id,ipVersions:preserve(p,e,'更新小说前的编辑稿'),stale:!!e.scriptText,finalConfirmed:false})),creator:{...p.creator,ip:{...p.creator.ip,completedImport:false,source,sources:[...(p.creator.ip.sources||[]),source],reading:[],plan:null}}}));
}
export const ipSourceFor=(p,sourceId)=>sourceId?(p.creator.ip.sources||[]).find(s=>s.id===sourceId):p.creator.ip.source;
export function ipOriginal(p,episode,version){
 const source=ipSourceFor(p,version?.sourceId||episode.sourceId||p.creator.ip.source?.id);if(!source)return '';
 if(episode.type==='settings')return source.content;
 return episodeSourceRanges(episode,source,version).map(r=>source.content.slice(r.start,r.end)).join('');
}
export function parseIPJson(output){
 const text=String(output||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return JSON.parse(text);}catch{throw new Error('模型返回的结构无法识别，原始结果已留在任务记录，可重新生成。');}
}
export const ipMinimumEpisodes=duration=>duration===120?80:50;
// Omit duration only when validating a partial batch or inspecting legacy data.
// Adoption and new complete planning always supply the selected duration.
export function validateIPPlan(plan,source,duration){
 if(!source)throw new Error('请先导入小说');
 if(!plan||!Array.isArray(plan.episodes)||!plan.episodes.length)throw new Error('分集规划为空');
 if(duration!==undefined&&plan.episodes.length<ipMinimumEpisodes(duration))throw new Error(`${duration===120?120:60}分钟的分集规划至少${ipMinimumEpisodes(duration)}集，当前仅${plan.episodes.length}集；请依据原著真实场面重新划分，材料不足时说明范围，不虚构或补空集。`);
 const ids=new Set(source.chapters.map(c=>c.id));
 const episodes=plan.episodes.map((e,i)=>{
  if(!Array.isArray(e.chapterIds)||!e.chapterIds.length||e.chapterIds.some(id=>!ids.has(id)))throw new Error(`第${i+1}集的原文章节无效，请重新选择来源`);
  const ranges=e.sourceRanges?.length?validateSourceRanges(e.sourceRanges,source):undefined;
  return {title:`第${i+1}集`,outline:String(e.outline||''),chapterIds:ranges?rangeChapters(ranges,source).map(c=>c.id):source.chapters.filter(c=>e.chapterIds.includes(c.id)).map(c=>c.id),...(ranges?{sourceRanges:ranges}:{})};
 });
 return {...plan,episodes};
}
export function applyIPPlan(state,id,plan){
 return mutateIP(state,id,p=>{
  const valid=validateIPPlan(plan,p.creator.ip.source,p.creator.ip.duration),existing=p.episodes.filter(e=>e.type==='episode');
  const episodes=valid.episodes.map((e,i)=>({...existing[i],...e,sourceRanges:e.sourceRanges,id:existing[i]?.id||uid(),sourceId:p.creator.ip.source.id,type:'episode',rawText:'',scriptText:existing[i]?.scriptText||'',ipVersions:existing[i]?preserve(p,existing[i],'重新规划前的编辑稿'):[],stale:!!existing[i]?.scriptText,finalConfirmed:false}));
  const retired=existing.slice(episodes.length).map(e=>({...e,ipVersions:preserve(p,e,'移出规划前的编辑稿'),stale:true,finalConfirmed:false,retiredAt:now()}));
  // Keep obsolete episodes in a recoverable archive, outside the active manuscript and queue.
  const settingsScope=ipSettingsScopeKey(p.creator.ip.source.id,valid);
  const frontmatter=p.episodes.filter(e=>e.type!=='episode').map(e=>{
   if(e.type!=='settings'||!e.scriptText?.trim())return e;
   if(e.sourceId===p.creator.ip.source.id&&ipAutomaticSettingsVersion(e)?.settingsScopeKey===settingsScope)return {...e,stale:false};
   return ipSettingsNeedReview(p,valid)?{...e,stale:true,finalConfirmed:false}:e;
  });
  return {...p,episodes:[...frontmatter,...episodes],creator:{...p.creator,ip:{...p.creator.ip,retiredEpisodes:[...(p.creator.ip.retiredEpisodes||[]),...retired],plan:{...valid,sourceId:p.creator.ip.source.id,acceptedAt:now()}}}};
 });
}
export function addIPEpisode(state,id){return mutateIP(state,id,p=>({...p,episodes:[...p.episodes,{id:uid(),sourceId:p.creator.ip.source?.id,type:'episode',title:`第${p.episodes.filter(e=>e.type==='episode').length+1}集`,rawText:'',scriptText:'',chapterIds:[],ipVersions:[]}]}));}
export function updateIPMapping(state,id,episodeId,chapterIds,outline,sourceRanges){return mutateIP(state,id,p=>{
 const source=p.creator.ip.source;if(!source)throw new Error('请先导入小说');
 if(chapterIds.some(id=>!source.chapters.some(c=>c.id===id)))throw new Error('原文章节已经变化，请重新选择');
 const ranges=sourceRanges?.length?validateSourceRanges(sourceRanges,source):undefined;
 return {...p,episodes:p.episodes.map(e=>e.id===episodeId?{...e,ipVersions:preserve(p,e,'调整章节前的编辑稿'),sourceId:source.id,chapterIds:ranges?rangeChapters(ranges,source).map(c=>c.id):[...chapterIds],sourceRanges:ranges,outline,stale:!!e.scriptText,finalConfirmed:false}:e)};
});}
export function ipFingerprint(p,episodeId){
 const e=p.episodes.find(e=>e.id===episodeId),index=p.episodes.indexOf(e);
 return ipHash(JSON.stringify({source:p.creator.ip.source?.id,duration:p.creator.ip.duration,plan:p.creator.ip.plan,episode:e&&{id:e.id,sourceId:e.sourceId,chapterIds:e.chapterIds,sourceRanges:e.sourceRanges,outline:e.outline,scriptText:e.scriptText},previous:p.episodes.slice(0,index).map(e=>[e.id,e.sourceId,e.chapterIds,e.sourceRanges,e.scriptText])}));
}
const snapshot=(p,e,label,extra={})=>({id:uid(),createdAt:now(),label,content:e.scriptText||'',sourceId:e.sourceId||p.creator.ip.source?.id,chapterIds:[...(e.chapterIds||[])],sourceRanges:copy(e.sourceRanges),outline:e.outline||'',...(e.settingsScopeKey?{settingsScopeKey:e.settingsScopeKey}:{}),...extra});
const preserve=(p,e,label)=>{
 const versions=e.ipVersions||[];
 return !e.scriptText?.trim()||versions.some(v=>v.content===e.scriptText&&v.sourceId===(e.sourceId||p.creator.ip.source?.id)&&JSON.stringify(v.chapterIds||[])===JSON.stringify(e.chapterIds||[])&&JSON.stringify(v.sourceRanges)===JSON.stringify(e.sourceRanges))?versions:[...versions,snapshot(p,e,label)];
};
export function updateIPDraft(state,id,episodeId,content){return mutateIP(state,id,p=>{
 const index=p.episodes.findIndex(e=>e.id===episodeId);if(index<0)throw new Error('当前分集已移除');
 return {...p,episodes:p.episodes.map((e,i)=>i===index?{...e,scriptText:content,finalConfirmed:false}:i>index&&e.scriptText?{...e,stale:true,finalConfirmed:false}:e)};
});}
export function saveIPVersion(state,id,episodeId,label='手动编辑存档'){return mutateIP(state,id,p=>({...p,episodes:p.episodes.map(e=>e.id===episodeId?{...e,ipVersions:preserve(p,e,label)}:e)}));}
export function appendIPVersion(state,id,episodeId,version,{activate=false,invalidateLater=true}={}){return mutateIP(state,id,p=>{
 const index=p.episodes.findIndex(e=>e.id===episodeId);if(index<0)throw new Error('分集已移除，结果保留在任务记录');
 return {...p,episodes:p.episodes.map((e,i)=>{
  if(i!==index)return activate&&invalidateLater&&i>index&&e.scriptText?{...e,stale:true,finalConfirmed:false}:e;
  const versions=preserve(p,e,'生成前的编辑稿'),existing=version.generationKey&&versions.find(v=>v.generationKey===version.generationKey&&v.content===version.content);
  return {...e,ipVersions:existing?versions:[...versions,snapshot(p,e,version.label||'Agent 候选',{...version,id:version.id||uid(),sourceId:version.sourceId||p.creator.ip.source?.id})],...(activate?{scriptText:version.content,sourceId:version.sourceId||p.creator.ip.source?.id,chapterIds:version.chapterIds||e.chapterIds,sourceRanges:version.sourceRanges||e.sourceRanges,...(e.type==='settings'?{settingsScopeKey:version.settingsScopeKey}:{}),stale:false,finalConfirmed:false}:{})};
 })};
});}
export function adoptIPVersion(state,id,episodeId,versionId){return mutateIP(state,id,p=>{
 const index=p.episodes.findIndex(e=>e.id===episodeId),e=p.episodes[index],v=e?.ipVersions?.find(v=>v.id===versionId);if(!v)throw new Error('此版本已删除');
 return {...p,episodes:p.episodes.map((node,i)=>i===index?{...node,ipVersions:preserve(p,node,'切换前的编辑稿'),scriptText:v.content,sourceId:v.sourceId,chapterIds:v.chapterIds||node.chapterIds,sourceRanges:v.sourceRanges,outline:v.outline??node.outline,...(node.type==='settings'?{settingsScopeKey:v.settingsScopeKey}:{}),stale:v.sourceId!==p.creator.ip.source?.id||node.type==='settings'&&!!v.settingsScopeKey&&v.settingsScopeKey!==ipSettingsScopeKey(p.creator.ip.source?.id,p.creator.ip.plan),finalConfirmed:false}:i>index&&node.scriptText?{...node,stale:true,finalConfirmed:false}:node)};
});}
export function deleteIPVersion(state,id,episodeId,versionId){return mutateIP(state,id,p=>({...p,episodes:p.episodes.map(e=>e.id===episodeId?{...e,ipVersions:(e.ipVersions||[]).filter(v=>v.id!==versionId)}:e)}));}
export function confirmIPEpisode(state,id,episodeId){return mutateIP(state,id,p=>{
 const e=p.episodes.find(e=>e.id===episodeId);if(!e?.scriptText?.trim())throw new Error('请先完成本集正文');
 if(e.sourceId&&e.sourceId!==p.creator.ip.source?.id)throw new Error('此稿关联旧版小说，请先核对并调整为当前小说章节后确认');
 return {...p,episodes:p.episodes.map(e=>e.id===episodeId?confirmIPNode(p,e):e)};
});}
const confirmIPNode=(p,e)=>({...e,ipVersions:preserve(p,e,'人工确认稿'),...(e.type==='settings'?{settingsScopeKey:ipSettingsScopeKey(p.creator.ip.source?.id,p.creator.ip.plan)}:{}),stale:false,finalConfirmed:true});
export function ipConfirmationSummary(project){
 const nodes=(project?.episodes||[]).filter(e=>e.type==='episode'||e.type==='settings'),filled=nodes.filter(e=>e.scriptText?.trim());
 const alreadyConfirmed=filled.filter(e=>e.finalConfirmed&&!e.stale).length;
 return {episodes:filled.filter(e=>e.type==='episode').length,settings:filled.filter(e=>e.type==='settings').length,emptyEpisodes:nodes.filter(e=>e.type==='episode'&&!e.scriptText?.trim()).length,emptySettings:nodes.filter(e=>e.type==='settings'&&!e.scriptText?.trim()).length,alreadyConfirmed,pending:filled.length-alreadyConfirmed};
}
export function assertIPConfirmationReady(project){
 if(!project)throw new Error('项目已移除');
 const filled=project.episodes.filter(e=>(e.type==='episode'||e.type==='settings')&&e.scriptText?.trim());
 if(!filled.length)throw new Error('当前没有可确认的设定或正文，请先完成创作');
 // Validate the complete batch before snapshotting or changing any node.
 // This matches single confirmation and prevents a half-confirmed manuscript.
 const oldSource=filled.find(e=>e.sourceId&&e.sourceId!==project.creator.ip.source?.id);
 if(oldSource)throw new Error(`${oldSource.title||'当前稿'}关联旧版小说，请先核对并调整为当前小说章节后确认；本次未确认任何内容。`);
 return filled;
}
export function confirmAllIPEpisodes(state,id){
 const current=getIPProject(state,id),filled=assertIPConfirmationReady(current);
 if(ipConfirmationSummary(current).pending===0)return state;
 const targets=new Set(filled.map(e=>e.id));
 return mutateIP(state,id,p=>{
  // Settings and bodies are confirmed together, without edit invalidation.
  return {...p,episodes:p.episodes.map(e=>targets.has(e.id)?confirmIPNode(p,e):e)};
 });
}
export function restoreRetiredIPEpisode(state,id,episodeId){return mutateIP(state,id,p=>{
 const e=(p.creator.ip.retiredEpisodes||[]).find(e=>e.id===episodeId);if(!e)throw new Error('找不到已移出的分集');
 const restored={...e,title:`第${p.episodes.filter(e=>e.type==='episode').length+1}集`,stale:true,finalConfirmed:false};
 return {...p,episodes:[...p.episodes,restored],creator:{...p.creator,ip:{...p.creator.ip,retiredEpisodes:p.creator.ip.retiredEpisodes.filter(e=>e.id!==episodeId)}}};
});}
export function ipBodyCount(p){return p.episodes.filter(e=>e.type==='episode').reduce((n,e)=>n+String(e.scriptText||'').replace(/^\s*#{0,2}\s*第[^\n]*集[^\n]*$/gm,'').replace(/^#{1,6}\s+/gm,'').replace(/\s/g,'').length,0);}
export function inspectIPScript(content,number){
 const headings=[...String(content).matchAll(/^\s*(?:#{1,6}\s*)?(?:场景\s*)?(\d+)\s*[-－]\s*(\d+)\s+([^\n]+)/gm)],issues=[];
 if(!headings.length)issues.push('机械检查：未识别到集—场编号，请核对场景头');
 else if(headings.some((h,i)=>Number(h[1])!==number||Number(h[2])!==i+1))issues.push(`机械检查：场号应为 ${number}-1、${number}-2，按本集连续编号`);
 const count=ipBodyCount({episodes:[{type:'episode',scriptText:content}]});
 if(count<1000)issues.push(`篇幅提示：本集正文 ${count} 个非空白字符，低于常见 1000 字预算；回查原文是否漏掉有效场面，不为凑字新增剧情`);
 return issues;
}
export const ipMaster=p=>buildCreatorText(p,'fruit','output');
export function updateIPMeta(state,id,patch){return mutateIP(state,id,p=>{
 const durationChanged=patch.duration!==undefined&&patch.duration!==p.creator.ip.duration;
 return {...p,...(durationChanged?{episodes:p.episodes.map(e=>({...e,stale:!!e.scriptText,finalConfirmed:false}))}:{}),creator:{...p.creator,ip:{...p.creator.ip,...copy(patch),...(durationChanged?{plan:null,planCandidates:[]}: {})}}};
});}

// Queue orchestration stays independent of React so checkpoints and saved
// drafts can be read from the current project after each asynchronous task.
export async function runRemainingIPTasks({getProject,runTask,isCancelled=()=>false,onActivity=()=>{}}){
 let completed=0,settingsGenerated=false,stage='settings';
 const current=()=>{const p=getProject();if(!p)throw new Error('项目已移除');if(isCancelled())throw new Error('连续转写已停止，已生成的设定、分集与版本仍保留');return p;};
 const report=(status,label)=>onActivity({status,stage,label,completed,settingsGenerated,running:status==='running'});
 try{
  let p=current();
  if(!p.creator.ip.source||p.creator.ip.plan?.sourceId!==p.creator.ip.source.id)throw new Error('请先采用当前小说的分集规划，再连续转写');
  const settings=p.episodes.find(e=>e.type==='settings');
  if(!settings)throw new Error('缺少设定与小传节点，请重新打开项目后继续');
  assertIPSettingsReady(p);
  if(!settings.scriptText?.trim()){
   report('running','先补齐设定与人物小传…');
   const result=await runTask({task:'settings',episodeId:settings.id});
   p=current();
   if(p.episodes.find(e=>e.id===settings.id)?.scriptText!==result.content)throw new Error('设定输入在生成时变化，结果已留在版本中，请核对采用后继续');
   settingsGenerated=true;
  }
  stage='episodes';
  for(;;){
   p=current();const next=p.episodes.find(e=>e.type==='episode'&&!e.scriptText?.trim());if(!next)break;
   report('running',`连续转写：${next.title||'下一集'}…`);
   const result=await runTask({task:'episode',episodeId:next.id});
   const fresh=current().episodes.find(e=>e.id===next.id);
   if(fresh?.scriptText!==result.content)throw new Error(`${next.title}的输入在生成时变化，结果已留在版本中，请核对采用后继续`);
   completed++;
  }
  report('completed',`本次连续转写已完成 ${completed} 集${settingsGenerated?'，并补齐设定与小传':''}`);
  return {status:'completed',completed,settingsGenerated};
 }catch(error){report(isCancelled()?'cancelled':'failed',error.message);throw Object.assign(error,{completed,settingsGenerated,stage});}
}

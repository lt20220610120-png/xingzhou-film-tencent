import {buildSkillContext} from './skillContext.js';
import {parseDirectorScenes,parseMasterScript} from './scriptImport.js';
import {buildProjectPreamble,collectDirectorPromptHistory} from './projectStore.js';
import {buildSceneSourceTape,NONFINAL_DURATION_RATIO} from './directorSegmentation.js';
export {markPromptTimingStale} from './promptTiming.js';

const SHA256_K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotate = (x,n) => (x >>> n) | (x << (32-n));
// Browser-compatible synchronous SHA256 lets the final pure reducer verify the
// latest documents too, including after checkpoint recovery; no Node dependency.
export function sha256Text(value) {
  const input = new TextEncoder().encode(String(value ?? ''));
  const bytes = new Uint8Array(Math.ceil((input.length+9)/64)*64);
  bytes.set(input); bytes[input.length]=0x80;
  const view = new DataView(bytes.buffer), bits=input.length*8;
  view.setUint32(bytes.length-8,Math.floor(bits/0x100000000)); view.setUint32(bytes.length-4,bits>>>0);
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w=new Uint32Array(64);
  for(let offset=0;offset<bytes.length;offset+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
    for(let i=16;i<64;i++){
      const a=w[i-15],b=w[i-2],s0=rotate(a,7)^rotate(a,18)^(a>>>3),s1=rotate(b,17)^rotate(b,19)^(b>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,j]=h;
    for(let i=0;i<64;i++){
      const t1=(j+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^((~e)&g))+SHA256_K[i]+w[i])>>>0;
      const t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    [a,b,c,d,e,f,g,j].forEach((n,i)=>{h[i]=(h[i]+n)>>>0;});
  }
  return h.map(n=>n.toString(16).padStart(8,'0')).join('');
}

export const directorSettingText = (project) => String(project?.episodes?.find(ep=>ep.kind==='setting' || ep.title==='设定和小传')?.content
  ?? parseMasterScript(project?.masterScript || '').setting);

export function directorSceneInput(project,episode,sceneLabel) {
  const number=(project?.episodes || []).filter(ep=>ep.kind!=='setting' && ep.title!=='设定和小传').findIndex(ep=>ep.id===episode?.id)+1;
  const scene=parseDirectorScenes(episode?.content || '',Math.max(1,number)).find(item=>item.label===sceneLabel);
  if(!scene)return null;
  return Object.hasOwn(episode.quickSceneEdits || {},sceneLabel) ? String(episode.quickSceneEdits[sceneLabel] ?? '') : scene.content;
}

// Explicit public fields prevent credentials, custom authorization headers and
// arbitrary provider extensions from entering durable fingerprints or payloads.
export const publicModelConfiguration = (profile) => ({
  protocol:profile?.protocol || '',provider:profile?.provider || '',
  endpoint:profile?.endpoint || profile?.baseUrl || '',
  model:profile?.model || profile?.modelName || profile?.model_id || '',
  reasoningEffort:profile?.reasoningEffort || '',requiresApiKey:profile?.requiresApiKey ?? null,
  contextWindowTokens:profile?.contextWindowTokens || profile?.contextWindow || profile?.maxContextTokens || null,
});

export function directorSettingsHash({project,episode,maxDurationSeconds}) {
  return sha256Text(JSON.stringify({maxDurationSeconds,style:project?.style || '',aspectRatio:project?.aspectRatio || '',
    settingText:directorSettingText(project),episodeSourceHash:sha256Text(String(episode?.content ?? '')),rulesVersion:1}));
}

function snapshotOf({accountId,project,episode,sceneLabel,inputText,maxDurationSeconds,skill,profile}) {
  if(!accountId || !project?.id || !episode?.id || !sceneLabel || !skill?.id || !profile?.id)throw new Error('场景目标、账号、Skill 或模型配置已不存在');
  if(!Number.isInteger(maxDurationSeconds) || maxDurationSeconds<1 || maxDurationSeconds>30)throw new Error('最高视频时长必须是1～30的整数秒');
  if(inputText == null)throw new Error('场景原文已不存在');
  const sourceSnapshot=String(inputText),style=project.style || '',aspectRatio=project.aspectRatio || '',settingText=directorSettingText(project),rulesVersion=1;
  return {
    accountId,projectId:project.id,episodeId:episode.id,sceneLabel,sourceSnapshot,
    sourceHash:sha256Text(sourceSnapshot),
    episodeSourceHash:sha256Text(String(episode.content ?? '')),
    settingsHash:directorSettingsHash({project,episode,maxDurationSeconds}),
    skillId:skill.id,skillHash:sha256Text(JSON.stringify({name:skill.name || '',context:buildSkillContext(skill)})),
    profileId:profile.id,profileHash:sha256Text(JSON.stringify(publicModelConfiguration(profile))),
    maxDurationSeconds,style,aspectRatio,settingText,rulesVersion,
  };
}

export async function createSceneSnapshot(context) { return snapshotOf(context); }

const snapshotFields=['accountId','projectId','episodeId','sceneLabel','sourceHash','episodeSourceHash','settingsHash','skillId','skillHash','profileId','profileHash','rulesVersion'];
export async function snapshotMatchesContext(snapshot,context) {
  try { const current=snapshotOf({...context,maxDurationSeconds:context.maxDurationSeconds ?? snapshot.maxDurationSeconds});
    return snapshotFields.every(key=>current[key]===snapshot[key]);
  } catch { return false; }
}

const fail = (state,message) => ({state,applied:false,conflict:message});
export function commitQuickSceneRun(state,run,{partial=false}={}) {
  const snapshot=run?.snapshot,plan=run?.plan,ids=run?.promptIds;
  if(!snapshot || !run.id || !run.commitKey || !plan?.id || !Array.isArray(plan.segments) || !plan.segments.length || !Array.isArray(ids)
    || ids.length!==plan.segments.length || ids.some(id=>!id) || new Set(ids).size!==ids.length)return fail(state,'自动生成任务或预分配提示词编号不完整');
  if(state.accountId!==snapshot.accountId)return fail(state,'当前账号已变化，不能提交其他账号的任务');
  const project=state.directorProjects?.find(p=>p.id===snapshot.projectId),episode=project?.episodes?.find(ep=>ep.id===snapshot.episodeId);
  if(!project || !episode)return fail(state,'目标项目或分集已删除，草稿已保留');
  if(project.cloudLocked || project.canWrite===false || project.permissions?.canWrite===false || project.permissions?.canGenerate===false || project.cloudConflict || episode.canWrite===false)return fail(state,'当前项目不可写入，请先核对权限或云端冲突');
  const tombstones=new Set([...(project.deletedPromptIds || []),...(project.episodes || []).flatMap(ep=>ep.deletedPromptIds || [])]);
  if(ids.some(id=>tombstones.has(id)))return fail(state,'本次结果已被删除，不能通过恢复重新添加');
  const history=collectDirectorPromptHistory(project),current=episode.prompts || [];
  const belongs=(prompt,i)=>prompt?.generationRunId===run.id && prompt?.segmentId===plan.segments[i].id && prompt?.segmentationPlanId===plan.id;
  if(ids.every((id,i)=>belongs(current.find(pr=>pr.id===id),i) && belongs(history.find(pr=>pr.id===id),i)) && (partial ? ids.every((id,i)=>current.find(pr=>pr.id===id)?.content===run.segmentDrafts?.[plan.segments[i].id]?.prompt?.content) : ids.every(id=>current.find(pr=>pr.id===id)?.sceneAuditStatus!=='pending')))return {state,applied:true};
  if(ids.some((id,i)=>[history.find(pr=>pr.id===id),current.find(pr=>pr.id===id)].some(pr=>pr&&!belongs(pr,i))))return fail(state,'提示词编号已有不完整或冲突的提交，请核对历史');
  let latest;
  try { latest=snapshotOf({accountId:state.accountId,project,episode,sceneLabel:snapshot.sceneLabel,inputText:directorSceneInput(project,episode,snapshot.sceneLabel),maxDurationSeconds:snapshot.maxDurationSeconds,
    skill:state.skills?.find(s=>s.id===snapshot.skillId),profile:state.apiProfiles?.find(p=>p.id===snapshot.profileId)}); }
  catch(error){return fail(state,error.message);}
  if(!snapshotFields.every(key=>snapshot[key]===latest[key]))return fail(state,'场景原文、项目设定、Skill 或模型已变化，请重新生成');
  if(!partial && run.checks?.audited!==true)return fail(state,'全场审核尚未完成，结果继续保留为草稿');
  if(['sourceHash','settingsHash','skillHash','profileHash','sceneLabel','maxDurationSeconds','rulesVersion'].some(key=>plan[key]!==snapshot[key]))return fail(state,'分段计划与生成快照不匹配');
  if(typeof plan.sourceText!=='string' || typeof plan.sceneHeader!=='string')return fail(state,'分段原文带不完整');
  const tape=buildSceneSourceTape(snapshot.sourceSnapshot);
  if(plan.sourceText!==tape.sourceText || plan.sceneHeader!==tape.sceneHeader)return fail(state,'分段正文与固定原文不匹配，不能发布改写后的计划');
  const segmentIds=new Set();let end=0;
  for(const [i,segment] of plan.segments.entries()){
    const draft=run.segmentDrafts?.[segment.id];
    if(!segment.id || segmentIds.has(segment.id) || segment.index!==i+1 || segment.sourceStart!==end || !Number.isInteger(segment.sourceEnd) || segment.sourceEnd<=end || segment.sourceEnd>plan.sourceText.length
      || !(segment.estimatedSeconds>0) || !Number.isFinite(segment.estimatedSeconds) || segment.estimatedSeconds>snapshot.maxDurationSeconds
      || (i<plan.segments.length-1 && segment.estimatedSeconds<Math.ceil(snapshot.maxDurationSeconds*NONFINAL_DURATION_RATIO))
      || segment.recommendedDurationSeconds!==Math.ceil(segment.estimatedSeconds) || (!partial && !draft?.validated)
      || (draft?.validated && (draft.prompt?.label!==`${snapshot.sceneLabel}-${i+1}` || !String(draft.prompt?.content || '').trim())))return fail(state,'分段草稿尚未完整校验，不能发布部分结果');
    segmentIds.add(segment.id);end=segment.sourceEnd;
  }
  if(end!==plan.sourceText.length)return fail(state,'分段计划未覆盖完整场景');
  const existingPlan=(episode.quickScenePlans || []).find(p=>p.id===plan.id);
  if(existingPlan && JSON.stringify(existingPlan)!==JSON.stringify(plan))return fail(state,'同一分段计划编号存在不同内容');
  const timestamp=run.updatedAt || plan.createdAt || new Date().toISOString(),preamble=buildProjectPreamble(project);
  const prompts=plan.segments.flatMap((segment,i)=>run.segmentDrafts?.[segment.id]?.validated?[{
    id:ids[i],label:run.segmentDrafts[segment.id].prompt.label,content:run.segmentDrafts[segment.id].prompt.content,
    sourceText:[preamble,plan.sceneHeader,plan.sourceText.slice(segment.sourceStart,segment.sourceEnd)].filter(Boolean).join('\n\n'),
    skillId:snapshot.skillId,skillName:state.skills.find(s=>s.id===snapshot.skillId)?.name || '',profileId:snapshot.profileId,
    generationMode:'quick',segmentationMode:'auto',generationRunId:run.id,segmentationPlanId:plan.id,segmentId:segment.id,
    sourceHash:snapshot.sourceHash,maxDurationSeconds:snapshot.maxDurationSeconds,estimatedSeconds:segment.estimatedSeconds,
    recommendedDurationSeconds:segment.recommendedDurationSeconds,durationStatus:'estimated',timingRulesVersion:1,createdAt:current.find(pr=>pr.id===ids[i])?.createdAt || timestamp,
    sceneAuditStatus:partial?'pending':run.auditWarnings?.length?'warning':'passed',
    ...(run.auditWarnings?.length ? {sceneAuditWarnings:run.auditWarnings.map(item=>({code:item.code,message:item.message,segmentIndex:item.segmentIndex}))} : {}),
  }]:[]);
  if(!prompts.length)return fail(state,'尚无通过逐条核对的结果');
  if(prompts.some(pr=>current.some(old=>old.id===pr.id&&old.content!==pr.content&&old.durationStatus==='needs-review')))return fail(state,'已生成提示词被手工修改，保留修改并停止覆盖');
  const replacements=new Map(prompts.map(pr=>[pr.id,pr]));
  const merge=existing=>[...existing.map(pr=>replacements.get(pr.id)||pr),...prompts.filter(pr=>!existing.some(old=>old.id===pr.id))];
  const nextEpisode={...episode,...(!partial?{status:'已生成提示词'}:{}),prompts:merge(current),quickScenePlans:existingPlan ? episode.quickScenePlans : [...(episode.quickScenePlans || []),plan],activeQuickScenePlanIds:{...(episode.activeQuickScenePlanIds || {}),[snapshot.sceneLabel]:plan.id}};
  const nextProject={...project,episodes:project.episodes.map(ep=>ep.id===episode.id?nextEpisode:ep),promptHistory:merge(history),updatedAt:timestamp};
  return {state:{...state,directorProjects:state.directorProjects.map(p=>p.id===project.id?nextProject:p)},applied:true};
}

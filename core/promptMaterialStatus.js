import {bindingProblems,entryBindingSignature} from './promptArtBinding.js';
import {promptReviewMatches} from './promptReviewBatch.js';
import {hasActiveDistributionClaim} from './promptDistributionService.js';

export const materialStatusLabels={unlinked:'待关联',stale:'关联已过期',missing:'待补充',failed:'关联失败',interrupted:'上次未完成',blocked:'清单待完成',media:'素材待就绪',unpublished:'待发布',ready:'分镜就绪',queued:'排队中',preparing:'准备清单',waiting:'等待请求',requesting:'关联中',receiving:'接收结果',saving:'保存中',retrying:'重试中',running:'其他窗口处理中'};
const phases=new Set(['queued','preparing','waiting','requesting','receiving','saving','retrying','running']);
export function promptMaterialRow(state,entry,distribution={}){
 const {snapshot,decisions={},saved}=state,decision=decisions[entry.id],current=!!decision&&decision.signature===entryBindingSignature(snapshot,entry);
 const problems=bindingProblems(snapshot,entry,decision),mediaProblems=problems.length?[]:bindingProblems(snapshot,entry,decision,{requireImages:true});
 const associated=!!decision&&decision.origin!=='rules'&&!problems.length;
 const review=saved?.versions?.[snapshot.versionId]?.reviews?.[entry.id];
 const approved=associated&&promptReviewMatches(snapshot,entry,decision,review),published=!!approved&&review?.published===true;
 const attempt=saved?.sceneDistributionAttempts?.[snapshot.versionId+':'+entry.id],live=distribution.entryTasks?.[entry.id],task=live&&(!live.versionId||live.versionId===snapshot.versionId)?live:null;
 const counts={character:0,scene:0,prop:0,voice:current?new Set((decision.speakers||[]).map(s=>s.voiceUid)).size:0};
 if(current)for(const category of ['character','scene','prop'])counts[category]=new Set((decision.needs||[]).filter(n=>n.visibility==='visible'&&n.cardUid&&n.category===category).map(n=>n.cardUid)).size;
 const noReference=associated&&!(decision.needs||[]).some(n=>n.visibility==='visible')&&!decision.speakers?.length;
 let status=associated?(mediaProblems.length?'media':published?'ready':'unpublished'):!entry.sceneReady?'blocked':current&&(decision.needs||[]).some(n=>n.visibility==='visible'&&!n.cardUid)?'missing':decision&&!current?'stale':'unlinked';
 let issues=associated?mediaProblems:problems;
 if(!associated&&attempt?.status==='failed'){status='failed';issues=[attempt.error||'关联未完成',...issues];}
 if(!associated&&attempt?.status==='done'&&status==='unlinked')status='failed';
 if(!associated&&attempt?.status==='running'){status=hasActiveDistributionClaim(attempt)?'running':'interrupted';}
 if(task&&phases.has(task.phase))status=task.phase;
 return {entry,status,label:status==='queued'&&task?.queuePosition?`排队第 ${task.queuePosition} 位`:materialStatusLabels[status],associated,approved:!!approved,published,mediaReady:associated&&!mediaProblems.length,ready:status==='ready',noReference,counts,issues:[...new Set(issues)],task,needsAttention:status!=='ready',processing:phases.has(status)};
}
export function promptMaterialOverview(state,distribution={}){
 const rows=(state.snapshot?.entries||[]).map(e=>promptMaterialRow(state,e,distribution)).sort((a,b)=>a.entry.label.localeCompare(b.entry.label,'zh-CN',{numeric:true}));
 const aggregate=values=>({total:values.length,associated:values.filter(r=>r.associated).length,published:values.filter(r=>r.published).length,ready:values.filter(r=>r.ready).length,processing:values.filter(r=>r.processing).length,failed:values.filter(r=>['failed','interrupted'].includes(r.status)).length,media:values.filter(r=>r.status==='media').length,unlinked:values.filter(r=>!r.associated&&!r.processing).length});
 const groups=new Map();for(const row of rows){if(!groups.has(row.entry.sceneId))groups.set(row.entry.sceneId,[]);groups.get(row.entry.sceneId).push(row);}
 const scenes=[...groups].map(([id,items])=>({id,episode:items[0].entry.episode,rows:items,...aggregate(items)}));
 return {rows,scenes,...aggregate(rows)};
}

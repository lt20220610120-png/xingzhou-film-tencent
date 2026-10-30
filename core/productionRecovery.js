import {bindingProblems,entryBindingSignature,cardInEntry,bindingHash} from './promptArtBinding.js';

export const isFundingError=error=>/insufficient[_ -](?:quota|balance|credits?)|not enough (?:quota|credits?|points)|quota.*(?:insufficient|exhausted)|credit balance.*(?:low|insufficient)|余额不足|额度不足|积分.*不足|欠费|充值|余额.*不足|FT请求失败[（(]402[）)]/i.test(String(error?.message||error||''));
export const productionRecoveryFingerprint=(goals,config={})=>bindingHash([goals.map(g=>[g.kind,g.target,String(g.error||'').replace(/\(?request[ _-]?id\s*[:=]\s*[^\s)]+\)?/ig,'request-id').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig,'id').replace(/\d{4}-\d\d-\d\d[T ][\d:.Z+-]+/g,'time')]),config.imageModel,config.fallbackImageModel,config.videoModel]);
export function acceptProductionBinding(snapshot,entry,decision,approval){
 if(approval?.id!==entry.id||approval.approved!==true||!approval.reason?.trim()||!Array.isArray(decision?.needs))throw Error('Agent 未确认已有关联可继续使用');
 const needs=decision.needs.map(need=>{
  if(!need.manualReference&&need.end>need.start&&entry.prompt.slice(need.start,need.end)!==need.text)throw Error('旧关联原文锚点已变化，不能直接恢复');
  if(need.visibility!=='visible')return {...need};
  const card=snapshot.cards.find(c=>c.uid===need.cardUid&&c.category===need.category&&c.detailStatus!=='nonvisual'&&cardInEntry(c,entry));
  if(!card)throw Error('旧关联引用已缺失，需由 Agent 重新分发');
  if(!need.manualReference&&(!(need.end>need.start)||entry.prompt.slice(need.start,need.end)!==need.text))throw Error('旧关联原文锚点已变化，不能直接恢复');
  const valid=card.images.some(i=>i.id===need.imageId);
  if(need.locked&&need.imageId&&!valid&&card.images.length)throw Error('人工锁定图片已变化，保留原选择并等待恢复');
  return {...need,imageId:valid?need.imageId:card.images.length===1?card.images[0].id:null};
 });
 const next={...decision,needs,signature:entryBindingSignature(snapshot,entry),issue:'',confirmed:true,recoveryEvidence:approval.reason};
 const problems=bindingProblems(snapshot,entry,next);if(problems.length)throw Error(problems.join('；'));return next;
}
export function productionRecoveryGoals(run){
 const goals=[];
 for(const ep of run.monitor?.art?.episodes||[])for(const scene of ep.scenes)if(!scene.complete)goals.push({kind:!scene.published?'publish':'binding',target:scene.id,goal:`补齐 ${scene.id} 并核实发布，让图片和视频可接续`,error:scene.reasons.join('；')});
 for(const item of run.imageErrors||[])goals.push({kind:'image',target:item.id||item.name,goal:`取回或生成 ${item.name} 的图片`,error:item.error,funding:isFundingError(item.error)});
 for(const item of run.items||[])if(item.status!=='downloaded')goals.push({kind:'video',target:item.id,goal:`完成 ${item.label} 的视频并归档`,error:item.error||item.status,funding:isFundingError(item.error)});
 for(const [stage,error]of Object.entries(run.stageErrors||{}))goals.push({kind:'stage',target:stage,goal:`修复 ${stage} 并接续下一步`,error,funding:isFundingError(error)});
 for(const ep of run.episodes||[])if(ep.stage==='attention')goals.push({kind:'post',target:String(ep.number),goal:`完成第 ${ep.number} 集后期验收`,error:ep.error});
 return goals.map(g=>({...g,id:bindingHash([g.kind,g.target])}));
}

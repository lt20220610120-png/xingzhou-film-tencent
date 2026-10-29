import {bindingHash,bindingProblems,entryBindingSignature} from './promptArtBinding.js';
import {saveBindingVersion} from './promptBindingVersions.js';
import {acceptProductionBinding} from './productionRecovery.js';
import {runBindingRepair} from './importedArtBinding.js';

/** The connected Agent validates old selections in compact batches. No stale
 * signature is trusted just because a previous workflow marked art complete. */
export async function repairProductionBindings({service,work,profile,guard=()=>{},log=async()=>{}}){
 const initial=await service.read(),pending=initial.snapshot.entries.filter(e=>{const d=initial.decisions[e.id];return !d||d.origin==='rules'||bindingProblems(initial.snapshot,e,d).length>0;});
 let restored=0,distributed=0,cursor=0;const failures=[];
 const worker=async()=>{while(cursor<pending.length){guard();const batch=pending.slice(cursor,cursor+=6),state=await service.read(),captured=new Map(batch.map(e=>[e.id,bindingHash(state.decisions[e.id]||null)]));
  const existing=batch.filter(e=>Array.isArray(state.decisions[e.id]?.needs)&&state.decisions[e.id].origin!=='rules'),redistribute=batch.filter(e=>!existing.some(v=>v.id===e.id));
  if(existing.length)try{
   await log(`Agent 目标：核实并恢复 ${existing.map(e=>e.label).join('、')} 的已有素材关联，保留人工选择。`);
   const approvals=await runBindingRepair({isStopped:()=>{try{guard();return false;}catch{return true;}},call:messages=>work('binding-review',messages),messages:[{role:'system',content:'逐条核对旧关联能否用于当前提示词和当前同场素材。保留所有人工locked选择。人物和所属道具不混绑，只有仍真实可用的对应才approved:true；明显不对应则false。仅返回JSON {"entries":[{"id":"原条目id","approved":true,"reason":"核实依据"}]}，每个请求id恰好一次。不要因为图片尚未生成或未发布而否定身份对应；程序会另行补图、发布并验收。'}, {role:'user',content:JSON.stringify({entries:existing.map(e=>({id:e.id,label:e.label,prompt:e.prompt,decision:state.decisions[e.id],cards:state.snapshot.cards.filter(c=>c.sceneIds.includes(e.sceneId)).map(({uid,category,name,description,detailStatus,images})=>({uid,category,name,description,detailStatus,images:images.map(i=>({id:i.id}))}))}))})}],validate:raw=>{const data=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));if(!Array.isArray(data.entries)||data.entries.length!==existing.length||new Set(data.entries.map(v=>v.id)).size!==existing.length||data.entries.some(a=>!existing.some(e=>e.id===a.id)||typeof a.approved!=='boolean'||!a.reason?.trim()))throw Error('Agent 没有逐条给出核实结论');return data.entries;}});
   guard();const next=new Map();for(const entry of existing){try{next.set(entry.id,acceptProductionBinding(state.snapshot,entry,state.decisions[entry.id],approvals.find(v=>v.id===entry.id)));}catch{redistribute.push(entry);}}
   if(next.size)await service.mutate(state.snapshot.versionId,current=>{guard();const decisions={...current.decisions};for(const [id,value]of next){const e=current.snapshot.entries.find(e=>e.id===id),old=state.snapshot.entries.find(e=>e.id===id);if(!e||entryBindingSignature(current.snapshot,e)!==entryBindingSignature(state.snapshot,old)||bindingHash(current.decisions[id]||null)!==captured.get(id))throw Error('Agent 核对期间来源或人工选择已变化，旧回包未应用');decisions[id]=value;}return saveBindingVersion(current.saved,current.snapshot,decisions);});restored+=next.size;
  }catch(error){guard();failures.push(error.message);}
  for(const entry of redistribute)try{guard();await log(`Agent 目标：修复 ${entry.label} 的缺失或不适用关联。`);await service.run(entry.id,{profile,manual:true});guard();const after=await service.read(),live=after.snapshot.entries.find(e=>e.id===entry.id);if(live&&bindingProblems(after.snapshot,live,after.decisions[entry.id]).length===0)distributed++;}catch(error){guard();failures.push(`${entry.label}：${error.message}`);}
 }};await Promise.all([worker(),worker()]);return {restored,distributed,failures};
}

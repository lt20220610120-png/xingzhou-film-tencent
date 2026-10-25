import React,{useEffect,useMemo,useRef,useState} from 'react';
import {bindingSnapshot,bindingImages,entryBindingSignature,proposeEntryBinding,bindingProblems,applyBindingAi,bindingAiMessages,bindingHash} from '../../core/promptArtBinding.js';
import {bindingVersionOptions,selectBindingVersion,saveBindingVersion} from '../../core/promptBindingVersions.js';
import {sceneReconciliationMessages,validateSceneReconciliation} from '../../core/promptSceneReconcile.js';
import {runBindingRepair} from '../../core/importedArtBinding.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import '../prompt-art-binding.css';

const labels={character:'人物',scene:'场景',prop:'道具'};
export default function PromptArtBindingPanel({project,ledger,assets,api,accountId,canEdit,sceneId,profile,refresh,onReconcile}){
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false),[saved,setSaved]=useState(null),[selected,setSelected]=useState(''),[version,setVersion]=useState(''),[busy,setBusy]=useState(false),[batchBusy,setBatchBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const mounted=useRef(false),saving=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{let alive=true;setLoaded(false);Promise.resolve(api.promptArtStatus?.()).then(async status=>{
  if(!alive)return;setAvailable(Boolean(status?.enabled));if(!status?.enabled)return;
  const data=await api.promptArtLoad({accountId,projectId:project.id});if(alive){setSaved(data);setLoaded(true);}
 }).catch(problem=>alive&&setError(problem.message));return()=>{alive=false;};},[api,accountId,project.id]);
 const currentSnapshot=useMemo(()=>bindingSnapshot(project,ledger,assets,saved?.snapshot),[project,ledger,assets,saved?.snapshot]);
 const versions=useMemo(()=>bindingVersionOptions(currentSnapshot,saved),[currentSnapshot,saved]);
 const selectedVersion=versions.some(row=>row.id===version)?version:versions[0].id;
 const {snapshot,decisions}=useMemo(()=>selectBindingVersion(currentSnapshot,saved,selectedVersion),[currentSnapshot,saved,selectedVersion]);
 const entries=snapshot.entries.filter(entry=>entry.sceneId===sceneId),entry=entries.find(row=>row.id===selected)||entries[0];
 const decision=entry&&(decisions[entry.id]||proposeEntryBinding(snapshot,entry));
 const stale=entry&&decision.signature!==entryBindingSignature(snapshot,entry);
 const latest=useRef();latest.current={snapshot,saved,entry,decision};
 const persist=async data=>{
  if(saving.current)throw Error('正在保存，请稍后再操作');
  saving.current=true;setBusy(true);setError('');setNotice('');
  try{const next=await api.promptArtSave({accountId,projectId:project.id,baseRevision:latest.current.saved?.revision||0,data});if(mounted.current){setSaved(next);setNotice('关联已保存到本机');}return next;}
  catch(problem){if(mounted.current)setError(problem.message);throw problem;}
  finally{saving.current=false;if(mounted.current)setBusy(false);}
 };
 const act=async task=>{try{await task();}catch(problem){if(mounted.current)setError(problem.message);}};
 const saveDecision=next=>persist(saveBindingVersion(saved,snapshot,{...decisions,[entry.id]:next}));
 const edit=(id,patch)=>saveDecision({...decision,confirmed:false,needs:decision.needs.map(need=>need.id===id?{...need,...patch,locked:true}:need)});
 const recheck=()=>{
  const proposed=proposeEntryBinding(snapshot,entry);
  proposed.needs=proposed.needs.map(need=>{
   const old=decision.needs.find(row=>row.start===need.start&&row.end===need.end&&row.category===need.category&&row.text===need.text);
   const card=snapshot.cards.find(card=>card.uid===old?.cardUid&&card.category===need.category&&card.sceneIds.includes(entry.sceneId));
   return old?.locked?{...old,cardUid:card?.uid||null,imageId:card?.images.some(image=>image.id===old.imageId)?old.imageId:card?.images.length===1?card.images[0].id:null}:need;
  });
  return saveDecision(proposed);
 };
 const aiCheck=async()=>{
  if(busy||!profile)return;
  setBusy(true);setError('');const captured=latest.current,stamp=bindingHash(captured.decision);
  let feedback='',result;
  try{
   for(let attempt=0;attempt<3;attempt++){
    if(!mounted.current)return;setNotice(`AI 正在核对本条（${attempt+1}/3）`);
    const messages=bindingAiMessages(captured.snapshot,captured.entry,captured.decision);
    if(feedback)messages.push({role:'user',content:JSON.stringify({validationError:feedback,request:'请针对错误修正完整 JSON'})});
    const output=await api.aiChat({...profile,profileId:profile.id,messages,taskId:crypto.randomUUID(),maxOutputTokens:8192});
    if(!mounted.current)return;
    if(latest.current.snapshot.signature!==captured.snapshot.signature||latest.current.entry?.id!==captured.entry.id||bindingHash(latest.current.decision)!==stamp)throw Error('核对期间来源或人工选择已更新，AI 旧结果未应用');
    try{result=applyBindingAi(captured.snapshot,captured.entry,captured.decision,typeof output==='string'?output:output.output);break;}catch(problem){feedback=problem.message;}
   }
   if(!result)throw Error(`AI 仍有疑问：${feedback}。请手动核对本条`);
   await saveDecision(result);
  }catch(problem){if(mounted.current)setError(problem.message);}finally{if(mounted.current)setBusy(false);}
 };
 const distributeScene=async()=>{
  if(busy||batchBusy||!profile)return;
  setBatchBusy(true);setError('');
  const captured=snapshot,failures=[];let accumulated={...decisions},checkpoint=saved;
  try{
   for(let index=0;index<entries.length;index++){
    const target=entries[index];if(!mounted.current)return;
    if(latest.current.snapshot.signature!==captured.signature)throw Error('来源已变化，已保存的分发保留，请重新开始');
    const before=accumulated[target.id]?.signature===entryBindingSignature(captured,target)?accumulated[target.id]:proposeEntryBinding(captured,target);
    if(before.confirmed)continue;
    setNotice(`正在分发 ${target.label}（${index+1}/${entries.length}）`);
    try{
     accumulated[target.id]=await runBindingRepair({messages:bindingAiMessages(captured,target,before),call:messages=>api.aiChat({...profile,profileId:profile.id,messages,taskId:crypto.randomUUID(),maxOutputTokens:8192}),isStopped:()=>!mounted.current||latest.current.snapshot.signature!==captured.signature,validate:raw=>applyBindingAi(captured,target,before,raw)});
    }catch(problem){if(!mounted.current)return;failures.push(`${target.label}：${problem.message}`);}
    if(latest.current.snapshot.signature!==captured.signature)throw Error('来源已变化，未保存旧结果');
    checkpoint=await persist(saveBindingVersion(checkpoint,captured,accumulated));
   }
   setNotice('本场分发已保存，请逐条核实确认。');if(failures.length)setError(failures.join('；'));
  }catch(problem){if(mounted.current)setError(problem.message);}finally{if(mounted.current)setBatchBusy(false);}
 };
 const reconcile=async()=>{
  if(busy||!profile||!onReconcile)return;
  const captured=latest.current,scene=ledger.episodes?.[entry.episode]?.scenes.find(row=>row.id===sceneId);
  const missing=decision.needs.filter(need=>need.visibility==='visible'&&!need.cardUid);
  if(!scene||!missing.length)return;
  setBusy(true);setError('');setNotice('正在核查本场与全剧依据…');
  try{
   const items=await runBindingRepair({messages:sceneReconciliationMessages(project,scene,entry,missing),call:messages=>api.aiChat({...profile,profileId:profile.id,messages,taskId:crypto.randomUUID(),maxOutputTokens:8192}),isStopped:()=>!mounted.current,validate:raw=>validateSceneReconciliation(project,scene,missing,raw)});
   if(latest.current.snapshot.signature!==captured.snapshot.signature||latest.current.entry?.id!==captured.entry.id)throw Error('核查期间来源已变化，未应用旧结果');
   if(!items.length){setNotice('未找到足够的剧本依据，缺项保留待核实。');return;}
   await onReconcile(entry.episode,sceneId,items,scene);
   setNotice(`已补入 ${items.length} 项并保留原文依据，请重新核对本条分发及整场清单。`);
  }catch(problem){if(mounted.current)setError(problem.message);}finally{if(mounted.current)setBusy(false);}
 };
 if(!available)return null;
 const disabled=busy||batchBusy||!loaded||!canEdit;
 return <section className="prompt-art-panel" aria-label="提示词联动美术">
  <header><div><h2>场景 {sceneId} · 按提示词核实</h2></div><button disabled={disabled} onClick={()=>act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));await refresh({manual:true});setVersion('');setNotice('已检查提示词与美术更新');})}>检查更新</button></header>
  {error&&<p role="alert" className="collab-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {<>
   {!entry?<p>本场尚无已保存提示词，可先核实美术清单；提示词生成后再检查更新。</p>:<div className="prompt-art-workspace">
    <section className="prompt-art-prompt-column" aria-label="当前提示词">
     <div className="prompt-art-prompt-heading"><span>当前提示词</span><strong>{entry.label}</strong></div>
     <label>切换提示词<select aria-label="联动提示词" disabled={disabled} value={entry.id} onChange={event=>{setSelected(event.target.value);setError('');setNotice('');}}>{entries.map(row=><option key={row.id} value={row.id}>{row.label}{row.duplicateLabel?` · ${row.runId?.slice(-6)||row.id.slice(-6)}（编号重复）`:''}</option>)}</select></label>
     <details open><summary>查看 {entry.label} 原提示词</summary><pre>{entry.prompt}</pre></details>
     {stale&&<p className="collab-error">来源、卡片或图片已更新。原选择已保留，请先“重新核对本条”。</p>}
     {decision.issue&&<p className="collab-error">{decision.issue}</p>}
     <div className="prompt-art-actions"><button disabled={disabled} onClick={()=>act(recheck)}>重新核对本条</button><button disabled={disabled||stale||!profile} onClick={aiCheck}>AI 分发本条</button><button disabled={disabled||!profile} onClick={distributeScene}>AI 分发本场</button>{onReconcile&&decision.needs.some(need=>need.visibility==='visible'&&!need.cardUid)&&<button disabled={disabled||stale||!profile} onClick={reconcile}>核查清单缺项</button>}<button disabled={disabled||stale} onClick={()=>act(async()=>{
     const problems=bindingProblems(snapshot,entry,decision,{requireConfirmed:false});if(problems.length)throw Error(problems.join('；'));
     await saveDecision({...decision,confirmed:true});
    })}>{decision.confirmed&&!stale?'本条关联已确认':'确认本条关联'}</button></div>
    </section>
    <section className="prompt-art-cards-column" aria-label="本条人物场景道具卡片">
     <div className="prompt-art-scene-summary" aria-label="整场清单与提示词版本"><div><b>整场清单</b><span>人物 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='character').length}</span><span>场景 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='scene').length}</span><span>道具 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='prop').length}</span></div><label>提示词版本<select aria-label="提示词版本" disabled={disabled} value={selectedVersion} onChange={event=>{const id=event.target.value;act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));setVersion(id);setSelected('');});}}>{versions.map(row=><option key={row.id} value={row.id}>{row.label}{row.current?' · 最新':''}</option>)}</select></label></div>
     {!decision.needs.length&&!decision.issue&&<p>基础信息未列出可见素材；确认前请核对原文。</p>}
    <div className="prompt-art-needs" role="region" aria-label="本条素材关联列表" tabIndex={0}>{decision.needs.map(need=>{
     const cards=snapshot.cards.filter(card=>card.category===need.category&&card.sceneIds.includes(entry.sceneId)&&card.detailStatus!=='nonvisual'),card=cards.find(row=>row.uid===need.cardUid),images=bindingImages(card),image=images.find(row=>row.id===need.imageId);
     return <article key={need.id}><div><b>{labels[need.category]} · {need.text}</b>{need.locked&&<small>人工选择</small>}{need.formatNotice&&<small>{need.formatNotice}</small>}<label>用途<select aria-label={`${need.text}用途`} disabled={disabled||stale} value={need.visibility} onChange={event=>act(()=>edit(need.id,{visibility:event.target.value}))}><option value="visible">画面使用</option><option value="voice">仅声音</option><option value="mentioned">仅提及</option><option value="excluded">本条不用</option></select></label><label>关联卡片<select aria-label={`${need.text}关联卡片`} disabled={disabled||stale||need.visibility!=='visible'} value={card?.uid||''} onChange={event=>act(()=>{const chosen=cards.find(row=>row.uid===event.target.value);return edit(need.id,{cardUid:chosen?.uid||null,imageId:chosen?.images.length===1?chosen.images[0].id:null});})}><option value="">待选择明确卡片</option>{cards.map(row=><option key={row.uid} value={row.uid}>{row.name}</option>)}</select></label><label>关联依据<input aria-label={`${need.text}关联依据`} disabled={disabled||stale} defaultValue={need.reason} key={`${need.id}:${saved?.revision}`} onBlur={event=>{if(event.target.value!==need.reason)act(()=>edit(need.id,{reason:event.target.value}));}}/></label></div>
     {need.visibility==='visible'&&<div className="prompt-art-image"><label>使用图片<select aria-label={`${need.text}使用图片`} disabled={disabled||stale||!images.length} value={image?.id||''} onChange={event=>act(()=>edit(need.id,{imageId:event.target.value||null}))}><option value="">{images.length?'请选择图片':'卡片已关联，待出图'}</option>{images.map((row,index)=><option key={row.id} value={row.id}>图片 {index+1}</option>)}</select></label>{image&&<CloudAssetImage api={api} projectId={project.id} assetId={card.assetId} image={image} alt={card.name}/>}<small>{card?.publishedSceneIds.includes(entry.sceneId)?'本场卡片已核实发布':'请先核实发布本场卡片'}</small></div>}
     </article>;
    })}</div>
    {decision.confirmed&&!stale&&<span className="prompt-binding-state">{bindingProblems(snapshot,entry,decision,{requireImages:true}).length?'用途已确认 · 图片待完成':'本条已就绪'}</span>}
    </section>
   </div>}
  </>}
 </section>;
}

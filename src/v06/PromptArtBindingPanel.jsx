import React,{useEffect,useMemo,useRef,useState} from 'react';
import {bindingSnapshot,bindingImages,currentEntryBinding,saveDistribution,entryBindingSignature,bindingProblems} from '../../core/promptArtBinding.js';
import {bindingVersionOptions,selectBindingVersion,saveBindingVersion} from '../../core/promptBindingVersions.js';
import {assignSceneCard,resolveSceneMissing,sceneCards} from '../../core/scenePromptDistribution.js';
import useScenePromptDistribution from './useScenePromptDistribution.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import {ModelSelect} from './ModelSelect.jsx';
import '../prompt-art-binding.css';

const labels={character:'人物',scene:'场景',prop:'道具'};
function AssignmentDialog({children,onClose}){
 const ref=useRef(null);
 useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="scene-prompt-assignment" aria-label="关联提示词" onCancel={event=>{event.preventDefault();onClose();}}>{children}</dialog>;
}
export default function PromptArtBindingPanel({project,ledger,assets,api,accountId,canEdit,sceneId,profile,modelId,setModelId,modelProfiles,refresh,onBackScene,sceneActions}){
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false),[saved,setSaved]=useState(null),[selected,setSelected]=useState(''),[version,setVersion]=useState(''),[category,setCategory]=useState('all'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[assignment,setAssignment]=useState(null);
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
 const decision=entry&&currentEntryBinding(snapshot,entry,decisions[entry.id]);
 const inventory=entry?sceneCards(snapshot,entry):[];
 const visibleCards=inventory.filter(card=>category==='all'||card.category===category);
 const missing=decision?.needs.filter(need=>need.visibility==='visible'&&!need.cardUid)||[];
 const stale=entry&&decisions[entry.id]&&decisions[entry.id].signature!==entryBindingSignature(snapshot,entry);
 const attempt=entry&&saved?.sceneDistributionAttempts?.[snapshot.versionId+':'+entry.id];
 const latest=useRef();latest.current={snapshot,saved,entry,decision};
 const persist=async data=>{
  if(saving.current)throw Error('正在保存，请稍后再操作');
  saving.current=true;setBusy(true);setError('');setNotice('');
  try{const next=await api.promptArtSave({accountId,projectId:project.id,baseRevision:latest.current.saved?.revision||0,data});if(mounted.current){latest.current.saved=next;setSaved(next);setNotice('关联已保存到本机');}return next;}
  catch(problem){if(mounted.current)setError(problem.message);throw problem;}
  finally{saving.current=false;if(mounted.current)setBusy(false);}
 };
 const act=async task=>{try{await task();}catch(problem){if(mounted.current)setError(problem.message);}};
 const saveDecision=next=>persist(saveBindingVersion(saved,snapshot,{...decisions,[entry.id]:saveDistribution(snapshot,entry,next)}));
 const edit=(id,patch)=>saveDecision({...decision,confirmed:false,needs:decision.needs.map(need=>need.id===id?{...need,...patch,locked:true}:need)});
 const ready=Object.fromEntries(Object.values(ledger.episodes||{}).flatMap(record=>(record.scenes||[]).map(scene=>[scene.id,Boolean(scene.mappingReady&&scene.items.length)])));
 const distribution=useScenePromptDistribution({snapshot,decisions,saved,ready,loaded,canEdit,profile,api,persist,setError,setNotice,busy});
 const toggleCard=(card,checked)=>saveDecision(assignSceneCard(snapshot,entry,decision,card.uid,checked));
 const openAssignment=card=>setAssignment({card,ids:entries.filter(row=>currentEntryBinding(snapshot,row,decisions[row.id]).needs.some(n=>n.cardUid===card.uid&&n.visibility!=='excluded')).map(row=>row.id)});
 const saveAssignment=async()=>{
  const next={...decisions};
  for(const row of entries){const d=currentEntryBinding(snapshot,row,next[row.id]);next[row.id]=saveDistribution(snapshot,row,assignSceneCard(snapshot,row,d,assignment.card.uid,assignment.ids.includes(row.id)));}
  await persist(saveBindingVersion(saved,snapshot,next));setAssignment(null);
 };
 if(!available)return null;
 const disabled=busy||distribution.working||!loaded||!canEdit;
 return <section className="prompt-art-panel" aria-label="提示词联动美术">
  <header><div><h2>场景 {sceneId} · 按提示词分发</h2></div><div className="prompt-art-header-actions">{modelProfiles&&<ModelSelect label="分发模型" profiles={modelProfiles} value={modelId} onChange={setModelId} disabled={disabled}/>}<button className="prompt-art-redistribute" disabled={disabled||!profile||!entry} onClick={()=>act(()=>distribution.redistribute(entry))}>AI 重新分发本条</button>{distribution.working&&<button onClick={distribution.stop}>停止自动分发</button>}{distribution.paused&&<button disabled={busy||distribution.working} onClick={distribution.resume}>继续自动分发</button>}{onBackScene&&<button onClick={onBackScene}>返回场景清单</button>}{sceneActions}</div><button disabled={disabled} onClick={()=>act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));await refresh({manual:true});setVersion('');setNotice('已检查提示词与美术更新');})}>检查更新</button></header>
  {error&&<p role="alert" className="collab-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {<>
   {!entry?<p>本场尚无已保存提示词，可先核实美术清单；提示词生成后再检查更新。</p>:<div className="prompt-art-workspace">
    <section className="prompt-art-prompt-column" aria-label="当前提示词">
     <div className="prompt-art-prompt-heading"><span>当前提示词 <strong>{entry.label}</strong></span><div className="prompt-art-stepper" role="tablist" aria-label="提示词快速定位">{entries.map((row,index)=><button type="button" key={row.id} role="tab" aria-selected={row.id===entry.id} aria-label={'第 '+(index+1)+' 条提示词 '+row.label} className={row.id===entry.id?'active':''} disabled={busy} onClick={()=>{setSelected(row.id);setError('');setNotice('');}}>{index+1}</button>)}</div></div>
     <div className="prompt-art-source"><h3>提示词原文</h3><pre>{entry.prompt}</pre></div>
     {stale&&!distribution.working&&<p className="collab-error">本场清单已更新，可重新分发或手动关联。</p>}
     {!!missing.length&&<div className="scene-missing-assets"><b>本场清单待补：{missing.map(n=>n.text).join('、')}</b>{missing.map(need=><label key={need.id}>{need.text}<select aria-label={`${need.text}匹配已有资产`} disabled={disabled} value="" onChange={event=>act(()=>event.target.value==='exclude'?edit(need.id,{visibility:'excluded',reason:'人工确认本条不用'}):saveDecision(resolveSceneMissing(snapshot,entry,decision,need.id,event.target.value)))}><option value="">匹配本场已有资产…</option>{inventory.filter(c=>c.category===need.category).map(c=><option key={c.uid} value={c.uid}>{c.name}</option>)}<option value="exclude">本条不用</option></select></label>)}{onBackScene&&<button onClick={onBackScene}>返回场景补充</button>}</div>}
     {!distribution.working&&attempt&&attempt.status!=='done'&&<p className="collab-error">{attempt.status==='failed'?'自动分发待处理':'上次分发未完成'}，可重新分发本条或手动关联。</p>}
     {decision.issue&&<p className="collab-error">{decision.issue}</p>}
    </section>
    <section className="prompt-art-cards-column" aria-label="本条人物场景道具卡片">
     <div className="prompt-art-scene-summary" aria-label="整场清单与提示词版本"><div><b>本场景资产清单</b><button type="button" className={category==='all'?'selected':''} onClick={()=>setCategory('all')}>全部</button><button type="button" className={category==='character'?'selected':''} onClick={()=>setCategory('character')}>人物 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='character').length}</button><button type="button" className={category==='scene'?'selected':''} onClick={()=>setCategory('scene')}>场景 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='scene').length}</button><button type="button" className={category==='prop'?'selected':''} onClick={()=>setCategory('prop')}>道具 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='prop').length}</button></div><label>提示词版本<select aria-label="提示词版本" disabled={disabled} value={selectedVersion} onChange={event=>{const id=event.target.value;act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));setVersion(id);setSelected('');});}}>{versions.map(row=><option key={row.id} value={row.id}>{row.label}{row.current?' · 最新':''}</option>)}</select></label></div>
     {!visibleCards.length&&<p>本场景暂无该类资产。{onBackScene&&<button onClick={onBackScene}>返回场景补充</button>}</p>}
    <div className="prompt-art-needs scene-inventory-cards" role="region" aria-label="本场景资产分发列表" tabIndex={0}>{visibleCards.map(card=>{
     const need=decision.needs.find(row=>row.cardUid===card.uid),chosen=need&&need.visibility!=='excluded',images=bindingImages(card),image=images.find(row=>row.id===need?.imageId);
     return <article key={card.uid} className={chosen?'assigned':'unassigned'}>
      <div className="scene-card-title"><b>{labels[card.category]} · {card.name.replace(/[【】]/g,'')}</b><span>{need?.locked?'人工选择':chosen?'本条已关联':'本条未使用'}</span></div>
      <div className="scene-card-actions"><label><input type="checkbox" aria-label={`${card.name}本条使用`} disabled={disabled} checked={Boolean(chosen)} onChange={event=>act(()=>toggleCard(card,event.target.checked))}/>本条使用</label><button disabled={disabled} onClick={()=>openAssignment(card)}>关联提示词</button></div>
      {chosen&&<div className="scene-card-fields"><label>用途<select aria-label={`${card.name}用途`} disabled={disabled} value={need.visibility} onChange={event=>act(()=>edit(need.id,{visibility:event.target.value}))}><option value="visible" disabled={card.detailStatus==='nonvisual'}>画面使用</option><option value="voice">仅声音</option><option value="mentioned">仅提及</option><option value="excluded">本条不用</option></select></label>
      {need.visibility==='visible'&&<label>图片<select aria-label={`${card.name}使用图片`} disabled={disabled||!images.length} value={image?.id||''} onChange={event=>act(()=>edit(need.id,{imageId:event.target.value||null}))}><option value="">{images.length?'请选择图片':'待出图'}</option>{images.map((row,index)=><option key={row.id} value={row.id}>图片 {index+1}</option>)}</select></label>}
      <p className="scene-card-reason" title={need.reason}>{need.reason}</p>
      {image&&need.visibility==='visible'&&<CloudAssetImage api={api} projectId={project.id} assetId={card.assetId} image={image} alt={card.name}/>}</div>}
     </article>;
    })}</div>
    {decision.confirmed&&!stale&&<span className="prompt-binding-state">{bindingProblems(snapshot,entry,decision,{requireImages:true}).length?'本条已分发 · 图片待完成':'本条分发已就绪'}</span>}
    </section>
   </div>}
  </>}
  {assignment&&<AssignmentDialog onClose={()=>setAssignment(null)}><h3>{assignment.card.name} · 关联提示词</h3><div className="scene-prompt-assignment-options">{entries.map(row=><label key={row.id}><input type="checkbox" disabled={disabled} checked={assignment.ids.includes(row.id)} onChange={event=>setAssignment({...assignment,ids:event.target.checked?[...assignment.ids,row.id]:assignment.ids.filter(id=>id!==row.id)})}/>{row.label}</label>)}</div><footer><button disabled={busy} onClick={()=>setAssignment(null)}>取消</button><button disabled={disabled} onClick={()=>act(saveAssignment)}>保存关联</button></footer></AssignmentDialog>}
 </section>;
}

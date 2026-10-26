import React,{useEffect,useMemo,useRef,useState} from 'react';
import {bindingSnapshot,bindingImages,sceneInventoryCards,currentEntryBinding,saveDistribution,entryBindingSignature,bindingProblems} from '../../core/promptArtBinding.js';
import {bindingVersionOptions,selectBindingVersion,saveBindingVersion} from '../../core/promptBindingVersions.js';
import {assignSceneCard} from '../../core/scenePromptDistribution.js';
import {auditedBindingNeeds} from '../../core/scenePromptAssignments.js';
import {sceneReadyForPromptDistribution} from '../../core/promptDistributionService.js';
import useScenePromptDistribution from './useScenePromptDistribution.js';
import BindingAuditList from './BindingAuditList.jsx';
import SceneInventoryDisclosure from './SceneInventoryDisclosure.jsx';
import {BINDING_SAVED_EVENT,notifyBindingSaved} from './useScenePromptLinks.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import {ModelSelect} from './ModelSelect.jsx';
import '../prompt-art-binding.css';

export default function PromptArtBindingPanel({project,ledger,assets,api,accountId,canEdit,sceneId,profile,modelId,setModelId,modelProfiles,refresh,onBackScene,sceneActions,onBindingVersionChange}){
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false),[saved,setSaved]=useState(null),[selected,setSelected]=useState(''),[version,setVersion]=useState(''),[category,setCategory]=useState('all'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const mounted=useRef(false),saving=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const sync=event=>{const d=event.detail;if(d.projectId===project.id&&d.accountId===accountId){latest.current.saved=d.data;setSaved(d.data);}};window.addEventListener(BINDING_SAVED_EVENT,sync);return()=>window.removeEventListener(BINDING_SAVED_EVENT,sync);},[accountId,project.id]);
 useEffect(()=>{let alive=true;setLoaded(false);Promise.resolve(api.promptArtStatus?.()).then(async status=>{
  if(!alive)return;setAvailable(Boolean(status?.enabled));if(!status?.enabled)return;
  const data=await api.promptArtLoad({accountId,projectId:project.id});if(alive){setSaved(data);setLoaded(true);}
 }).catch(problem=>alive&&setError(problem.message));return()=>{alive=false;};},[api,accountId,project.id]);
 const currentSnapshot=useMemo(()=>bindingSnapshot(project,ledger,assets,saved?.snapshot),[project,ledger,assets,saved?.snapshot]);
 const versions=useMemo(()=>bindingVersionOptions(currentSnapshot,saved),[currentSnapshot,saved]);
 const selectedVersion=versions.some(row=>row.id===version)?version:versions[0].id;
 useEffect(()=>{onBindingVersionChange?.(selectedVersion);},[selectedVersion,onBindingVersionChange]);
 const {snapshot,decisions}=useMemo(()=>selectBindingVersion(currentSnapshot,saved,selectedVersion),[currentSnapshot,saved,selectedVersion]);
 const entries=snapshot.entries.filter(entry=>entry.sceneId===sceneId),entry=entries.find(row=>row.id===selected)||entries[0];
 const decision=entry&&currentEntryBinding(snapshot,entry,decisions[entry.id]);
 const inventory=entry?sceneInventoryCards(snapshot,entry):[];
 const auditNeeds=entry?auditedBindingNeeds(snapshot,entry,decisions[entry.id]):[];

 const sceneReady=sceneReadyForPromptDistribution(project,ledger,sceneId);
 const missing=sceneReady?(auditNeeds.filter(need=>need.visibility==='visible'&&!need.cardUid)):[];
 const stale=entry&&decisions[entry.id]&&decisions[entry.id].signature!==entryBindingSignature(snapshot,entry);
 const attempt=entry&&saved?.sceneDistributionAttempts?.[snapshot.versionId+':'+entry.id];
 const latest=useRef();latest.current={snapshot,saved,entry,decision};
 const persist=async data=>{
  if(saving.current)throw Error('正在保存，请稍后再操作');
  saving.current=true;setBusy(true);setError('');setNotice('');
  try{const next=await api.promptArtSave({accountId,projectId:project.id,baseRevision:latest.current.saved?.revision||0,data});if(mounted.current){latest.current.saved=next;setSaved(next);notifyBindingSaved(project.id,accountId,next);setNotice('关联已保存到本机');}return next;}
  catch(problem){if(mounted.current)setError(problem.message);throw problem;}
  finally{saving.current=false;if(mounted.current)setBusy(false);}
 };
 const act=async task=>{try{await task();}catch(problem){if(mounted.current)setError(problem.message);}};
 const saveDecision=next=>persist(saveBindingVersion(saved,snapshot,{...decisions,[entry.id]:saveDistribution(snapshot,entry,next)}));
 const edit=(id,patch)=>saveDecision({...decision,confirmed:false,needs:decision.needs.map(need=>need.id===id?{...need,...patch,locked:true}:need)});
 const ready=Object.fromEntries(Object.values(ledger.episodes||{}).flatMap(record=>(record.scenes||[]).map(scene=>[scene.id,Boolean(scene.mappingReady&&scene.items.length)])));
 const distribution=useScenePromptDistribution({project,ledger,assets,accountId,snapshot,loaded,canEdit,profile,api,setError,setNotice});
 const toggleCard=(card,checked)=>saveDecision(assignSceneCard(snapshot,entry,{...decision,needs:[...auditNeeds,...decision.needs.filter(n=>!n.cardUid)]},card.uid,checked));
 if(!available)return null;
 const disabled=busy||distribution.isBusy(entry?.id)||!loaded||!canEdit;
 return <section className="prompt-art-panel" aria-label="提示词联动美术">
  {entry&&<SceneInventoryDisclosure cards={inventory} needs={auditNeeds} entryLabel={entry.label} disabled={disabled} onToggle={(card,checked)=>act(()=>toggleCard(card,checked))}/>}
  <header className="prompt-art-toolbar"><div><h2>场景 {sceneId} · 按提示词分发</h2></div><div className="prompt-art-header-actions">{modelProfiles&&<ModelSelect label="分发模型" profiles={modelProfiles} value={modelId} onChange={setModelId} disabled={disabled}/>}<button className="prompt-art-redistribute" disabled={disabled||!profile||!entry||!sceneReady} onClick={()=>act(()=>distribution.redistribute(entry))}>AI 重新分发本条</button>{!distribution.paused&&distribution.working?<button onClick={distribution.stop}>停止清单分发</button>:<button disabled={!canEdit||busy||!profile||distribution.working} onClick={distribution.resume}>开始清单分发</button>}{onBackScene&&<button onClick={onBackScene}>返回场景清单</button>}{sceneActions}<button disabled={disabled} onClick={()=>act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));await refresh({manual:true});setVersion('');setNotice('已检查提示词与美术更新');})}>检查更新</button></div></header>
  {(distribution.working||distribution.active>0||distribution.queued>0)&&<p className="prompt-art-queue-status" role="status">模型请求 {distribution.active}/6 · 排队 {distribution.queued} 条</p>}
  {error&&<p role="alert" className="collab-error">{error}</p>}{(notice||distribution.notice)&&<p role="status">{notice||distribution.notice}</p>}
  {<>
   {!entry?<p>本场尚无已保存提示词，可先核实美术清单；提示词生成后再检查更新。</p>:<div className="prompt-art-workspace">
    <section className="prompt-art-prompt-column" aria-label="当前提示词">
     <div className="prompt-art-prompt-heading"><span>当前提示词 <strong>{entry.label}</strong></span><div className="prompt-art-stepper" role="tablist" aria-label="提示词快速定位">{entries.map((row,index)=><button type="button" key={row.id} role="tab" aria-selected={row.id===entry.id} aria-label={'第 '+(index+1)+' 条提示词 '+row.label} className={row.id===entry.id?'active':''} disabled={busy} onClick={()=>{setSelected(row.id);setError('');setNotice('');}}>{index+1}</button>)}</div></div>
     <div className="prompt-art-source"><h3>提示词原文</h3><pre>{entry.prompt}</pre></div>
     {!sceneReady&&<p role="status">等待本场清单分析完成，再由模型读取提示词并分发。</p>}
     {stale&&sceneReady&&!distribution.isBusy(entry.id)&&<p className="collab-error">本场清单已更新，请重新分发核对。</p>}
     {!!missing.length&&<div className="scene-missing-assets"><b>本场清单待补：{missing.map(n=>n.text).join('、')}</b>{onBackScene&&<button onClick={onBackScene}>返回场景补充</button>}</div>}
     {!distribution.working&&attempt&&attempt.status!=='done'&&<p className="collab-error">{attempt.status==='failed'?'自动分发待处理':'上次分发未完成'}，可重新分发本条或返回场景检查。</p>}
     {decision.issue&&<p className="collab-error">{decision.issue}</p>}
    </section>
    <section className="prompt-art-cards-column" aria-label="本条人物场景道具卡片">
     <div className="prompt-art-scene-summary" aria-label="整场清单与提示词版本"><div><b>本条已关联</b><button type="button" className={category==='all'?'selected':''} onClick={()=>setCategory('all')}>全部</button><button type="button" className={category==='character'?'selected':''} onClick={()=>setCategory('character')}>人物 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='character'&&auditNeeds.some(n=>n.cardUid===card.uid&&n.visibility!=='excluded')).length}</button><button type="button" className={category==='scene'?'selected':''} onClick={()=>setCategory('scene')}>场景 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='scene'&&auditNeeds.some(n=>n.cardUid===card.uid&&n.visibility!=='excluded')).length}</button><button type="button" className={category==='prop'?'selected':''} onClick={()=>setCategory('prop')}>道具 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='prop'&&auditNeeds.some(n=>n.cardUid===card.uid&&n.visibility!=='excluded')).length}</button></div><label>提示词版本<select aria-label="提示词版本" disabled={disabled} value={selectedVersion} onChange={event=>{const id=event.target.value;act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));setVersion(id);setSelected('');});}}>{versions.map(row=><option key={row.id} value={row.id}>{row.label}{row.current?' · 最新':''}</option>)}</select></label></div>
     <BindingAuditList cards={inventory} needs={auditNeeds} category={category} renderImage={(card,need,image)=>image&&need.visibility==='visible'?<CloudAssetImage api={api} projectId={project.id} assetId={card.assetId} image={image} alt={card.name}/>:null} renderControls={(card,need)=>need.visibility==='visible'&&bindingImages(card).length>1?<label>使用图片<select aria-label={`${card.name}使用图片`} disabled={disabled} value={need.imageId||''} onChange={event=>act(()=>edit(need.id,{imageId:event.target.value||null}))}><option value="">请选择图片</option>{bindingImages(card).map((row,index)=><option key={row.id} value={row.id}>图片 {index+1}</option>)}</select></label>:null}/>
    {decision.confirmed&&!stale&&<span className="prompt-binding-state">{bindingProblems(snapshot,entry,decision,{requireImages:true}).length?'本条已分发 · 图片待完成':'本条分发已就绪'}</span>}
    </section>
   </div>}
  </>}

 </section>;
}

import React,{useEffect,useMemo,useRef,useState} from 'react';
import {bindingSnapshot,bindingImages,currentEntryBinding,saveDistribution,entryBindingSignature,proposeEntryBinding,bindingProblems,applyBindingAi,bindingAiMessages,bindingHash} from '../../core/promptArtBinding.js';
import {bindingVersionOptions,selectBindingVersion,saveBindingVersion} from '../../core/promptBindingVersions.js';
import {sceneReconciliationMessages,validateSceneReconciliation} from '../../core/promptSceneReconcile.js';
import {runBindingRepair} from '../../core/importedArtBinding.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import {ModelSelect} from './ModelSelect.jsx';
import '../prompt-art-binding.css';

const labels={character:'人物',scene:'场景',prop:'道具'};
export default function PromptArtBindingPanel({project,ledger,assets,api,accountId,canEdit,sceneId,profile,modelId,setModelId,modelProfiles,refresh,onReconcile,sceneActions}){
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false),[saved,setSaved]=useState(null),[selected,setSelected]=useState(''),[version,setVersion]=useState(''),[category,setCategory]=useState('all'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
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
 const visibleNeeds=decision?.needs.filter(need=>category==='all'||need.category===category)||[];
 const stale=entry&&decisions[entry.id]&&decisions[entry.id].signature!==entryBindingSignature(snapshot,entry);
 const latest=useRef();latest.current={snapshot,saved,entry,decision};
 const persist=async data=>{
  if(saving.current)throw Error('正在保存，请稍后再操作');
  saving.current=true;setBusy(true);setError('');setNotice('');
  try{const next=await api.promptArtSave({accountId,projectId:project.id,baseRevision:latest.current.saved?.revision||0,data});if(mounted.current){setSaved(next);setNotice('关联已保存到本机');}return next;}
  catch(problem){if(mounted.current)setError(problem.message);throw problem;}
  finally{saving.current=false;if(mounted.current)setBusy(false);}
 };
 const act=async task=>{try{await task();}catch(problem){if(mounted.current)setError(problem.message);}};
 const saveDecision=next=>persist(saveBindingVersion(saved,snapshot,{...decisions,[entry.id]:saveDistribution(snapshot,entry,next)}));
 const edit=(id,patch)=>saveDecision({...decision,confirmed:false,needs:decision.needs.map(need=>need.id===id?{...need,...patch,locked:true}:need)});
 const redistributeCurrent=async()=>{
  if(busy||!profile)return;
  setBusy(true);setError('');const captured=latest.current,stamp=bindingHash(captured.decision);
  const proposed=proposeEntryBinding(captured.snapshot,captured.entry);
  const seed={...proposed,needs:proposed.needs.map(need=>{const old=captured.decision?.needs.find(row=>row.start===need.start&&row.end===need.end&&row.category===need.category);return old?.locked?{...need,...old}:need;})};
  let feedback='',result;
  try{
   for(let attempt=0;attempt<3;attempt++){
    if(!mounted.current)return;setNotice('AI 正在重新读取并分发本条（'+(attempt+1)+'/3）');
    const messages=bindingAiMessages(captured.snapshot,captured.entry,seed);
    if(feedback)messages.push({role:'user',content:JSON.stringify({validationError:feedback,request:'请针对错误修正完整 JSON；不要把人物外貌、服装或道具属性拆成新对象'})});
    const output=await api.aiChat({...profile,profileId:profile.id,messages,taskId:crypto.randomUUID(),maxOutputTokens:8192});
    if(!mounted.current)return;
    if(latest.current.snapshot.signature!==captured.snapshot.signature||latest.current.entry?.id!==captured.entry.id||bindingHash(latest.current.decision)!==stamp)throw Error('核对期间来源或人工选择已更新，AI 旧结果未应用');
    try{result=applyBindingAi(captured.snapshot,captured.entry,seed,typeof output==='string'?output:output.output);break;}catch(problem){feedback=problem.message;}
   }
   if(!result)throw Error('AI 仍有疑问：'+feedback+'。请检查当前提示词与本场清单');
   await saveDecision({...result,origin:'ai-redistributed'});
   const missing=result.needs.filter(need=>need.visibility==='visible'&&!need.cardUid);
   if(missing.length&&onReconcile){
    const scene=ledger.episodes?.[captured.entry.episode]?.scenes.find(row=>row.id===sceneId);
    setBusy(true);setNotice('正在核查缺项与全剧原文依据…');
    const items=await runBindingRepair({messages:sceneReconciliationMessages(project,scene,captured.entry,missing),call:messages=>api.aiChat({...profile,profileId:profile.id,messages,taskId:crypto.randomUUID(),maxOutputTokens:8192}),isStopped:()=>!mounted.current,validate:raw=>validateSceneReconciliation(project,scene,missing,raw)});
    if(latest.current.snapshot.signature!==captured.snapshot.signature||latest.current.entry?.id!==captured.entry.id)throw Error('核查期间来源已变化，未应用旧结果');
    if(items.length){
     const record=await onReconcile(captured.entry.episode,sceneId,items,scene);
     if(!mounted.current)return;
     const base=bindingSnapshot(project,{...ledger,episodes:{...ledger.episodes,[captured.entry.episode]:record}},assets,captured.snapshot);
     const next=selectBindingVersion(base,latest.current.saved,selectedVersion),target=next.snapshot.entries.find(row=>row.id===captured.entry.id);
     const repaired={...result,signature:entryBindingSignature(next.snapshot,target),needs:result.needs.map(need=>{
      const added=items.find(item=>item.needId===need.id),card=added&&next.snapshot.cards.find(row=>row.name===added.name&&row.category===added.category&&row.sceneIds.includes(sceneId));
      return card?{...need,cardUid:card.uid,imageId:card.images.length===1?card.images[0].id:null,reason:added.note}:need;
     })};
     await persist(saveBindingVersion(latest.current.saved,next.snapshot,{...next.decisions,[target.id]:saveDistribution(next.snapshot,target,repaired)}));
     const unresolved=repaired.needs.filter(need=>need.visibility==='visible'&&!need.cardUid);
     setNotice('已依据剧本补入整场清单并更新分发，请核实整场后发布。');
     if(unresolved.length)setError('仍缺少依据：'+unresolved.map(need=>need.text).join('、'));
    }
    else setError('缺少可核对的剧本依据：'+missing.map(need=>need.text).join('、')+'。已保留待处理，不会自动发布。');
   }

  }catch(problem){if(mounted.current)setError(problem.message);}finally{if(mounted.current)setBusy(false);}
 };
 if(!available)return null;
 const disabled=busy||!loaded||!canEdit;
 return <section className="prompt-art-panel" aria-label="提示词联动美术">
  <header><div><h2>场景 {sceneId} · 按提示词分发</h2></div><div className="prompt-art-header-actions">{modelProfiles&&<ModelSelect label="分发模型" profiles={modelProfiles} value={modelId} onChange={setModelId} disabled={disabled}/>}<button className="prompt-art-redistribute" disabled={disabled||!profile||!entry} onClick={()=>act(redistributeCurrent)}>AI 重新分发本条</button>{sceneActions}</div><button disabled={disabled} onClick={()=>act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));await refresh({manual:true});setVersion('');setNotice('已检查提示词与美术更新');})}>检查更新</button></header>
  {error&&<p role="alert" className="collab-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {<>
   {!entry?<p>本场尚无已保存提示词，可先核实美术清单；提示词生成后再检查更新。</p>:<div className="prompt-art-workspace">
    <section className="prompt-art-prompt-column" aria-label="当前提示词">
     <div className="prompt-art-prompt-heading"><span>当前提示词 <strong>{entry.label}</strong></span><div className="prompt-art-stepper" role="tablist" aria-label="提示词快速定位">{entries.map((row,index)=><button type="button" key={row.id} role="tab" aria-selected={row.id===entry.id} aria-label={'第 '+(index+1)+' 条提示词 '+row.label} className={row.id===entry.id?'active':''} disabled={disabled} onClick={()=>{setSelected(row.id);setError('');setNotice('');}}>{index+1}</button>)}</div></div>
     <div className="prompt-art-source"><h3>提示词原文</h3><pre>{entry.prompt}</pre></div>
     {stale&&<p className="collab-error">来源、卡片或图片已更新。原选择已保留，请重新读取并按本场清单分发。</p>}
     {decision.issue&&<p className="collab-error">{decision.issue}</p>}
    </section>
    <section className="prompt-art-cards-column" aria-label="本条人物场景道具卡片">
     <div className="prompt-art-scene-summary" aria-label="整场清单与提示词版本"><div><b>整场清单</b><button type="button" className={category==='all'?'selected':''} onClick={()=>setCategory('all')}>全部</button><button type="button" className={category==='character'?'selected':''} onClick={()=>setCategory('character')}>人物 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='character').length}</button><button type="button" className={category==='scene'?'selected':''} onClick={()=>setCategory('scene')}>场景 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='scene').length}</button><button type="button" className={category==='prop'?'selected':''} onClick={()=>setCategory('prop')}>道具 {snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&card.category==='prop').length}</button></div><label>提示词版本<select aria-label="提示词版本" disabled={disabled} value={selectedVersion} onChange={event=>{const id=event.target.value;act(async()=>{await persist(saveBindingVersion(saved,snapshot,decisions));setVersion(id);setSelected('');});}}>{versions.map(row=><option key={row.id} value={row.id}>{row.label}{row.current?' · 最新':''}</option>)}</select></label></div>
     {!visibleNeeds.length&&!decision.issue&&<p>当前分类没有需要分发的对象。</p>}
    <div className="prompt-art-needs" role="region" aria-label="本条素材关联列表" tabIndex={0}>{visibleNeeds.map(need=>{
     const cards=snapshot.cards.filter(card=>card.category===need.category&&card.sceneIds.includes(entry.sceneId)&&card.detailStatus!=='nonvisual'),card=cards.find(row=>row.uid===need.cardUid),images=bindingImages(card),image=images.find(row=>row.id===need.imageId);
     return <article key={need.id}><div><b>{labels[need.category]} · {need.text}</b>{need.locked&&<small>人工选择</small>}{need.formatNotice&&<small>{need.formatNotice}</small>}<label>用途<select aria-label={`${need.text}用途`} disabled={disabled||stale} value={need.visibility} onChange={event=>act(()=>edit(need.id,{visibility:event.target.value}))}><option value="visible">画面使用</option><option value="voice">仅声音</option><option value="mentioned">仅提及</option><option value="excluded">本条不用</option></select></label><label>关联卡片<select aria-label={`${need.text}关联卡片`} disabled={disabled||stale||need.visibility!=='visible'} value={card?.uid||''} onChange={event=>act(()=>{const chosen=cards.find(row=>row.uid===event.target.value);return edit(need.id,{cardUid:chosen?.uid||null,imageId:chosen?.images.length===1?chosen.images[0].id:null});})}><option value="">待选择明确卡片</option>{cards.map(row=><option key={row.uid} value={row.uid}>{row.name}</option>)}</select></label><label>关联依据<input aria-label={`${need.text}关联依据`} disabled={disabled||stale} defaultValue={need.reason} key={`${need.id}:${saved?.revision}`} onBlur={event=>{if(event.target.value!==need.reason)act(()=>edit(need.id,{reason:event.target.value}));}}/></label></div>
     {need.visibility==='visible'&&<div className="prompt-art-image"><label>使用图片<select aria-label={`${need.text}使用图片`} disabled={disabled||stale||!images.length} value={image?.id||''} onChange={event=>act(()=>edit(need.id,{imageId:event.target.value||null}))}><option value="">{images.length?'请选择图片':'卡片已关联，待出图'}</option>{images.map((row,index)=><option key={row.id} value={row.id}>图片 {index+1}</option>)}</select></label>{image&&<CloudAssetImage api={api} projectId={project.id} assetId={card.assetId} image={image} alt={card.name}/>}<small>{card?.publishedSceneIds.includes(entry.sceneId)?'本场卡片已核实发布':'请先核实发布本场卡片'}</small></div>}
     </article>;
    })}</div>
    {decision.confirmed&&!stale&&<span className="prompt-binding-state">{bindingProblems(snapshot,entry,decision,{requireImages:true}).length?'本条已分发 · 图片待完成':'本条分发已就绪'}</span>}
    </section>
   </div>}
  </>}
 </section>;
}

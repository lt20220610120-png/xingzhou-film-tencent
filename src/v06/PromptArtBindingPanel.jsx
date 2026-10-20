import React,{useEffect,useMemo,useRef,useState} from 'react';
import {bindingSnapshot,bindingImages,entryBindingSignature,proposeEntryBinding,bindingProblems,applyBindingAi,bindingAiMessages,bindingHash} from '../../core/promptArtBinding.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import '../prompt-art-binding.css';

const labels={character:'人物',scene:'场景',prop:'道具'};
export default function PromptArtBindingPanel({project,ledger,assets,api,accountId,canEdit,sceneId,profile,refresh}){
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false),[saved,setSaved]=useState(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const mounted=useRef(false),saving=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{let alive=true;setLoaded(false);Promise.resolve(api.promptArtStatus?.()).then(async status=>{
  if(!alive)return;setAvailable(Boolean(status?.enabled));if(!status?.enabled)return;
  const data=await api.promptArtLoad({accountId,projectId:project.id});if(alive){setSaved(data);setLoaded(true);}
 }).catch(problem=>alive&&setError(problem.message));return()=>{alive=false;};},[api,accountId,project.id]);
 const snapshot=useMemo(()=>bindingSnapshot(project,ledger,assets,saved?.snapshot),[project,ledger,assets,saved?.snapshot]);
 const entries=snapshot.entries.filter(entry=>entry.sceneId===sceneId),entry=entries.find(row=>row.id===selected)||entries[0];
 const decision=entry&&(saved?.decisions?.[entry.id]||proposeEntryBinding(snapshot,entry));
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
 const saveDecision=next=>persist({enabled:true,snapshot,decisions:{...saved?.decisions,[entry.id]:next}});
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
    if(latest.current.snapshot.signature!==captured.snapshot.signature||bindingHash(latest.current.decision)!==stamp)throw Error('核对期间来源或人工选择已更新，AI 旧结果未应用');
    try{result=applyBindingAi(captured.snapshot,captured.entry,captured.decision,typeof output==='string'?output:output.output);break;}catch(problem){feedback=problem.message;}
   }
   if(!result)throw Error(`AI 仍有疑问：${feedback}。请手动核对本条`);
   await saveDecision(result);
  }catch(problem){if(mounted.current)setError(problem.message);}finally{if(mounted.current)setBusy(false);}
 };
 if(!available)return null;
 const disabled=busy||!loaded||!canEdit;
 return <section className="prompt-art-panel" aria-label="提示词联动美术">
  <header><div><h2>提示词联动美术 <small>本机试用</small></h2><p>生图前确认每条使用的卡片，生图后选择图片，再到图视生成载入。</p></div><label>素材整理模式<select aria-label="素材整理模式" disabled={disabled} value={saved?.enabled?'linked':'scene'} onChange={event=>act(()=>persist({enabled:event.target.value==='linked',snapshot,decisions:saved?.decisions||{}}))}><option value="scene">原模式：按场景整理</option><option value="linked">新模式：提示词联动美术</option></select></label></header>
  {error&&<p role="alert" className="collab-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {saved?.enabled&&<>
   <div className="prompt-art-actions"><button disabled={disabled} onClick={()=>act(async()=>{await refresh({manual:true});setNotice('已检查导演提示词与美术资产更新');})}>检查提示词与图片更新</button><span>当前场景 {sceneId||'未选择'} · {entries.length} 条提示词</span></div>
   {!!snapshot.issues.length&&<p className="collab-error">{snapshot.issues.join('；')}</p>}
   {!entry?<p>本场尚无已保存提示词，可先核实美术清单；提示词生成后再检查更新。</p>:<>
    <label>本场提示词<select aria-label="联动提示词" value={entry.id} onChange={event=>{setSelected(event.target.value);setError('');setNotice('');}}>{entries.map(row=><option key={row.id} value={row.id}>{row.label}{row.duplicateLabel?` · ${row.runId?.slice(-6)||row.id.slice(-6)}（编号重复）`:''}</option>)}</select></label>
    <details><summary>查看 {entry.label} 原提示词</summary><pre>{entry.prompt}</pre></details>
    {stale&&<p className="collab-error">来源、卡片或图片已更新。原选择已保留，请先“重新核对本条”。</p>}
    {decision.issue&&<p className="collab-error">{decision.issue}</p>}
    <div className="prompt-art-actions"><button disabled={disabled} onClick={()=>act(recheck)}>重新核对本条</button><button disabled={disabled||stale||!profile} onClick={aiCheck}>AI 核对本条</button><button disabled={disabled||stale} onClick={()=>act(async()=>{
     const problems=bindingProblems(snapshot,entry,decision,{requireConfirmed:false});if(problems.length)throw Error(problems.join('；'));
     await saveDecision({...decision,confirmed:true});
    })}>{decision.confirmed&&!stale?'本条关联已确认':'确认本条关联'}</button></div>
    {!decision.needs.length&&!decision.issue&&<p>基础信息未列出可见素材；确认前请核对原文。</p>}
    <div className="prompt-art-needs">{decision.needs.map(need=>{
     const cards=snapshot.cards.filter(card=>card.category===need.category&&card.sceneIds.includes(entry.sceneId)&&card.detailStatus!=='nonvisual'),card=cards.find(row=>row.uid===need.cardUid),images=bindingImages(card),image=images.find(row=>row.id===need.imageId);
     return <article key={need.id}><div><b>{labels[need.category]} · {need.text}</b>{need.locked&&<small>人工选择</small>}{need.formatNotice&&<small>{need.formatNotice}</small>}<label>用途<select aria-label={`${need.text}用途`} disabled={disabled||stale} value={need.visibility} onChange={event=>act(()=>edit(need.id,{visibility:event.target.value}))}><option value="visible">画面使用</option><option value="voice">仅声音</option><option value="mentioned">仅提及</option><option value="excluded">本条不用</option></select></label><label>关联卡片<select aria-label={`${need.text}关联卡片`} disabled={disabled||stale||need.visibility!=='visible'} value={card?.uid||''} onChange={event=>act(()=>{const chosen=cards.find(row=>row.uid===event.target.value);return edit(need.id,{cardUid:chosen?.uid||null,imageId:chosen?.images.length===1?chosen.images[0].id:null});})}><option value="">待选择明确卡片</option>{cards.map(row=><option key={row.uid} value={row.uid}>{row.name}</option>)}</select></label><label>关联依据<input aria-label={`${need.text}关联依据`} disabled={disabled||stale} defaultValue={need.reason} key={`${need.id}:${saved?.revision}`} onBlur={event=>{if(event.target.value!==need.reason)act(()=>edit(need.id,{reason:event.target.value}));}}/></label></div>
     {need.visibility==='visible'&&<div className="prompt-art-image"><label>使用图片<select aria-label={`${need.text}使用图片`} disabled={disabled||stale||!images.length} value={image?.id||''} onChange={event=>act(()=>edit(need.id,{imageId:event.target.value||null}))}><option value="">{images.length?'请选择图片':'卡片已关联，待出图'}</option>{images.map((row,index)=><option key={row.id} value={row.id}>图片 {index+1}</option>)}</select></label>{image&&<CloudAssetImage api={api} projectId={project.id} assetId={card.assetId} image={image} alt={card.name}/>}<small>{card?.publishedSceneIds.includes(entry.sceneId)?'本场卡片已核实发布':'请先核实发布本场卡片'}</small></div>}
     </article>;
    })}</div>
    <p>{decision.confirmed&&!stale?(bindingProblems(snapshot,entry,decision,{requireImages:true}).length?'用途已确认，图片或发布仍待完成':'本条已就绪，可在图视生成的整本模式载入联动项目'):'核对并确认本条后保存用途，图片可稍后补齐。'}</p>
   </>}
  </>}
 </section>;
}

import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ModelSelect,useWindowModel} from './ModelSelect.jsx';
import {mediaSource} from '../../core/generationReferences.js';
import {bindingProblems,compileEntryBinding,entryBindingSignature,bindingHash} from '../../core/promptArtBinding.js';
import {importedSnapshot,importedDecision,importedCategories,inventoryMessages,applyInventoryAi,runBindingRepair,runImportedEntry,withBindingImages} from '../../core/importedArtBinding.js';
import '../prompt-art-binding.css';
import {runImportedAuto,importedAutoSummary} from '../../core/importedArtAuto.js';

export default function ImportedArtBindingPanel({book,entry:original,state,api,accountId,onUpdate,onBusy,onExit,onSelect}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[vision,setVision]=useState(false);
 const [details,setDetails]=useState(false),[showIssues,setShowIssues]=useState(false);
 const summary=useMemo(()=>importedAutoSummary(book),[book]);
 const [modelId,setModelId,profile]=useWindowModel('imported-art-binding',state.apiProfiles||[],state.activeApiId);
 const snapshot=useMemo(()=>importedSnapshot(book),[book]),entry=snapshot.entries.find(row=>row.id===original.id);
 const work=book.importedBinding,decision=importedDecision(snapshot,entry,work.decisions);
 const cards=snapshot.cards.filter(card=>card.sceneIds.includes(entry.sceneId));
 const live=useRef(),stopped=useRef(false),mounted=useRef(true),running=useRef(false),task=useRef('');
 const sourceSignature=bindingHash([book.entries,book.episodeMedia,book.sceneMedia,work.prompts]);
 live.current={snapshot,work,accountId,sourceSignature};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopped.current=true;if(task.current)api.cancelAiTask?.({taskId:task.current});};},[api]);
 const mutate=transform=>onUpdate(current=>({...current,importedBinding:transform(current.importedBinding)}));
 const saveDecision=next=>mutate(current=>({...current,decisions:{...current.decisions,[entry.id]:next}}));
 const changeNeed=(id,patch)=>saveDecision({...decision,confirmed:false,needs:decision.needs.map(need=>need.id===id?{...need,...patch,locked:true}:need)});
 const changeMeta=(id,patch)=>mutate(current=>({...current,metadata:{...current.metadata,[id]:{...current.metadata[id],...patch,confirmed:false}}}));
 const execute=async action=>{
  if(running.current)return;running.current=true;stopped.current=false;setBusy(true);onBusy(true);setError('');setNotice('');
  try{await action();}catch(problem){if(mounted.current)setError(problem.message);}
  finally{running.current=false;onBusy(false);if(mounted.current)setBusy(false);}
 };
 const checkCurrent=captured=>{
  if(stopped.current||!mounted.current)throw Error('任务已停止');
  if(live.current.accountId!==accountId||live.current.snapshot.signature!==captured.signature)throw Error('来源或账号已变化，旧 AI 结果未应用');
 };
 const visionAllowed=profile&&!['codexLocal','geminiWeb','doubaoWork','chatgptWeb','claudeCodePool'].includes(profile.provider)&&(!profile.protocol||['auto','chat'].includes(profile.protocol))&&!/api\.anthropic\.com|\/(?:responses|messages)\/?$/.test(profile.endpoint||'');
 const readImages=async sceneCards=>{
  if(!vision)return [];
  if(!visionAllowed)throw Error('看图请选支持图片输入的 Chat Completions API；本机 Codex 当前用于文字核对');
  if(!api.promptArtImageInputs)throw Error('请更新到支持图片核对的版本');
  return api.promptArtImageInputs({accountId,references:sceneCards.map(card=>card.reference)});
 };
 const call=async messages=>{
  if(stopped.current)throw Error('任务已停止');
  task.current=crypto.randomUUID();
  try{return await api.aiChat({...profile,profileId:profile.id,messages,taskId:task.current,maxOutputTokens:8192});}finally{task.current='';}
 };
 const leave=()=>{
  stopped.current=true;
  if(task.current)Promise.resolve(api.cancelAiTask?.({taskId:task.current})).catch(()=>{});
  onExit();
 };
 const storeForGeneration=async nextBook=>{
  const nextSnapshot=importedSnapshot(nextBook),nextWork=nextBook.importedBinding;
  const stored=await api.promptArtLoad({accountId,projectId:nextSnapshot.projectId});
  if(stopped.current||!mounted.current)throw Error('任务已停止');
  if((stored?.revision||0)!==(nextWork.storeRevision||0))throw Error('关联记录已变化，请重新打开项目');
  const saved=await api.promptArtSave({accountId,projectId:nextSnapshot.projectId,baseRevision:stored?.revision||0,data:{enabled:true,snapshot:nextSnapshot,decisions:nextWork.decisions}});
  if(stopped.current||!mounted.current){
   await api.promptArtSave({accountId,projectId:nextSnapshot.projectId,baseRevision:saved.revision,data:{...saved,enabled:false}});
   return;
  }
  onUpdate(current=>({...current,importedBinding:{...nextWork,stage:'generation',storeRevision:saved.revision}}));
  requestAnimationFrame(()=>document.querySelector('.generation-composer')?.scrollIntoView({block:'start'}));
 };
 const automatic=(currentOnly=false)=>execute(async()=>{
  const targetEntryId=currentOnly?entry.id:null;
  const result=await runImportedAuto({book,targetEntryId,call,readImages,isStopped:()=>stopped.current||!mounted.current||live.current.accountId!==accountId||live.current.sourceSignature!==sourceSignature,checkedWithImages:vision,onProgress:setNotice,
   save:async next=>{
    if(stopped.current||!mounted.current||live.current.sourceSignature!==sourceSignature)throw Error('任务已停止或来源已变化');
    onUpdate(current=>({...current,importedBinding:next.importedBinding}));
   }});
  const target=result.rows.find(row=>row.id===targetEntryId);
  setNotice(currentOnly?`当前 ${entry.label} 已处理：${target?.ready?'关联就绪':target?.issue||'待处理'}。其他提示词未运行。`:`AI 已完成：${result.ready} 条就绪，${result.pending} 条待处理。`);
  if(currentOnly?target?.ready:result.ready)await storeForGeneration(result.book);
  else if(currentOnly)setDetails(true);
  else setShowIssues(true);
 });
 const identify=()=>execute(async()=>{
  const captured=snapshot,images=await readImages(cards);checkCurrent(captured);
  const messages=inventoryMessages(captured,entry.sceneId);
  const metadata=await runBindingRepair({messages:images.length?withBindingImages(messages,images):messages,call,isStopped:()=>stopped.current||!mounted.current,
   onAttempt:attempt=>setNotice(`正在整理本场 ${cards.length} 张图片身份（${attempt}/3）`),
   validate:raw=>applyInventoryAi(captured,entry.sceneId,work.metadata,raw)});
  checkCurrent(captured);mutate(current=>({...current,metadata}));setNotice('AI 身份建议已保存。请对照图片确认分类、人物身份和妆造，再逐条关联。');
 });
 const associate=all=>execute(async()=>{
  const captured=snapshot,targets=all?snapshot.entries:[entry],failures=[],imageCache=new Map();let completed=0;
  for(const target of targets){
   checkCurrent(captured);
   const current=importedDecision(captured,target,live.current.work.decisions);
   if(all&&current.confirmed&&current.signature===entryBindingSignature(captured,target))continue;
   const sceneCards=captured.cards.filter(card=>card.sceneIds.includes(target.sceneId));
   if(!sceneCards.length||sceneCards.some(card=>!card.identityConfirmed||!importedCategories[card.category])){failures.push(`${target.label}：先确认本场素材身份`);continue;}
   try{
    if(!imageCache.has(target.sceneId))imageCache.set(target.sceneId,await readImages(sceneCards));
    const next=await runImportedEntry({snapshot:captured,entry:target,decision:current,call,images:imageCache.get(target.sceneId),isStopped:()=>stopped.current||!mounted.current,
     onAttempt:attempt=>setNotice(`逐条关联 ${target.label}（${attempt}/3）；已完成 ${completed} 条`)});
    checkCurrent(captured);
    mutate(current=>({...current,decisions:{...current.decisions,[target.id]:{...next,aiSuggestedNeeds:structuredClone(next.needs),checkedWithImages:vision}}}));completed++;
   }catch(problem){
    checkCurrent(captured);failures.push(`${target.label}：${problem.message}`);
   }
  }
  setNotice(`已关联 ${completed} 条，待检查 ${failures.length} 条。请逐条核对并确认后进入生成。`);
  if(failures.length)setError(failures.join('；'));
 });
 const confirm=()=>execute(async()=>{
  const problems=bindingProblems(snapshot,entry,decision,{requireConfirmed:false,requireImages:true});
  if(problems.length)throw Error(problems.join('；'));
  compileEntryBinding(snapshot,entry,{...decision,confirmed:true});
  saveDecision({...decision,confirmed:true,confirmedAt:new Date().toISOString(),confirmedPromptHash:bindingHash(entry.prompt)});setNotice(`${entry.label} 已确认；本条不用的图片仍保留在场景素材中。`);
 });
 const publish=()=>execute(async()=>{
  const ready=snapshot.entries.filter(row=>{try{compileEntryBinding(snapshot,row,work.decisions[row.id]);return true;}catch{return false;}}).length;
  if(!ready)throw Error('请至少确认一条有效关联');
  await storeForGeneration(book);
 });
 const ready=snapshot.entries.filter(row=>!bindingProblems(snapshot,row,work.decisions[row.id],{requireImages:true}).length).length;
 const unused=cards.filter(card=>!decision.needs.some(need=>need.visibility==='visible'&&need.cardUid===card.uid));
 return <section className="prompt-art-panel imported-art-panel" aria-label="提示词与图片独立关联">
  <header className="imported-binding-header"><div><h2>AI 整理提示词与图片 <small>管理员专用</small></h2><span>{snapshot.entries.length} 条提示词 · {summary.ready} 条就绪 · {summary.pending} 条待处理</span></div><button onClick={leave}>返回原编辑模式</button></header>

  <ModelSelect label="关联模型" profiles={state.apiProfiles||[]} value={modelId} onChange={setModelId} disabled={busy}/>
  <label className="imported-vision"><input type="checkbox" checked={vision} disabled={busy} onChange={event=>setVision(event.target.checked)}/>发送本场图片给支持看图的 API（最多 24 张）</label>

  <div className="prompt-art-actions"><button className="imported-auto-start" disabled={busy||!profile||!cards.length} onClick={()=>automatic(true)}>AI 只关联当前条目（{entry.label}）</button><button disabled={busy||!profile||!snapshot.cards.length} onClick={()=>automatic(false)}>AI 自动整理整本</button>{busy&&<button onClick={()=>{stopped.current=true;if(task.current)Promise.resolve(api.cancelAiTask?.({taskId:task.current})).catch(()=>{});}}>停止整理并保留进度</button>}<button disabled={busy} onClick={()=>setShowIssues(value=>!value)}>只看待处理（{summary.pending}）</button><button disabled={busy||!ready} onClick={publish}>使用已就绪关联（{ready}）</button></div>
  {error&&<p className="collab-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {showIssues&&<div className="imported-binding-issues" aria-label="待处理关联">{summary.rows.filter(row=>!row.ready).map(row=><button disabled={busy} key={row.id} onClick={()=>{onSelect(row.id);setDetails(true);}}><strong>{row.label}</strong><span>{row.issue}</span><small>展开处理</small></button>)}</div>}
  <details open={details} onToggle={event=>setDetails(event.currentTarget.open)}><summary>查看本条详情 / 手动调整（{entry.label}）</summary>
  <details><summary>本场 {cards.length} 张图片的身份（按场整理，同场各条共用）</summary>
   <div className="prompt-art-actions"><button disabled={busy||!profile||!cards.length} onClick={identify}>AI 整理本场素材身份</button>
    <button disabled={busy||!cards.length} onClick={()=>execute(async()=>{
     if(cards.some(card=>!importedCategories[card.category]||!card.name.trim()))throw Error('请为每张图片确定人物、场景或道具分类和名称');
     mutate(current=>({...current,metadata:{...current.metadata,...Object.fromEntries(cards.map(card=>[card.uid,{...current.metadata[card.uid],category:card.category,name:card.name,description:card.description,confirmed:true}]))}}));setNotice('本场素材身份已确认，可继续逐条关联。');
    })}>确认本场素材身份</button></div>
   <div className="imported-art-cards" role="region" aria-label="本场图片身份列表" tabIndex={0}>{cards.map(card=><article key={card.uid}>
    <img src={mediaSource(card.reference)} alt={card.name} loading="lazy"/>
    <label>分类<select aria-label={`${card.uid}分类`} disabled={busy} value={card.category} onChange={event=>changeMeta(card.uid,{category:event.target.value})}><option value="unknown">待核对</option>{Object.entries(importedCategories).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
    <label>主体名称<input aria-label={`${card.uid}名称`} disabled={busy} value={card.name} onChange={event=>changeMeta(card.uid,{name:event.target.value})}/></label>
    <label>妆造 / 所有者 / 说明<input aria-label={`${card.uid}说明`} disabled={busy} value={card.description} onChange={event=>changeMeta(card.uid,{description:event.target.value})}/></label>
    <small>{card.identityConfirmed?'身份已确认':'身份待核对'}</small>
   </article>)}</div>
  </details>
  <details><summary>查看或修正 {entry.label} 原提示词</summary><textarea aria-label="关联原提示词" rows={8} value={entry.prompt} disabled={busy} onChange={event=>{const prompt=event.target.value;mutate(current=>({...current,prompts:{...current.prompts,[entry.id]:prompt}}));}}/></details>
  <div className="prompt-art-actions"><b>第二步：逐条关联</b><button disabled={busy||!profile} onClick={()=>associate(false)}>AI 关联本条</button><button disabled={busy||!profile} onClick={()=>associate(true)}>AI 逐条关联整本</button>{busy&&<button onClick={()=>{stopped.current=true;if(task.current)api.cancelAiTask?.({taskId:task.current});}}>停止关联</button>}</div>
  {decision.issue&&<p className="collab-error">{decision.issue}</p>}
  <div className="prompt-art-needs" role="region" aria-label="本条素材关联列表" tabIndex={0}>{decision.needs.map(need=><article key={need.id}>
   <div><b>{importedCategories[need.category]} · {need.text}</b><label>用途<select aria-label={`${need.text}用途`} value={need.visibility} disabled={busy} onChange={event=>changeNeed(need.id,{visibility:event.target.value})}>{Object.entries({visible:'画面使用',voice:'仅声音',mentioned:'仅提及',excluded:'本条不用'}).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
   <label>使用图片<select aria-label={`${need.text}关联图片`} value={need.cardUid||''} disabled={busy||need.visibility!=='visible'} onChange={event=>changeNeed(need.id,{cardUid:event.target.value||null,imageId:event.target.value||null})}><option value="">待确定</option>{cards.filter(card=>card.category===need.category).map(card=><option key={card.uid} value={card.uid}>{card.name} · {card.uid.slice(-10)}</option>)}</select></label>
   <label>关联依据<input aria-label={`${need.text}依据`} value={need.reason} disabled={busy} onChange={event=>changeNeed(need.id,{reason:event.target.value})}/></label></div>
   <div className="prompt-art-image">{need.visibility==='visible'&&cards.find(card=>card.uid===need.cardUid)&&<img src={mediaSource(cards.find(card=>card.uid===need.cardUid).reference)} alt={`${need.text}已选图片`}/>}{need.locked&&<small>人工选择已锁定</small>}</div>
  </article>)}</div>
  <p>本条未选图片：{unused.map(card=>card.name).join('、')||'无'}</p>
  <div className="prompt-art-actions"><button disabled={busy} onClick={confirm}>{decision.confirmed?'本条关联已确认':'确认本条关联'}</button><button disabled={busy||!ready} onClick={publish}>进入图视生成（{ready}/{snapshot.entries.length} 条就绪）</button></div>
  </details>

 </section>;
}

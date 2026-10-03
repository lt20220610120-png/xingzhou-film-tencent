import React, {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,CheckCheck,ChevronDown,ChevronLeft,ChevronRight,ClipboardCheck,CloudUpload,Loader2,MapPin,Package,PencilLine,Plus,RefreshCw,Undo2,Users,X} from 'lucide-react';
import {listCollabEpisodes} from '../../core/collabEpisodes.js';
import {parseAssetName} from '../../core/collabStore.js';
import {ART_REVIEW_CATEGORIES,artReviewContext,editArtReview,isReviewCurrent,isSceneVerified,reviewRoster,reviewAssetKey,reviewName,reviewSceneSignature,needsArtReviewDetails} from '../../core/artReview.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {ModelSelect,useWindowModel} from './ModelSelect.jsx';
import '../art-review.css';

const CATEGORY_ICONS={character:Users,scene:MapPin,prop:Package};
function sceneReviewStatus(scene,record){
 if(record.published?.[scene.id]?.signature===reviewSceneSignature(scene))return '已发布';
 return isSceneVerified(scene)?'已核实':scene.mappingReady?'待核实':'待补齐对应';
}

function ReviewDialog({title,children,onClose}){
 const ref=useRef(null);
 useEffect(()=>{const dialog=ref.current;dialog.showModal();const cancel=e=>{e.preventDefault();onClose();};dialog.addEventListener('cancel',cancel);return()=>{dialog.removeEventListener('cancel',cancel);dialog.close();};},[]);
 return <dialog ref={ref} className="art-review-dialog" aria-label={title}><header><h2>{title}</h2><button aria-label="关闭弹窗" onClick={onClose}><X size={18}/></button></header>{children}</dialog>;
}

function SceneAssignment({assignment,scenes,busy,error,onClose,onSave}){
 const ref=useRef(null),[ids,setIds]=useState(assignment.sceneIds);
 useEffect(()=>setIds(previous=>{const valid=previous.filter(id=>scenes.some(scene=>scene.id===id));return valid.length===previous.length?previous:valid;}),[scenes]);
 useLayoutEffect(()=>{
  const popup=ref.current,anchor=assignment.anchor;
  const place=()=>{
   if(!anchor?.isConnected){onClose();return;}
   const a=anchor.getBoundingClientRect(),gap=8,padding=12;
   popup.style.maxHeight=`${Math.max(120,window.innerHeight-padding*2)}px`;
   const r=popup.getBoundingClientRect();
   popup.style.left=`${Math.max(padding,Math.min(a.left,window.innerWidth-r.width-padding))}px`;
   const below=a.bottom+gap,above=a.top-r.height-gap;
   popup.style.top=`${Math.max(padding,Math.min(below+r.height<=window.innerHeight-padding?below:above,window.innerHeight-r.height-padding))}px`;
  };
  const toggle=e=>{if(e.newState==='closed')onClose();};
  popup.showPopover();place();popup.addEventListener('toggle',toggle);
  popup.querySelector('input')?.focus({preventScroll:true});
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{popup.removeEventListener('toggle',toggle);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);if(popup.matches(':popover-open'))popup.hidePopover();};
 },[assignment]);
 const close=()=>{assignment.anchor?.focus({preventScroll:true});onClose();};
 return createPortal(<div ref={ref} popover="auto" role="dialog" aria-label={`关联场景：${reviewName(assignment.item.name)}`} className="art-review-assignment" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}}}>
  <header><h2>{reviewName(assignment.item.name)}</h2><button aria-label="关闭场景关联" onClick={close}><X size={16}/></button></header>
  <p>选择出现场景，可多选</p>
  {error&&<p className="art-review-warning" role="alert">{error}</p>}
  <fieldset className="art-review-scene-checks"><legend className="art-review-sr-only">出现场景</legend>{scenes.map(scene=><label key={scene.id}><input type="checkbox" checked={ids.includes(scene.id)} onChange={e=>setIds(e.target.checked?[...ids,scene.id]:ids.filter(id=>id!==scene.id))}/>{scene.id}</label>)}</fieldset>
  <div className="art-review-dialog-actions"><button onClick={close}>取消</button><button className="art-review-primary" disabled={busy} onClick={()=>onSave(ids)}>保存场景关联</button></div>
 </div>,document.body);
}

function SceneRosterPicker({picker,items,busy,error,onClose,onSave}){
 const [ids,setIds]=useState([]),[query,setQuery]=useState('');
 useEffect(()=>setIds(previous=>{const valid=previous.filter(id=>items.some(item=>item.id===id));return valid.length===previous.length?previous:valid;}),[items]);
 const selected=ids.filter(id=>items.some(item=>item.id===id));
 const label=ART_REVIEW_CATEGORIES[picker.category],visible=items.filter(item=>reviewName(item.name).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <ReviewDialog title={`添加本集${label}`} onClose={onClose}>
  <p>选择已有条目加入本场，可多选。完整信息沿用原卡片。</p>
  {error&&<p className="art-review-warning" role="alert">{error}</p>}
  {items.length>6&&<label className="art-review-picker-search">筛选{label}<input aria-label={`筛选${label}`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入名称或状态"/></label>}
  <div className="art-review-pick-list">{visible.map(item=><label key={item.id}><input type="checkbox" checked={ids.includes(item.id)} onChange={e=>setIds(e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/><span>{reviewName(item.name)}</span>{needsArtReviewDetails(item)&&<small>待补齐</small>}</label>)}</div>
  {!visible.length&&<p className="art-review-empty">{items.length?'没有匹配的条目。':'暂无可添加条目。本场已包含所有本集同类条目，缺少的新条目可用“补充”创建。'}</p>}
  <div className="art-review-dialog-actions"><button onClick={onClose}>取消</button><button className="art-review-primary" disabled={busy||!selected.length} onClick={()=>onSave(selected)}>添加到本场</button></div>
 </ReviewDialog>;
}

function ReviewScene({scene,record,canChange,onAct,onUpdate,onEdit,onAdd,onPublish}){
 const sourceRef=useRef(null);
 useLayoutEffect(()=>{if(sourceRef.current)sourceRef.current.scrollTop=0;},[scene.id]);
 const approved=isSceneVerified(scene),incomplete=(!scene.mappingReady&&!scene.items.length);
 return <section className={`art-review-scene ${approved?'verified':''}`} aria-label={`场景 ${scene.id} 核实`}>
  <header><div><span className="art-review-scene-id">场景 {scene.id}</span><span className={`art-review-status ${approved?'approved':''}`}>{sceneReviewStatus(scene,record)}</span></div><div><button className="art-review-secondary" disabled={!canChange||incomplete} onClick={()=>onAct(()=>onUpdate({type:approved?'unapprove':'approve',sceneId:scene.id}),approved?'本机已保存：已取消本场核实。':'本机已保存：本场名单已核实，待补细节可继续后台补齐。')}><Check size={16}/>{approved?'取消核实':'核实本场'}</button><button className="art-review-accent" disabled={!canChange||incomplete} onClick={()=>onPublish([scene.id])}><CloudUpload size={16}/>核实并发布本场</button></div></header>
  <div className="art-review-scene-columns"><article className="art-review-source"><h3>剧本原文</h3><pre ref={sourceRef} tabIndex={0} aria-label={`场景${scene.id}剧本原文`}>{scene.source}</pre></article><article className="art-review-inventory"><h3>本场清单 <small>名称 / 状态</small></h3>{Object.entries(ART_REVIEW_CATEGORIES).map(([category,label])=>{
   const Icon=CATEGORY_ICONS[category],items=scene.items.filter(i=>i.category===category);
   return <div className="art-review-category" key={category}><div className="art-review-category-heading"><h4><Icon size={17} aria-hidden="true"/>{label}<span>{items.length}</span></h4><div className="art-review-category-actions"><button disabled={!canChange} onClick={()=>onAdd(scene.id,category)} aria-label={`场景${scene.id}添加${label}`}><Plus size={15}/>添加</button><button disabled={!canChange} onClick={()=>onEdit(scene.id,null,category)} aria-label={`场景${scene.id}补充${label}`}><Plus size={15}/>补充</button></div></div>{items.map(item=>{
    const {base,variant}=parseAssetName(item.name);
    return <article className="art-review-item" data-category={category} key={item.id}><div><b>{base}</b>{variant&&<span className="art-review-outfit">{variant}</span>}{needsArtReviewDetails(item)&&<span className="art-review-needs-detail">待补齐细节</span>}{item.detailStatus==='nonvisual'&&<span className="art-review-needs-detail">仅声音 / 提及</span>}{item.note&&<small>{item.note}</small>}{item.warning&&<small>{item.warning}</small>}</div><button aria-label={`修改${reviewName(item.name)}场景${scene.id}`} disabled={!canChange} onClick={()=>onEdit(scene.id,item)}><PencilLine size={18}/></button><button aria-label={`移除${reviewName(item.name)}场景${scene.id}`} disabled={!canChange} onClick={()=>onAct(()=>onUpdate({type:'remove',sceneId:scene.id,itemId:item.id}),'本机已保存：已从本场移除，可撤销。')}><X size={18}/></button></article>;
   })}{!items.length&&<p className="art-review-empty">未列出{label}</p>}</div>;
  })}{!!scene.removed.length&&<button className="art-review-undo" disabled={!canChange} onClick={()=>onAct(()=>onUpdate({type:'undo',sceneId:scene.id}),'本机已保存：已撤销最近移除。')}><Undo2 size={15}/>撤销最近移除</button>}</article></div>
 </section>;
}

export default function ArtReviewSection({project,assets,api,state,accountId,canEdit,refresh,analysisJob,onAnalyze,onStop,onOpenArt}){
 const episodes=useMemo(()=>listCollabEpisodes(project.episodes),[project.episodes]);
 const store=useMemo(()=>getArtReviewStore({api,projectId:project.id,accountId}),[api,project.id,accountId]);
 const [number,setNumber]=useState(episodes[0]?.episodeNumber),[,rerender]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState(null),[confirmation,setConfirmation]=useState(null),[assignment,setAssignment]=useState(null),[picker,setPicker]=useState(null);
 const autoAttempts=useRef(new Set()),publishTasks=useRef(new Set()),sceneNavRef=useRef(null),[selectedScenes,setSelectedScenes]=useState({});
 const [modelId,setModelId,profile]=useWindowModel(`analysis:${project.id}`,state.apiProfiles||[],state.activeApiId);
 useEffect(()=>store.subscribe(()=>rerender(v=>v+1)),[store]);
 useEffect(()=>{let active=true;store.load(project,assets).catch(e=>active&&setError(e.message)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[store,project,assets]);
 useEffect(()=>{if(!episodes.some(e=>e.episodeNumber===number))setNumber(episodes[0]?.episodeNumber);},[episodes,number]);
 const ledger=store.snapshot(),episode=episodes.find(e=>e.episodeNumber===number),record=ledger.episodes[number],current=isReviewCurrent(record,episode),running=['running','stopping'].includes(analysisJob?.status);
 const position=episodes.findIndex(e=>e.episodeNumber===number),scenes=record?.scenes||[],verified=scenes.filter(isSceneVerified),published=scenes.filter(s=>record?.published?.[s.id]?.signature===reviewSceneSignature(s));
 const selectedScene=scenes.find(scene=>scene.id===selectedScenes[number])||scenes[0],selectedSceneId=selectedScene?.id,scenePosition=scenes.findIndex(scene=>scene.id===selectedSceneId);
 useLayoutEffect(()=>{const nav=sceneNavRef.current,active=nav?.querySelector('[aria-current="step"]');if(!active)return;const button=active.getBoundingClientRect(),bounds=nav.getBoundingClientRect();if(button.left<bounds.left)nav.scrollLeft+=button.left-bounds.left;else if(button.right>bounds.right)nav.scrollLeft+=button.right-bounds.right;},[number,selectedSceneId,loading]);
 useEffect(()=>{setAssignment(null);setPicker(null);setEditor(null);setConfirmation(null);setError('');setNotice('');},[number,selectedSceneId]);
 const pendingDetails=episodes.reduce((sum,e)=>sum+(isReviewCurrent(ledger.episodes[e.episodeNumber],e)?reviewRoster(ledger.episodes[e.episodeNumber]).filter(needsArtReviewDetails).length:0),0);
 const allVerified=episodes.reduce((sum,e)=>sum+(isReviewCurrent(ledger.episodes[e.episodeNumber],e)?ledger.episodes[e.episodeNumber]?.scenes.filter(isSceneVerified).length||0:0),0);
 const roster=record?reviewRoster(record):[];
 useEffect(()=>{
  if(loading||!current||!canEdit||running||!profile||!['legacy','mapping-pending'].includes(record?.status))return;
  const key=`${number}:${record.sourceContent}`;if(autoAttempts.current.has(key))return;autoAttempts.current.add(key);
  onAnalyze({profile,episodeNumber:number,force:false}).catch(e=>setError(e.message));
 },[loading,current,canEdit,busy,running,profile?.id,number,record?.status]);
 const act=async(fn,success='')=>{setBusy(v=>v+1);setError('');setNotice('');try{await fn();if(success)setNotice(success);}catch(e){setError(e.message);}finally{setBusy(v=>Math.max(0,v-1));}};
 const update=action=>store.update(number,r=>editArtReview(r,action,accountId));
 const closeOverlays=()=>{setAssignment(null);setPicker(null);setEditor(null);setConfirmation(null);setError('');setNotice('');};
 const chooseEpisode=next=>{closeOverlays();setNumber(next);};
 const chooseScene=id=>{closeOverlays();setSelectedScenes(previous=>({...previous,[number]:id}));};
 const analyze=async(force=true)=>{setError('');setNotice('');try{await onAnalyze({profile,episodeNumber:number,force,mapOnly:!force&&roster.length>0});}catch(e){setError(e.message);}};
 const openEditor=(sceneId,item=null,category='character')=>{
  setError('');const parsed=parseAssetName(item?.name||'');setEditor({episodeNumber:number,sceneId,itemId:item?.id,sceneIds:item?scenes.filter(s=>s.items.some(i=>reviewAssetKey(i)===reviewAssetKey(item))).map(s=>s.id):sceneId?[sceneId]:[],category:item?.category||category,base:parsed.base,state:parsed.variant,note:item?.note||'',original:item});
 };
 const reusable=useMemo(()=>{
  if(!episode||!record)return [];
  const context=artReviewContext(ledger.episodes,episode),map=new Map();
  [...context.available,...reviewRoster(record)].forEach(i=>map.set(reviewAssetKey(i),i));
  return [...map.values()];
 },[episode,record,assets,ledger,number]);
 const saveItem=(generate=false)=>{if(!canEdit||!current||!editor||editor.episodeNumber!==number||(editor.sceneId&&editor.sceneId!==selectedSceneId))return;return act(async()=>{
  const name=`【${editor.base.trim()}${editor.state.trim()?'-'+editor.state.trim():''}】`,same=editor.original?.name===name&&editor.original.category===editor.category,chosen=reusable.find(i=>i.name===name&&i.category===editor.category);
  const item={...(same?editor.original:chosen||{}),category:editor.category,name,description:same?editor.original.description:chosen?.description||'',ready:editor.note!==(editor.original?.note||'')?false:same?editor.original.ready:Boolean(chosen?.ready),firstEpisode:chosen?.firstEpisode||number,note:editor.note};
  if(!same||editor.note!==(editor.original?.note||''))delete item.detailStatus;
  const existing=roster.find(i=>i.name===name&&i.category===editor.category);
  if(existing&&!editor.itemId)await update({type:'assign',itemId:existing.id,sceneIds:[...new Set([...editor.sceneIds,...scenes.filter(s=>s.items.some(i=>i.id===existing.id)).map(s=>s.id)])]});
  else await update({type:'roster-upsert',itemId:editor.itemId,sceneIds:editor.sceneIds,pinSceneSelection:editor.sceneSelectionChanged,item});setEditor(active=>active===editor?null:active);
  const saved=reviewRoster(store.snapshot().episodes[number]).find(i=>i.name===name&&i.category===editor.category);
  if(generate&&saved&&needsArtReviewDetails(saved)){const job=await onAnalyze({profile,episodeNumber:number,force:true,focusItem:saved});if(job?.error)throw Error(job.error);}
 },generate?'信息卡已在本机保存并补齐。':'修改已在本机保存，完整描述可以单独补齐。');};
 const askPublish=sceneIds=>setConfirmation({title:sceneIds?.length===1?'核实并发布本场清单':sceneIds?'核实并发布本集清单':'发布全部已核实清单',kind:'publish',sceneIds,episodeNumber:number});
 const confirmAction=()=>{const choice=confirmation;if(!canEdit||!choice||choice.episodeNumber!==number)return;return act(async()=>{
  setConfirmation(null);
  if(choice.kind==='cloud'){const p=await api.collabGetProject({projectId:project.id});await store.useCloud(choice.episodeNumber,p);setNotice('已采用云端清单，本机冲突版本已另存历史备份。');return;}
  if(choice.kind==='approve-all'){
   let count=0,skipped=0;
   const changes=episodes.filter(e=>isReviewCurrent(store.snapshot().episodes[e.episodeNumber],e)).map(e=>({number:e.episodeNumber,reduce:r=>{
    for(const scene of r.scenes){if(!scene.mappingReady&&!scene.items.length){skipped++;continue;}r=editArtReview(r,{type:'approve',sceneId:scene.id},accountId);count++;}return r;
   }}));
   await store.updateMany(changes);
   setNotice(`本机已保存：核实 ${count} 场${skipped?`；${skipped} 场尚未读取，继续保留待核实`:''}。待补细节不影响名单核实。`);return;
  }
  const publishKey=choice.sceneIds?`episode:${choice.episodeNumber}`:'all';if(publishTasks.current.has(publishKey))return;publishTasks.current.add(publishKey);
  try{
  if(choice.sceneIds){
   await store.update(choice.episodeNumber,r=>{for(const id of choice.sceneIds)if(!isSceneVerified(r.scenes.find(s=>s.id===id)))r=editArtReview(r,{type:'approve',sceneId:id},accountId);return r;});
   await store.publish(choice.episodeNumber,choice.sceneIds);setNotice(`第 ${choice.episodeNumber} 集已发布 ${choice.sceneIds.length} 场到美术与资产，已有图片和编辑保留。`);
  }else{
   let count=0;const failures=[];for(const e of episodes){const r=store.snapshot().episodes[e.episodeNumber];if(!isReviewCurrent(r,e))continue;const ids=r.scenes.filter(isSceneVerified).map(s=>s.id);if(!ids.length)continue;try{await store.publish(e.episodeNumber,ids);count+=ids.length;}catch(e){failures.push(e.message);}}
   setNotice(`已发布 ${count} 场；未核实部分继续保留。`);if(failures.length)setError([...new Set(failures)].join('；'));
  }
  await refresh({manual:true});
  }finally{publishTasks.current.delete(publishKey);}
 });};
 if(loading)return <div className="art-review-loading"><Loader2 className="spin" size={20}/>正在读取核实清单…</div>;
 if(!episode||!record)return <div className="collab-notice">请先在信息读取中添加剧本分集。</div>;
 const canChange=canEdit&&current;
 const feedback=[
  {text:busy>0?'正在后台保存或发布…':''},
  {text:running?analysisJob.notice:''},
  {text:notice},
  {text:error,warning:true},
  {text:!current?'剧本正文已更新，旧核实记录保留。请重新分析本集，再核实和发布。':'',warning:true},
  {text:record.failure,warning:true},
  {text:record.syncError?`发布未完成：${record.syncError}。本机修改已保留。`:'',warning:true,cloud:true}
 ].filter(item=>item.text);
 const feedbackHasWarning=feedback.some(item=>item.warning);
 return <div className="art-review-page">
  <header className="art-review-heading"><div><span className="art-review-eyebrow">项目协作 / 清单核实</span><h1>先核实清单，再建立资产</h1></div><button className="art-review-secondary" onClick={onOpenArt}>查看美术与资产</button></header>
  <details className="art-review-roster" key={number} onToggle={e=>{if(!e.currentTarget.open)setAssignment(null);}}><summary><h2>本集资产名单 <span>{roster.length}</span></h2><span className="art-review-roster-counts">{Object.entries(ART_REVIEW_CATEGORIES).map(([category,label])=><span key={category}>{label} {roster.filter(i=>i.category===category).length}</span>)}</span><span className="art-review-save-state">{record.pending?'本机已保存 · 未发布':'清单已保存'}</span><ChevronDown size={16}/></summary><header>{!!record.unassigned.length&&<p>{record.unassigned.length} 条未关联</p>}<div><button className="art-review-secondary" disabled={!canChange} onClick={()=>openEditor(null)}><Plus size={15}/>补充名单</button>{!!record.rosterRemoved?.length&&<button disabled={!canChange} onClick={()=>act(()=>update({type:'roster-undo'}))}><Undo2 size={14}/>撤销名单移除</button>}</div></header>{Object.entries(ART_REVIEW_CATEGORIES).map(([category,label])=><div className="art-review-roster-group" key={category}><h3>{label}<span>{roster.filter(i=>i.category===category).length}</span></h3><div className="art-review-roster-list">{roster.filter(i=>i.category===category).map(item=>{
   const ids=scenes.filter(s=>s.items.some(i=>reviewAssetKey(i)===reviewAssetKey(item))).map(s=>s.id);
   return <article className="art-review-roster-card" key={item.id}><div className="art-review-roster-name"><b title={reviewName(item.name)}>{reviewName(item.name)}</b>{needsArtReviewDetails(item)&&<span className="art-review-needs-detail">待补齐</span>}</div><div className="art-review-roster-actions"><button disabled={!canChange} aria-label={`关联${reviewName(item.name)}的场景`} aria-haspopup="dialog" aria-expanded={assignment?.episodeNumber===number&&assignment?.item.id===item.id} onClick={e=>{setError('');setAssignment(assignment?.episodeNumber===number&&assignment?.item.id===item.id?null:{item,sceneIds:ids,anchor:e.currentTarget,episodeNumber:number});}}>关联场景<ChevronDown size={14}/></button><button disabled={!canChange} aria-label={`修改名单${reviewName(item.name)}`} onClick={()=>openEditor(null,item)}><PencilLine size={14}/>修改</button>{needsArtReviewDetails(item)&&<button disabled={!canChange||running||!profile} onClick={()=>act(async()=>{const job=await onAnalyze({profile,episodeNumber:number,force:true,focusItem:item});if(job?.error)throw Error(job.error);},'信息卡已补齐并在本机保存。')}>补齐信息</button>}<button className="art-review-icon-button" disabled={!canChange} aria-label={`移除名单${reviewName(item.name)}`} onClick={()=>act(()=>update({type:'roster-remove',itemId:item.id}),'本机已保存：已移除名单条目，可撤销。')}><X size={16}/></button></div></article>;
  })}{!roster.some(i=>i.category===category)&&<p className="art-review-empty">暂无{label}</p>}</div></div>)}{!roster.length&&<p className="art-review-empty">分析本集后，人物、场景和道具名单会显示在这里。</p>}</details>
  <section className="art-review-navigation-panel" aria-label="分集与场景导航">
  <section className="art-review-controls" aria-label="核实配置">
   <div className="art-review-episode-select"><button aria-label="上一集" disabled={position<=0} onClick={()=>chooseEpisode(episodes[position-1].episodeNumber)}><ChevronLeft size={18}/></button><label>分集<select aria-label="核实分集" value={number} onChange={e=>chooseEpisode(Number(e.target.value))}>{episodes.map(e=><option key={e.episodeNumber} value={e.episodeNumber}>第 {e.episodeNumber} 集 · {e.title||'剧本'}</option>)}</select></label><button aria-label="下一集" disabled={position>=episodes.length-1} onClick={()=>chooseEpisode(episodes[position+1].episodeNumber)}><ChevronRight size={18}/></button></div>
   <div className="art-review-model"><ModelSelect label="读取与补齐模型" displayLabel="模型" value={modelId} onChange={setModelId} profiles={state.apiProfiles||[]} disabled={!canEdit||running}/></div>
   <div className="art-review-controls-actions"><button className="art-review-secondary" disabled={!canEdit||running||!profile} onClick={()=>analyze(false)}><RefreshCw size={15}/>{record.status==='empty'?'分析本集':'自动关联场景'}</button><button className="art-review-secondary" aria-label="重新读取本集（只补缺）" title="重新读取本集，只补充缺少的条目" disabled={!canEdit||running||!profile} onClick={()=>analyze(true)}>重读本集（补缺）</button><button className="art-review-secondary" aria-label={`一键补齐全部待补细节${pendingDetails?` (${pendingDetails})`:""}`} title="一键补齐全剧所有待补细节" disabled={!canEdit||running||!profile||!pendingDetails} onClick={()=>act(async()=>{const job=await onAnalyze({profile,detailsOnly:true});if(job?.error)throw Error(job.error);},'已完成批量补齐；信息卡保存在本机，可继续核实与发布。')}><RefreshCw size={15}/>补齐全剧细节{pendingDetails?` (${pendingDetails})`:''}</button>{running&&<button className="art-review-secondary" onClick={onStop}>停止分析</button>}</div>
  </section>
  {!!scenes.length&&<nav className="art-review-scene-navigation" aria-label="本集场景"><header><h2>逐场核实</h2><div className="art-review-overview"><span>本集 <b>{scenes.length}</b> 场</span><span>已核实 <b>{verified.length}</b></span><span>已发布 <b>{published.length}</b></span></div><div className="art-review-scene-stepper"><button aria-label="上一场" disabled={scenePosition<=0} onClick={()=>chooseScene(scenes[scenePosition-1].id)}><ChevronLeft size={18}/></button><span>当前 {scenePosition+1}/{scenes.length} 场</span><button aria-label="下一场" disabled={scenePosition>=scenes.length-1} onClick={()=>chooseScene(scenes[scenePosition+1].id)}><ChevronRight size={18}/></button></div></header><div ref={sceneNavRef} className="art-review-scene-navigation-list">{scenes.map((scene,index)=>{
   const status=sceneReviewStatus(scene,record),active=scene.id===selectedSceneId;
   return <button key={scene.id} className={active?'active':''} aria-current={active?'step':undefined} aria-label={`第 ${index+1} 场，场景 ${scene.id}，${status}`} onClick={()=>chooseScene(scene.id)}><span className="art-review-nav-id">{scene.id}</span><small>{status}</small></button>;
  })}</div></nav>}
  </section>
  <p className="art-review-sr-only" role="status" aria-live="polite" aria-atomic="true">{feedback.map(item=>item.text.split('\n')[0]).join('；')}</p>
  {!!feedback.length&&<details className={`art-review-feedback ${feedbackHasWarning?'has-warning':''}`}><summary><span>操作反馈（{feedback.reduce((sum,item)=>sum+item.text.split('\n').filter(Boolean).length,0)}）{feedbackHasWarning?' · 有待处理':''}</span>{(busy>0||running)&&<span className="art-review-feedback-progress"><Loader2 className="spin" size={14}/>处理中</span>}<ChevronDown size={16}/></summary><div className="art-review-feedback-body">{feedback.map((item,index)=><div key={index} className={item.warning?'art-review-warning':'art-review-message'}>{item.text}{item.cloud&&<button onClick={()=>setConfirmation({title:'采用云端清单',kind:'cloud',episodeNumber:number})}>采用云端版本</button>}</div>)}</div></details>}
  <div className="art-review-scene-list">{selectedScene&&<ReviewScene key={`${number}:${selectedScene.id}`} scene={selectedScene} record={record} canChange={canChange} onAct={act} onUpdate={update} onEdit={openEditor} onAdd={(sceneId,category)=>{setError('');setPicker({episodeNumber:number,sceneId,category});}} onPublish={askPublish}/>}</div>
  <details className="art-review-history"><summary>保存与分析记录（{record.history.length} 条）</summary><ul>{record.history.slice(-12).reverse().map((h,i)=><li key={i}>{new Date(h.at).toLocaleString('zh-CN')} · {h.reason}{h.sceneId?` · ${h.sceneId}`:''}</li>)}</ul>{(record.warnings||[]).map((w,i)=><p key={i}>{w}</p>)}</details>
  <footer className="art-review-footer"><span><ClipboardCheck size={16}/>第 {number} 集 · 已核实 {verified.length}/{scenes.length} 场</span><div><button className="art-review-secondary" disabled={!canChange} onClick={()=>act(()=>update({type:'approve-episode'}),'本机已保存：本集已核实，清单可发布。')}><CheckCheck size={15}/>核实整集</button><button className="art-review-accent" disabled={!canChange} onClick={()=>askPublish(scenes.map(s=>s.id))}>核实并发布整集</button><button className="art-review-secondary" disabled={!canEdit} onClick={()=>setConfirmation({title:'核实全部可确认清单',kind:'approve-all',episodeNumber:number})}>核实全部…</button><button className="art-review-primary" disabled={!canEdit||!allVerified} onClick={()=>askPublish(null)}>发布全部已核实 ({allVerified} 场)</button></div></footer>
  {editor?.episodeNumber===number&&(!editor.sceneId||editor.sceneId===selectedSceneId)&&<ReviewDialog title={editor.itemId?'修改清单条目':'补充清单条目'} onClose={()=>setEditor(null)}><form onSubmit={e=>{e.preventDefault();saveItem(false);}}>{error&&<p className="art-review-warning" role="alert">{error}</p>}<label>类别<select aria-label="条目类别" value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})}>{Object.entries(ART_REVIEW_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>沿用已有条目<select aria-label="沿用已有条目" value="" onChange={e=>{const item=reusable.find(i=>reviewAssetKey(i)===e.target.value);if(item){const parsed=parseAssetName(item.name);setEditor({...editor,base:parsed.base,state:parsed.variant});}}}><option value="">选择已保存名称与状态…</option>{reusable.filter(i=>i.category===editor.category).map(i=><option key={reviewAssetKey(i)} value={reviewAssetKey(i)}>{reviewName(i.name)}</option>)}</select></label><label>名称<input autoFocus aria-label="条目名称" value={editor.base} required maxLength={180} onChange={e=>setEditor({...editor,base:e.target.value})}/></label><label>{editor.category==='character'?'服装 / 状态':'版本 / 状态'}<input aria-label="条目状态" value={editor.state} maxLength={100} onChange={e=>setEditor({...editor,state:e.target.value})} placeholder={editor.category==='character'?'例如：睡衣、校服、受伤':'可不填'}/></label><label>修改要求（用于补齐细节）<textarea aria-label="修改要求" value={editor.note} maxLength={2000} onChange={e=>setEditor({...editor,note:e.target.value})} placeholder="例如：本场是晚上，穿睡衣，沿用原人物基础形象"/></label><fieldset className="art-review-scene-checks"><legend>出现场景（可多选）</legend>{scenes.map(scene=><label key={scene.id}><input type="checkbox" checked={editor.sceneIds.includes(scene.id)} onChange={e=>setEditor({...editor,sceneSelectionChanged:true,sceneIds:e.target.checked?[...editor.sceneIds,scene.id]:editor.sceneIds.filter(id=>id!==scene.id)})}/>{scene.id}</label>)}</fieldset><div className="art-review-dialog-actions"><button type="button" onClick={()=>setEditor(null)}>取消</button><button type="submit">保存修改</button><button type="button" className="art-review-primary" disabled={running||!profile} onClick={()=>saveItem(true)}>保存并补齐信息卡</button></div></form></ReviewDialog>}
  {picker?.episodeNumber===number&&picker.sceneId===selectedSceneId&&<SceneRosterPicker key={`${picker.episodeNumber}:${picker.sceneId}:${picker.category}`} picker={picker} items={roster.filter(item=>item.category===picker.category&&!scenes.find(scene=>scene.id===picker.sceneId)?.items.some(i=>reviewAssetKey(i)===reviewAssetKey(item)))} busy={!canChange} error={error} onClose={()=>setPicker(null)} onSave={ids=>{if(picker.episodeNumber!==number||picker.sceneId!==selectedSceneId||!canChange){setPicker(null);return;}const target=picker;return act(async()=>{await store.update(target.episodeNumber,r=>editArtReview(r,{type:'add-existing',sceneId:target.sceneId,category:target.category,itemIds:ids},accountId));setPicker(active=>active===target?null:active);},'本机已保存：已添加到本场，完整信息沿用原卡片。');}}/>}
  {assignment?.episodeNumber===number&&<SceneAssignment key={`${assignment.episodeNumber}:${assignment.item.id}`} assignment={assignment} scenes={scenes} busy={!canChange} error={error} onClose={()=>setAssignment(null)} onSave={ids=>{if(assignment.episodeNumber!==number||!canChange){setAssignment(null);return;}return act(async()=>{await store.update(assignment.episodeNumber,r=>editArtReview(r,{type:'assign',itemId:assignment.item.id,sceneIds:ids},accountId));setAssignment(active=>active===assignment?null:active);requestAnimationFrame(()=>assignment.anchor?.focus({preventScroll:true}));},'场景关联已在本机保存。');}}/>}
  {confirmation?.episodeNumber===number&&<ReviewDialog title={confirmation.title} onClose={()=>setConfirmation(null)}>{confirmation.kind==='cloud'?<p>将以最新云端清单替换本集本机修改。当前本机版本会先另存历史备份，方便追溯；确认后才读取并采用云端版本。</p>:confirmation.kind==='approve-all'?<p>确认逐场核实已经完成。确认正文未变的所有已读取场景。待补齐细节和未安排的名单条目保留提醒，不阻止核实名单；尚未读取的空场景继续保留。</p>:<><p>确认清单与剧本相符。发布后按场景绑定具体人物造型、场景和道具，保留已有图片与手工编辑。</p><p>{confirmation.sceneIds?`本次：第 ${number} 集，${confirmation.sceneIds.join('、')}。`:`本次：全剧 ${allVerified} 个已核实场景；未核实部分继续保留。`}</p></>}<div className="art-review-dialog-actions"><button onClick={()=>setConfirmation(null)}>再检查一下</button><button className="art-review-primary" onClick={confirmAction}>{confirmation.kind==='cloud'?'采用云端版本':confirmation.kind==='approve-all'?'确认核实':'确认并发布'}</button></div></ReviewDialog>}
 </div>;
}

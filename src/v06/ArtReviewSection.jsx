import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Check,CheckCheck,ChevronLeft,ChevronRight,ClipboardCheck,CloudUpload,Loader2,PencilLine,Plus,RefreshCw,Undo2,X} from 'lucide-react';
import {listCollabEpisodes} from '../../core/collabEpisodes.js';
import {parseAssetName,readAssetPrompt} from '../../core/collabStore.js';
import {ART_REVIEW_CATEGORIES,artReviewContext,editArtReview,isReviewCurrent,isSceneVerified,removeUnassignedArtReview,reviewAssetKey,reviewName,reviewSceneSignature} from '../../core/artReview.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {ModelSelect,useWindowModel} from './ModelSelect.jsx';
import '../art-review.css';

function ReviewDialog({title,children,onClose}){
 const ref=useRef(null);
 useEffect(()=>{const dialog=ref.current;dialog.showModal();const cancel=e=>{e.preventDefault();onClose();};dialog.addEventListener('cancel',cancel);return()=>{dialog.removeEventListener('cancel',cancel);dialog.close();};},[]);
 return <dialog ref={ref} className="art-review-dialog" aria-label={title}><header><h2>{title}</h2><button aria-label="关闭弹窗" onClick={onClose}><X size={18}/></button></header>{children}</dialog>;
}

export default function ArtReviewSection({project,assets,api,state,accountId,canEdit,refresh,analysisJob,onAnalyze,onStop,onOpenArt}){
 const episodes=useMemo(()=>listCollabEpisodes(project.episodes),[project.episodes]);
 const store=useMemo(()=>getArtReviewStore({api,projectId:project.id,accountId}),[api,project.id,accountId]);
 const [number,setNumber]=useState(episodes[0]?.episodeNumber),[,rerender]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState(null),[confirmation,setConfirmation]=useState(null);
 const [modelId,setModelId,profile]=useWindowModel(`analysis:${project.id}`,state.apiProfiles||[],state.activeApiId);
 useEffect(()=>store.subscribe(()=>rerender(v=>v+1)),[store]);
 useEffect(()=>{let active=true;store.load(project,assets).catch(e=>active&&setError(e.message)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[store,project,assets]);
 useEffect(()=>{if(!episodes.some(e=>e.episodeNumber===number))setNumber(episodes[0]?.episodeNumber);},[episodes,number]);
 const ledger=store.snapshot(),episode=episodes.find(e=>e.episodeNumber===number),record=ledger.episodes[number],current=isReviewCurrent(record,episode),running=['running','stopping'].includes(analysisJob?.status);
 const position=episodes.findIndex(e=>e.episodeNumber===number),scenes=record?.scenes||[],verified=scenes.filter(isSceneVerified),published=scenes.filter(s=>record?.published?.[s.id]?.signature===reviewSceneSignature(s));
 const allVerified=episodes.reduce((sum,e)=>sum+(isReviewCurrent(ledger.episodes[e.episodeNumber],e)?ledger.episodes[e.episodeNumber]?.scenes.filter(isSceneVerified).length||0:0),0);
 const act=async(fn,success='')=>{setBusy(true);setError('');try{await fn();if(success)setNotice(success);}catch(e){setError(e.message);}finally{setBusy(false);}};
 const update=action=>store.update(number,r=>editArtReview(r,action,accountId));
 const analyze=async(force=true)=>{setError('');setNotice('');try{await onAnalyze({profile,episodeNumber:number,force});}catch(e){setError(e.message);}};
 const openEditor=(sceneId,item=null,category='character')=>{
  setError('');const parsed=parseAssetName(item?.name||'');setEditor({sceneId,itemId:item?.id,category:item?.category||category,base:parsed.base,state:parsed.variant,note:item?.note||'',original:item});
 };
 const reusable=useMemo(()=>{
  if(!episode||!record)return [];
  const context=artReviewContext(ledger.episodes,episode),map=new Map();
  [...assets.filter(a=>Number(a.first_episode)<=number).map(a=>({id:a.id,category:a.category,name:a.name,description:readAssetPrompt(a).content,ready:Boolean(readAssetPrompt(a).content),firstEpisode:a.first_episode})),...context.available,...record.unassigned,...record.scenes.flatMap(s=>s.items)].forEach(i=>map.set(reviewAssetKey(i),i));
  return [...map.values()];
 },[episode,record,assets,ledger,number]);
 const saveItem=()=>act(async()=>{
  const name=`【${editor.base.trim()}${editor.state.trim()?'-'+editor.state.trim():''}】`,same=editor.original?.name===name&&editor.original.category===editor.category,chosen=reusable.find(i=>i.name===name&&i.category===editor.category);
  await update({type:'upsert',sceneId:editor.sceneId,itemId:editor.itemId,item:{...(same?editor.original:chosen||{}),category:editor.category,name,description:same?editor.original.description:chosen?.description||'',ready:editor.note!==(editor.original?.note||'')?false:same?editor.original.ready:Boolean(chosen?.ready),firstEpisode:chosen?.firstEpisode||number,note:editor.note}});setEditor(null);
 },'修改已保存；新造型可按修改重新生成本集，补齐卡片细节。');
 const askPublish=sceneIds=>setConfirmation({title:sceneIds?'核实并发布本集清单':'发布全部已核实清单',kind:'publish',sceneIds});
 const confirmAction=()=>act(async()=>{
  const choice=confirmation;setConfirmation(null);
  if(choice.kind==='cloud'){await refresh({manual:true});const p=await api.collabGetProject({projectId:project.id});await store.useCloud(number,p);setNotice('已采用云端清单，本地冲突版本保留在历史记录中。');return;}
  if(choice.kind==='approve-all'){
   let count=0;for(const e of episodes){const r=store.snapshot().episodes[e.episodeNumber];if(!isReviewCurrent(r,e)||r.unassigned.length||!r.scenes.every(s=>s.mappingReady&&s.items.every(i=>i.ready&&i.description?.trim())))continue;await store.update(e.episodeNumber,v=>editArtReview(v,{type:'approve-episode'},accountId));count++;}
   setNotice(`已核实 ${count} 集；有未定位或待补齐条目的分集保留待核实。`);return;
  }
  if(choice.sceneIds){
   for(const id of choice.sceneIds)if(!isSceneVerified(store.snapshot().episodes[number].scenes.find(s=>s.id===id)))await update({type:'approve',sceneId:id});
   await store.publish(number,choice.sceneIds);setNotice(`已发布 ${choice.sceneIds.length} 场到美术与资产，已有图片和编辑保留。`);
  }else{
   let count=0;const failures=[];for(const e of episodes){const r=store.snapshot().episodes[e.episodeNumber];if(!isReviewCurrent(r,e))continue;const ids=r.scenes.filter(isSceneVerified).map(s=>s.id);if(!ids.length)continue;try{await store.publish(e.episodeNumber,ids);count+=ids.length;}catch(e){failures.push(e.message);}}
   setNotice(`已发布 ${count} 场；未核实部分继续保留。`);if(failures.length)setError([...new Set(failures)].join('；'));
  }
  await refresh({manual:true});
 });
 if(loading)return <div className="art-review-loading"><Loader2 className="spin" size={20}/>正在读取核实清单…</div>;
 if(!episode||!record)return <div className="collab-notice">请先在信息读取中添加剧本分集。</div>;
 const canChange=canEdit&&!busy&&current;
 return <div className="art-review-page">
  <header className="art-review-heading"><div><span className="art-review-eyebrow">项目协作 / 美术清单核实</span><h1>先核实清单，再建立资产</h1><p>只看名称与状态。卡片描述在后台保留，场景按剧本顺序排列。</p></div><button className="art-review-secondary" onClick={onOpenArt}>查看美术与资产</button></header>
  <section className="art-review-controls" aria-label="核实配置">
   <div className="art-review-episode-select"><button aria-label="上一集" disabled={position<=0||busy} onClick={()=>setNumber(episodes[position-1].episodeNumber)}><ChevronLeft size={18}/></button><label>选择分集<select aria-label="核实分集" value={number} disabled={busy} onChange={e=>{setNumber(Number(e.target.value));setError('');setNotice('');}}>{episodes.map(e=><option key={e.episodeNumber} value={e.episodeNumber}>第 {e.episodeNumber} 集 · {e.title||'剧本'}</option>)}</select></label><button aria-label="下一集" disabled={position>=episodes.length-1||busy} onClick={()=>setNumber(episodes[position+1].episodeNumber)}><ChevronRight size={18}/></button></div>
   <div className="art-review-model"><ModelSelect label="补齐细节的模型" value={modelId} onChange={setModelId} profiles={state.apiProfiles||[]} disabled={!canEdit||running||busy}/></div>
   <div className="art-review-controls-actions"><button className="art-review-secondary" disabled={!canEdit||running||busy||!profile} onClick={()=>analyze(record.status!=='empty'&&record.status!=='legacy'&&record.status!=='mapping-pending')}><RefreshCw size={15}/>{record.status==='empty'?'分析本集':record.status==='mapping-pending'||record.status==='legacy'?'补齐逐场对应':'按修改重新生成本集'}</button>{running&&<button className="art-review-secondary" onClick={onStop}>停止分析</button>}</div>
  </section>
  <div className="art-review-overview"><span>本集 <b>{scenes.length}</b> 场</span><span>已核实 <b>{verified.length}</b> 场</span><span>已发布 <b>{published.length}</b> 场</span><span className="art-review-save-state">{record.pending?'本机已保存 · 待同步云端':'清单已保存'}</span></div>
  <div aria-live="polite">{running&&<p className="art-review-message">{analysisJob.notice}</p>}{notice&&<p className="art-review-message">{notice}</p>}{error&&<p className="art-review-warning" role="alert">{error}</p>}{!current&&<p className="art-review-warning">剧本正文已更新，旧核实记录保留。请重新分析本集，再核实和发布。</p>}{record.failure&&<p className="art-review-warning">{record.failure}。已经返回的清单保留，可继续补齐。</p>}{record.syncError&&<div className="art-review-warning">{record.syncError}<button disabled={busy} onClick={()=>act(()=>store.sync(),'已重试同步；仍有冲突时可采用云端版本。')}>重试同步</button>{project.analysis_progress?.[number]?.review&&<button disabled={busy} onClick={()=>setConfirmation({title:'采用云端清单',kind:'cloud'})}>采用云端版本</button>}</div>}</div>
  {!!record.unassigned.length&&<section className="art-review-unassigned"><header><div><h2>未定位条目 <span>{record.unassigned.length}</span></h2><p>历史清单或对应关系未完整返回。安排到具体场景，或移除不需要的条目。</p></div></header><div className="art-review-unassigned-list">{record.unassigned.map(item=><div key={item.id}><span>{ART_REVIEW_CATEGORIES[item.category]}</span><b>{reviewName(item.name)}</b><select aria-label={`安排${reviewName(item.name)}到场景`} value="" disabled={!canChange} onChange={e=>act(()=>update({type:'upsert',sceneId:e.target.value,item}))}><option value="">安排到场景…</option>{scenes.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</select><button aria-label={`移除未定位${reviewName(item.name)}`} disabled={!canChange} onClick={()=>act(()=>store.update(number,r=>removeUnassignedArtReview(r,item.id)))}><X size={15}/></button></div>)}</div></section>}
  <div className="art-review-scene-list">{scenes.map(scene=>{
   const approved=isSceneVerified(scene),released=record.published?.[scene.id]?.signature===reviewSceneSignature(scene),incomplete=(!scene.mappingReady&&!scene.items.length)||scene.items.some(i=>!i.ready||!i.description?.trim());
   return <section className={`art-review-scene ${approved?'verified':''}`} key={scene.id} aria-label={`场景 ${scene.id} 核实`}>
    <header><div><span className="art-review-scene-id">场景 {scene.id}</span><span className={`art-review-status ${approved?'approved':''}`}>{released?'已发布':approved?'已核实':scene.mappingReady?'待核实':'待补齐对应'}</span></div><div><button className="art-review-secondary" disabled={!canChange||incomplete} onClick={()=>act(()=>update({type:approved?'unapprove':'approve',sceneId:scene.id}),approved?'已取消本场核实':'本场已核实，可发布到美术与资产。')}><Check size={15}/>{approved?'取消核实':'核实本场'}</button><button className="art-review-accent" disabled={!canChange||incomplete} onClick={()=>askPublish([scene.id])}><CloudUpload size={15}/>核实并发布本场</button></div></header>
    <div className="art-review-scene-columns"><article className="art-review-source"><h3>剧本原文</h3><pre>{scene.source}</pre></article><article className="art-review-inventory"><h3>美术清单 <small>名称 / 状态</small></h3>{Object.entries(ART_REVIEW_CATEGORIES).map(([category,label])=><div className="art-review-category" key={category}><div className="art-review-category-heading"><h4>{label}<span>{scene.items.filter(i=>i.category===category).length}</span></h4><button disabled={!canChange} onClick={()=>openEditor(scene.id,null,category)} aria-label={`场景${scene.id}补充${label}`}><Plus size={14}/>补充</button></div>{scene.items.filter(i=>i.category===category).map(item=>{const {base,variant}=parseAssetName(item.name);return <div className="art-review-item" key={item.id}><div><b>{base}</b>{variant&&<span className="art-review-outfit">{variant}</span>}{!item.ready&&<span className="art-review-needs-detail">待补齐细节</span>}{item.note&&<small>{item.note}</small>}{item.warning&&<small>{item.warning}</small>}</div><button aria-label={`修改${reviewName(item.name)}场景${scene.id}`} disabled={!canChange} onClick={()=>openEditor(scene.id,item)}><PencilLine size={14}/></button><button aria-label={`移除${reviewName(item.name)}场景${scene.id}`} disabled={!canChange} onClick={()=>act(()=>update({type:'remove',sceneId:scene.id,itemId:item.id}))}><X size={15}/></button></div>;})}{!scene.items.some(i=>i.category===category)&&<p className="art-review-empty">未列出{label}</p>}</div>)}{!!scene.removed.length&&<button className="art-review-undo" disabled={!canChange} onClick={()=>act(()=>update({type:'undo',sceneId:scene.id}))}><Undo2 size={14}/>撤销最近移除</button>}{incomplete&&<p className="art-review-detail-note">补充或改名后，按修改重新生成本集即可补齐详细描述。</p>}</article></div>
   </section>;
  })}</div>
  <details className="art-review-history"><summary>保存与分析记录（{record.history.length} 条）</summary><p>完整模型回包、修改前清单和正文变更均保留；生成图片会在美术与资产中单独操作。</p><ul>{record.history.slice(-12).reverse().map((h,i)=><li key={i}>{new Date(h.at).toLocaleString('zh-CN')} · {h.reason}{h.sceneId?` · ${h.sceneId}`:''}</li>)}</ul>{(record.warnings||[]).map((w,i)=><p key={i}>{w}</p>)}</details>
  <footer className="art-review-footer"><span><ClipboardCheck size={16}/>第 {number} 集 · 已核实 {verified.length}/{scenes.length} 场</span><div><button className="art-review-secondary" disabled={!canChange||!!record.unassigned.length} onClick={()=>act(()=>update({type:'approve-episode'}),'本集已核实，清单可发布。')}><CheckCheck size={15}/>核实整集</button><button className="art-review-accent" disabled={!canChange||!!record.unassigned.length} onClick={()=>askPublish(scenes.map(s=>s.id))}>核实并发布整集</button><button className="art-review-secondary" disabled={!canEdit||busy||running} onClick={()=>setConfirmation({title:'核实全部可确认清单',kind:'approve-all'})}>核实全部…</button><button className="art-review-primary" disabled={!canEdit||busy||!allVerified} onClick={()=>askPublish(null)}>发布全部已核实 ({allVerified} 场)</button></div></footer>
  {editor&&<ReviewDialog title={editor.itemId?'修改清单条目':'补充清单条目'} onClose={()=>setEditor(null)}><form onSubmit={e=>{e.preventDefault();saveItem();}}>{error&&<p className="art-review-warning" role="alert">{error}</p>}<label>类别<select aria-label="条目类别" value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})}>{Object.entries(ART_REVIEW_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>沿用已有条目<select aria-label="沿用已有条目" value="" onChange={e=>{const item=reusable.find(i=>reviewAssetKey(i)===e.target.value);if(item){const parsed=parseAssetName(item.name);setEditor({...editor,base:parsed.base,state:parsed.variant});}}}><option value="">选择已保存名称与状态…</option>{reusable.filter(i=>i.category===editor.category).map(i=><option key={reviewAssetKey(i)} value={reviewAssetKey(i)}>{reviewName(i.name)}</option>)}</select></label><label>名称<input autoFocus aria-label="条目名称" value={editor.base} required maxLength={180} onChange={e=>setEditor({...editor,base:e.target.value})}/></label><label>{editor.category==='character'?'服装 / 状态':'版本 / 状态'}<input aria-label="条目状态" value={editor.state} maxLength={100} onChange={e=>setEditor({...editor,state:e.target.value})} placeholder={editor.category==='character'?'例如：睡衣、校服、受伤':'可不填'}/></label><label>修改要求（用于补齐细节）<textarea aria-label="修改要求" value={editor.note} maxLength={2000} onChange={e=>setEditor({...editor,note:e.target.value})} placeholder="例如：本场是晚上，穿睡衣，沿用原人物基础形象"/></label><p>名称和状态会直接显示在核实清单中。新增造型的完整描述由本集重新生成补齐。</p><div className="art-review-dialog-actions"><button type="button" onClick={()=>setEditor(null)}>取消</button><button type="submit" className="art-review-primary" disabled={busy}>保存修改</button></div></form></ReviewDialog>}
  {confirmation&&<ReviewDialog title={confirmation.title} onClose={()=>setConfirmation(null)}>{confirmation.kind==='cloud'?<p>采用最新云端版本；当前本地修改另存历史，方便追溯。</p>:confirmation.kind==='approve-all'?<p>确认逐场核实已经完成。只确认正文未变、对应已完整且细节已齐备的分集，未定位和缺失条目继续保留。</p>:<><p>确认清单与剧本相符。发布后按场景绑定具体人物造型、场景和道具，保留已有图片与手工编辑。</p><p>{confirmation.sceneIds?`本次：第 ${number} 集，${confirmation.sceneIds.join('、')}。`:`本次：全剧 ${allVerified} 个已核实场景；未核实部分继续保留。`}</p></>}<div className="art-review-dialog-actions"><button onClick={()=>setConfirmation(null)}>再检查一下</button><button className="art-review-primary" disabled={busy} onClick={confirmAction}>{confirmation.kind==='cloud'?'采用云端版本':confirmation.kind==='approve-all'?'确认核实':'确认并发布'}</button></div></ReviewDialog>}
 </div>;
}

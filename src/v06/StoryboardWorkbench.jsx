import StoryboardConflict from './StoryboardConflict.jsx';
import {readStoryboardDefaults,saveStoryboardDefaults,applyStoryboardDefaults} from '../../core/storyboardDefaults.js';
import {missingStoryboardReferences,restoreStoryboardReferences,rememberStoryboardRemoval,storyboardRecoveryBaseline} from '../../core/storyboardReferenceRecovery.js';
import './StoryboardWorkbench.css';
import {readCollabNavigation,rememberCollabNavigation} from '../../core/collabNavigation.js';
import useProjectPromptBinding from './useProjectPromptBinding.js';
import {storyboardPromptValue,storyboardSaveUpdates,canRefreshStoryboardBinding} from '../../core/promptAssetUsage.js';
import {displayAssetName} from '../../core/collabStore.js';
import {FormattedText,FormattedEditor} from '../components/FormattedText.jsx';
import {queueDraft,readQueuedDraft} from '../editing.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import React,{useState,useEffect,useRef,useMemo,useLayoutEffect} from 'react';
import {Plus,RefreshCw,Save,ArrowLeft,Clapperboard,RotateCcw,Trash2} from 'lucide-react';
import {DeleteConfirm} from './DeleteConfirm.jsx';
import {Dialog} from './GlobalTools.jsx';
import {GenerationComposer,GenerationResults} from './GenerationComposer.jsx';
import {referenceName,refreshAssetReferences,isProjectGenerationReference,mediaSource} from '../../core/generationReferences.js';
import {cleanStoryboardReferenceValue} from '../../core/storyboardReferences.js';
import {parseDirectorScenesReadonly,inferDirectorEpisodeNumber} from '../../core/scriptImport.js';
import {normalizeStoryboardEpisodes} from '../../core/storyboardIdentity.js';
import {projectReferenceCandidates, removeGenerationReference, generationReferenceKey} from '../../core/automaticReferences.js';

function ResourcePicker({api,projectId,assets,media,selected,onClose,onSelect,onUpload,onRefresh,initialTab}) {
 const [tab,setTab]=useState(initialTab==='audio'||initialTab==='video'?initialTab:'character'),[query,setQuery]=useState(''),[picked,setPicked]=useState(selected),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const categories=[['character','角色'],['prop','物品'],['scene','场景'],['image','参考图'],['audio','音频'],['video','视频']];
 const assetRows=assets.flatMap(a=>(a.images?.length?a.images:(a.image_url?[{id:a.id,url:a.image_url}]:[])).filter(i=>i.url).map(i=>({id:i.id,imageId:i.id===a.id?'legacy':i.id,projectId,assetId:a.id,url:i.url,kind:'image',name:a.name,displayName:displayAssetName(a,assets),nameAliases:a.nameAliases,filename:i.filename,category:a.category})));
 const rows=['character','prop','scene'].includes(tab)?assetRows.filter(a=>a.category===tab):media.filter(m=>m.kind===tab).map(m=>({...m,name:m.filename||m.note||'参考素材'}));
 const shown=rows.filter(r=>[r.name,r.displayName].filter(Boolean).some(name=>name.toLowerCase().includes(query.toLowerCase())));
 const upload=async()=>{setBusy(true);setError('');try{const item=await onUpload(tab);if(item)setPicked(current=>[...current,item]);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Dialog open title="选择项目参考素材" onClose={onClose}><div className="generation-resource-tabs">{categories.map(([k,n])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{n}</button>)}<button onClick={onRefresh}><RefreshCw size={14}/>刷新图片</button></div><input aria-label="搜索资源名称" placeholder="搜索资源名称" value={query} onChange={e=>setQuery(e.target.value)}/><div className="generation-resource-grid"><button onClick={upload} disabled={busy}><Plus/><span>{busy?'上传中…':'上传本地素材'}</span></button>{shown.map(r=><button key={r.id} className={picked.some(p=>p.id===r.id)?'selected':''} onClick={()=>setPicked(current=>current.some(p=>p.id===r.id)?current.filter(p=>p.id!==r.id):[...current,r])}>{r.kind==='image'?<CloudAssetImage api={api} projectId={projectId} assetId={r.assetId} image={{...r,id:r.imageId||r.id}} alt={r.name} />:r.kind==='video'?<video src={r.url} preload="none"/>:<span>♫ 音频</span>}<small>{r.displayName||r.name}</small></button>)}</div>{error&&<p className="collab-error">{error}</p>}<footer className="generation-resource-tabs"><span>已选择 {picked.length} 项</span><button onClick={onClose}>取消</button><button className="primary" onClick={()=>onSelect(picked)}>确认引用</button></footer></Dialog>;
}

function Shot({shot,episode,epNumber,scene,project,assets,media,api,state,canEdit,refresh,loadMedia,tasks,onDelete,onProjectChange,promptBinding,accountId,defaults}) {
 const storageKey=`xz-shot-draft:${project.id}:${shot.id}`;
 const read=()=>{try{const queued=readQueuedDraft(storageKey);return queued.found?queued.value:JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}};
 const sceneReferences=()=>projectReferenceCandidates(assets,media,project.id,epNumber,scene).filter(r=>r.assetAdopted!==false).map(r=>r.assetId?{...r,autoAssetImage:true}:r);
 const cleanDraft=entry=>{
  const cleaned=applyStoryboardDefaults(cleanStoryboardReferenceValue(entry.value,project.id),defaults);
  const linked=storyboardPromptValue(promptBinding,shot,cleaned,accountId);
  const value=linked||cleaned;
  const needsSave=linked?.referenceBindingMode==='confirmed'&&(JSON.stringify(value.references)!==JSON.stringify(shot.generationConfig?.references||[])||value.bindingCompiledPrompt!==shot.generationConfig?.bindingCompiledPrompt);
  return {...entry,value,dirty:entry.dirty||cleaned!==entry.value||needsSave};
 };
 const cloudDraft=()=>cleanDraft({value:{...shot.generationConfig,prompt:shot.content||'',references:shot.generationConfig?.references||sceneReferences()},base:{content:shot.content,generationConfig:shot.generationConfig},dirty:false});
 const initial=()=>{const stored=read();if(!stored)return cloudDraft();const value=applyStoryboardDefaults(stored.value,defaults),next=value===stored.value?stored:{...stored,value,dirty:true};return canRefreshStoryboardBinding(next,shot)?cleanDraft(next):next;};
 const [draft,setDraft]=useState(initial),[picker,setPicker]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[noticeTarget,setNoticeTarget]=useState(null);
 const current=useRef(draft);current.current=draft;
 useEffect(()=>{const old=current.current,value=applyStoryboardDefaults(old.value,defaults);let next=value===old.value?old:{...old,value,dirty:true};if(!next.dirty)next=cloudDraft();else if(canRefreshStoryboardBinding(next,shot))next=cleanDraft(next);current.current=next;setDraft(next);if(value!==old.value||next.value.storyboardDefaultsRevision&&next.dirty)queueDraft(storageKey,next);},[shot,assets,media,scene,epNumber,promptBinding,defaults]);
 const change=value=>{
  value=cleanStoryboardReferenceValue(value,project.id);
  const previous=current.current.value;
  for(const ref of previous.references||[])if(!(value.references||[]).some(r=>generationReferenceKey(r)===generationReferenceKey(ref))&&!(ref.autoAssetImage&&value.references?.some(n=>n.autoAssetImage&&n.assetId===ref.assetId))) {
   const removed=removeGenerationReference(previous,generationReferenceKey(ref));
   value={...value,autoReferenceExclusions:[...new Set([...(value.autoReferenceExclusions||[]),...removed.autoReferenceExclusions])]};
  }
  value=rememberStoryboardRemoval(previous,value);
  const next={...current.current,value,dirty:true};current.current=next;setDraft(next);queueDraft(storageKey,next);
 };
 const referenceCandidates=useMemo(()=>draft.value.referenceBindingMode?[]:projectReferenceCandidates(assets,media,project.id,epNumber,scene),[assets,media,project.id,epNumber,scene,draft.value.referenceBindingMode]);
 const baseline=storyboardRecoveryBaseline(shot,draft.value,sceneReferences(),storyboardPromptValue(promptBinding,shot,{...draft.value,prompt:shot.content||'',references:shot.generationConfig?.references||sceneReferences()},accountId));
 const removedReferences=missingStoryboardReferences(draft.value,baseline);
 const restore=keys=>change(restoreStoryboardReferences(current.current.value,baseline,keys));
 const cloudChanged=draft.dirty&&(shot.content!==draft.base.content||stableStoryboardConfig(shot.generationConfig)!==stableStoryboardConfig(draft.base.generationConfig));
 const resolveRefs=refs=>refreshAssetReferences(refs,assets,project.id).map(ref=>{
  const asset=assets.find(a=>a.id===ref.assetId),image=asset?.images?.find(i=>i.id===ref.id),file=media.find(m=>m.id===ref.id);
  return image?{...ref,url:image.url}:file?{...ref,url:file.url}:ref;
 });
 const save=async()=>{
  if(!canEdit)return;setSaving(true);setError('');
  const savingDraft=current.current;
  try{const {content,generationConfig}=storyboardSaveUpdates(savingDraft.value);
   const saved=await api.collabPatchStoryboard({projectId:project.id,episodeId:episode.id,promptEditionId:episode.promptEditionId||'legacy',shotId:shot.id,base:savingDraft.base,updates:{content,generationConfig}});
   onProjectChange(saved);
   // Do not clear edits typed while the request was in flight.
   const acknowledged=(saved.episodes||[]).flatMap(e=>e.prompts||[]).find(p=>p.id===shot.id),savedBase=acknowledged?{content:acknowledged.content,generationConfig:acknowledged.generationConfig}:{content,generationConfig};
   if(current.current===savingDraft){const next={...savingDraft,base:savedBase,dirty:false};current.current=next;setDraft(next);queueDraft(storageKey,null);}
   else if(current.current.base===savingDraft.base){const next={...current.current,base:savedBase,dirty:true};current.current=next;setDraft(next);queueDraft(storageKey,next);}
   return true;
  }catch(e){const message=String(e.message).replace(/^Error invoking remote method '[^']+': Error: /,'');let refreshed=false;if(/协作者修改|分镜已变更|提示词版本已切换/.test(message)&&api.collabGetProject){try{onProjectChange(await api.collabGetProject({projectId:project.id}));refreshed=true;}catch{}}setError(refreshed?'':message);return false;}finally{setSaving(false);}
 };
 const chooseUpload=async tab=>{
  const item=await api.collabUploadMedia({projectId:project.id,episode:epNumber,scene,note:`参考素材 ${shot.label}`,kind:tab});
  if(!item)return null;const all=await api.collabListMedia({projectId:project.id});await loadMedia();const found=all.find(m=>m.id===item.id);return found?{...found,name:found.filename||found.note}:null;
 };
 const cloudVideos=media.filter(m=>m.kind==='video'&&(m.note?.includes(`[shot:${shot.id}]`)||m.note===shot.label)&&m.scene===scene).map(m=>({...m,status:'success',prompt:shot.content}));
 const localTasks=tasks.filter(t=>t.projectId===project.id&&t.shotId===shot.id);
 const results=[...localTasks,...cloudVideos.filter(m=>!localTasks.some(t=>t.mediaId===m.id))];
 return <><article className="collab-shot-card" data-shot-id={shot.id}><header><b className="collab-shot-badge">{shot.label}</b><div className="storyboard-reference-actions"><button type="button" disabled={!canEdit||!baseline.references?.length} onClick={()=>restore()}><RefreshCw size={14}/>重新载入本条关联素材</button>{!!removedReferences.length&&<details><summary><RotateCcw size={14}/>恢复素材（{removedReferences.length}）</summary><div className="storyboard-reference-recovery"><button disabled={!canEdit} onClick={()=>restore()}>全部恢复</button>{removedReferences.map(ref=><button key={generationReferenceKey(ref)} disabled={!canEdit} onClick={()=>restore([generationReferenceKey(ref)])}>{ref.kind==='image'&&<img src={mediaSource(ref)} alt=""/>}{ref.name}</button>)}</div></details>}</div><div className="storyboard-save-actions"><span ref={setNoticeTarget} className="storyboard-notice-slot"/><button disabled={!canEdit||!draft.dirty||saving} onClick={save}><Save size={14}/>{saving?'保存中…':'保存分镜'}</button><button className="danger" disabled={!canEdit||saving} onClick={()=>onDelete(shot)}><Trash2 size={14}/>删除分镜</button></div></header>{cloudChanged&&<StoryboardConflict text={shot.content} disabled={!canEdit||saving} onAdopt={()=>{queueDraft(storageKey,null);const next=cloudDraft();current.current=next;setDraft(next);}} onKeep={()=>{const next={...current.current,base:{content:shot.content,generationConfig:shot.generationConfig}};current.current=next;setDraft(next);queueDraft(storageKey,next);}}/>}{shot.sourceConflict&&<StoryboardConflict title="导演提示词已有修改，请核对" text={shot.sourceConflict} disabled={!canEdit} onAdopt={()=>change({...draft.value,prompt:shot.sourceConflict})}/>}{shot.sourceRemoved&&<p className="generation-draft-note">导演已移除该提示词；此分镜及作品仍保留。</p>}<GenerationComposer api={api} state={state} referenceViewport bindingNoticeTarget={noticeTarget} timing={shot} referenceCandidates={referenceCandidates} value={{...draft.value,references:resolveRefs(draft.value.references||[])}} onChange={change} disabled={!canEdit} onPick={kind=>setPicker(kind||'image')} onSubmit={async input=>{
  if(cloudChanged)throw new Error('请先核对云端修改');
  change({...current.current.value,prompt:input.originalPrompt,references:[...(current.current.value.references||[]),...input.references.filter(r=>!(current.current.value.references||[]).some(old=>generationReferenceKey(old)===generationReferenceKey(r)))],model:input.model,profileId:input.profileId,ratio:input.ratio,duration:input.duration,resolution:input.resolution,autoReferenceOrder:input.autoReferenceOrder,autoReferenceSignature:input.autoReferenceSignature,autoReferenceExclusions:input.autoReferenceExclusions});
  if(!await save())throw new Error('分镜尚未保存，请先处理保存提示');
  const unresolved=assets.filter(a=>{const name=referenceName(a.name);return (input.originalPrompt.includes(`@${name}`)||input.originalPrompt.includes(`@【${name}】`))&&!input.references.some(r=>r.assetId===a.id);});
  if(unresolved.length)throw new Error(`以下引用尚未选择图片：${unresolved.map(a=>a.name).join('、')}`);
  await api.generationSubmit({...input,projectId:project.id,episode:epNumber,scene,shotId:shot.id,shotLabel:shot.label});window.dispatchEvent(new Event('xz-refresh-generation'));await loadMedia();
 }}></GenerationComposer>{error&&<p className="collab-error">{error}</p>}{!!results.length&&<GenerationResults tasks={results} api={api} onRefresh={async()=>{window.dispatchEvent(new Event('xz-refresh-generation'));await loadMedia();}} onDelete={canEdit?async t=>{if(!window.confirm('删除此生成结果？'))return;try{const mediaId=t.mediaId||(!t.filePath?t.id:null);if(mediaId)await api.collabDeleteMedia({projectId:project.id,mediaId});if(t.filePath)await api.generationArchive({id:t.id});await loadMedia();}catch(e){setError(e.message);}}:undefined} onReuse={t=>change({...draft.value,...t,prompt:t.originalPrompt||t.prompt,references:t.references||[]})}/>}</article>{picker&&<ResourcePicker api={api} projectId={project.id} initialTab={picker} assets={assets} media={media} selected={draft.value.references||[]} onClose={()=>setPicker(null)} onSelect={references=>{change({...draft.value,references});setPicker(null);}} onUpload={chooseUpload} onRefresh={async()=>{await refresh();await loadMedia();}}/>}</>;
}

export function StoryboardWorkbench({project,assets,api,state,refresh,canEdit,onProjectChange,accountId}) {
 const {data:promptBinding,loading:bindingLoading,error:bindingReadError}=useProjectPromptBinding({api,project,assets,accountId,localSources:state.directorProjects});
 const editionId=project.episodes?.find(e=>e.promptEditionId)?.promptEditionId||'legacy',defaultsScope=JSON.stringify([accountId,project.id,editionId]);
 const scope={accountId,projectId:project.id,editionId};
 const [defaultState,setDefaultState]=useState(()=>({scope:defaultsScope,value:readStoryboardDefaults(scope)})),[defaultForm,setDefaultForm]=useState(()=>readStoryboardDefaults(scope)?.settings||{}),[defaultsError,setDefaultsError]=useState('');
 const defaults=defaultState.scope===defaultsScope?defaultState.value:readStoryboardDefaults(scope);
 useEffect(()=>{setDefaultState({scope:defaultsScope,value:readStoryboardDefaults(scope)});setDefaultForm(readStoryboardDefaults(scope)?.settings||{});setDefaultsError('');},[defaultsScope]);
 const applyDefaults=settings=>{try{const value=saveStoryboardDefaults(scope,settings);setDefaultState({scope:defaultsScope,value});setDefaultsError('');}catch(e){setDefaultsError(e.message);}};
 const [episodeId,setEpisodeId]=useState(null),[scene,setScene]=useState(''),[media,setMedia]=useState([]),[tasks,setTasks]=useState([]),[error,setError]=useState(''),[creating,setCreating]=useState(false);
 const leftColumn=useRef(null);
 useLayoutEffect(()=>{let frame;const fit=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const node=leftColumn.current;if(node)node.style.setProperty('--storyboard-left-height',Math.max(300,innerHeight-Math.max(0,node.getBoundingClientRect().top)-16)+'px');});};fit();window.addEventListener('resize',fit);window.addEventListener('scroll',fit,true);return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',fit);window.removeEventListener('scroll',fit,true);};},[project.id,episodeId,defaultState]);

 const [deleteTarget,setDeleteTarget]=useState(null),[deleting,setDeleting]=useState(false);
 const createPending=useRef(null);
 const createLock=useRef(false);
 const episodes=useMemo(()=>normalizeStoryboardEpisodes(project.episodes).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传'),[project.episodes]);
 const episode=episodes.find(e=>e.id===episodeId);
 const epNumber=episode?inferDirectorEpisodeNumber(episode,episodes.indexOf(episode)+1):0;
 const parsed=episode?parseDirectorScenesReadonly(episode.content||'',epNumber):[];
 const labels=[...new Set((parsed.length?parsed.map(s=>s.label):(episode?.prompts||[]).map(p=>String(p.label||'').split('-').slice(0,2).join('-'))).filter(label=>label.startsWith(epNumber+'-')&&/^\d+-\d+$/.test(label)))];
 if(!labels.length)labels.push(`${epNumber}-1`);
 const currentScene=labels.includes(scene)?scene:labels[0];
 const prompts=(episode?.prompts||[]).filter(p=>p.label===currentScene||p.label?.startsWith(currentScene+'-'));
 const selectEpisode=id=>{setEpisodeId(id);setScene('');setError('');};
 const request=useRef(0);
 const loadMedia=async()=>{const ticket=++request.current;try{const [m,t]=await Promise.all([api.collabListMedia({projectId:project.id}),api.generationList()]);if(ticket===request.current){setMedia((m||[]).filter(ref=>isProjectGenerationReference(ref,project.id)));setTasks(t||[]);}}catch(e){setError(e.message||'素材读取失败，请重试');}};
 useEffect(()=>{const nav=readCollabNavigation({accountId,projectId:project.id,section:'storyboard'}),target=episodes.find((e,i)=>inferDirectorEpisodeNumber(e,i+1)===Number(nav.episodeNumber));setEpisodeId(target?.id||null);setScene(target?nav.sceneId||'':'');loadMedia();const timer=setInterval(loadMedia,8000);return()=>{request.current++;clearInterval(timer);};},[project.id]);
 useEffect(()=>{if(episode)rememberCollabNavigation({accountId,projectId:project.id,section:'storyboard'},{episodeNumber:epNumber,sceneId:currentScene});},[accountId,project.id,epNumber,currentScene,episode?.id]);
 const openedShot=useRef('');
 useEffect(()=>{if(bindingLoading||!episode)return;const nav=readCollabNavigation({accountId,projectId:project.id,section:'storyboard'});if(!nav.shotId||openedShot.current===nav.shotId)return;const frame=requestAnimationFrame(()=>{const el=[...document.querySelectorAll('.collab-shot-card')].find(e=>e.dataset.shotId===nav.shotId);if(el){openedShot.current=nav.shotId;el.scrollIntoView({block:'start'});}});return()=>cancelAnimationFrame(frame);},[bindingLoading,episode?.id,currentScene,accountId,project.id]);
 const create=async()=>{
  if(createLock.current||!canEdit||!episode)return;
  createLock.current=true;
  setCreating(true);setError('');
  try{
   const key=episode.id+':'+(episode.promptEditionId||'legacy')+':'+currentScene;
   if(createPending.current?.key!==key)createPending.current={key,shotId:crypto.randomUUID()};
   const saved=await api.collabPatchStoryboard({projectId:project.id,episodeId:episode.id,promptEditionId:episode.promptEditionId||'legacy',operation:'create',shotId:createPending.current.shotId,scene:currentScene});
   onProjectChange(saved);createPending.current=null;
  }catch(e){setError(e.message||'创建分镜失败，请重试');}finally{createLock.current=false;setCreating(false);}
 };
 if(!episode)return <section className="collab-episode-overview">
  <header className="collab-storyboard-heading"><div><Clapperboard size={21}/><h2>分镜工作台</h2></div><span>共 {episodes.length} 集 · 选择分集继续创作</span></header>
  {error&&<p role="alert" className="collab-error">{error}</p>}
  <div className="collab-episode-grid">{episodes.map(ep=><button className="collab-episode-card" key={ep.id} onClick={()=>selectEpisode(ep.id)}><b>{ep.title}</b><small>{ep.content?.slice(0,70)}</small><span>{ep.prompts?.length||0} 条分镜</span></button>)}</div>
  {!episodes.length&&<p className="generation-empty">当前项目尚无分集，请在导演工作台完善项目后，点击左下角刷新云端数据。</p>}
 </section>;
 return <><GenerationComposer settingsOnly api={api} state={state} value={defaultForm} onChange={setDefaultForm} disabled={!canEdit} onApplySettings={applyDefaults}/>{defaultsError&&<p className="collab-error" role="alert">{defaultsError}</p>}<div className="collab-storyboard">
  <aside ref={leftColumn} className="collab-sb-left">
   <nav className="collab-sb-navigation" aria-label="分镜导航">
    <button className="collab-sb-back" onClick={()=>selectEpisode(null)}><ArrowLeft size={16}/>返回分集</button>
    <div className="collab-sb-ep-switch">
     <label>集数<div className="storyboard-scope-row"><select aria-label="选择集数" value={episodeId} onChange={e=>selectEpisode(e.target.value)}>{episodes.map(ep=><option key={ep.id} value={ep.id}>{ep.title}</option>)}</select><span>{labels.length}场景</span></div></label>
     <label>场景<div className="storyboard-scope-row"><select aria-label="选择场景" value={currentScene} onChange={e=>setScene(e.target.value)}>{labels.map(label=><option key={label} value={label}>{label}</option>)}</select><span>{prompts.length}分镜</span></div></label>
    </div>
   </nav>
   <textarea aria-label="当前场景剧本" className="collab-sb-script" readOnly value={parsed.find(s=>s.label===currentScene)?.content||episode.content||''}/>
  </aside>
  <section className="collab-sb-mid collab-sb-prompt-stack">

   {error&&<p role="alert" className="collab-error">{error}</p>}{bindingReadError&&<p role="alert" className="collab-error">关联刷新未完成：{bindingReadError}</p>}
   {bindingLoading?<p role="status">正在读取提示词关联素材…</p>:prompts.map(p=><Shot key={`${project.id}:${episode.promptEditionId||'legacy'}:${p.id}`} shot={p} episode={episode} epNumber={epNumber} scene={currentScene} project={project} assets={assets} media={media} api={api} state={state} canEdit={canEdit} refresh={refresh} loadMedia={loadMedia} tasks={tasks} promptBinding={promptBinding} accountId={accountId} defaults={defaults} onDelete={setDeleteTarget} onProjectChange={onProjectChange}/>)}
   {<button className="collab-create-storyboard" onClick={create} disabled={!canEdit||creating}><Plus size={20}/>{creating?'创建中…':'创建分镜'}</button>}
  </section>
  <DeleteConfirm open={Boolean(deleteTarget)} title="删除分镜" name={deleteTarget?.label} detail={deleting?'正在删除…':'确认删除这条分镜？生成的视频与素材会保留，导演工作台原提示词不会删除。'} onCancel={()=>!deleting&&setDeleteTarget(null)} onConfirm={async()=>{
   if(deleting)return;setDeleting(true);setError('');
   try{const saved=await api.collabPatchStoryboard({projectId:project.id,episodeId:episode.id,promptEditionId:episode.promptEditionId||'legacy',operation:'delete',shotId:deleteTarget.id,base:{content:deleteTarget.content,generationConfig:deleteTarget.generationConfig}});onProjectChange(saved);localStorage.removeItem(`xz-shot-draft:${project.id}:${deleteTarget.id}`);setDeleteTarget(null);}catch(e){setError(e.message);setDeleteTarget(null);}finally{setDeleting(false);}
  }}/>
 </div></>;
}

function stableStoryboardConfig(value){if(value==null)return 'null';const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,normalize(v[k])])):v;return JSON.stringify(normalize(value));}

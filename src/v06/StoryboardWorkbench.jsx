import React,{useState,useEffect,useRef,useMemo} from 'react';
import {Plus,RefreshCw,Save,ArrowLeft,Clapperboard} from 'lucide-react';
import {Dialog} from './GlobalTools.jsx';
import {GenerationComposer,GenerationResults} from './GenerationComposer.jsx';
import {autoReferences,referenceName} from '../../core/generationReferences.js';
import {parseDirectorScenesReadonly,inferDirectorEpisodeNumber} from '../../core/scriptImport.js';
import {normalizeStoryboardEpisodes} from '../../core/storyboardIdentity.js';

function ResourcePicker({assets,media,selected,onClose,onSelect,onUpload,onRefresh,initialTab}) {
 const [tab,setTab]=useState(initialTab==='audio'||initialTab==='video'?initialTab:'character'),[query,setQuery]=useState(''),[picked,setPicked]=useState(selected),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const categories=[['character','角色'],['prop','物品'],['scene','场景'],['image','参考图'],['audio','音频'],['video','视频']];
 const assetRows=assets.flatMap(a=>(a.images?.length?a.images:(a.image_url?[{id:a.id,url:a.image_url}]:[])).filter(i=>i.url).map(i=>({id:i.id,assetId:a.id,url:i.url,kind:'image',name:a.name,filename:i.filename,category:a.category})));
 const rows=['character','prop','scene'].includes(tab)?assetRows.filter(a=>a.category===tab):media.filter(m=>m.kind===tab).map(m=>({...m,name:m.filename||m.note||'参考素材'}));
 const shown=rows.filter(r=>r.name.toLowerCase().includes(query.toLowerCase()));
 const upload=async()=>{setBusy(true);setError('');try{const item=await onUpload(tab);if(item)setPicked(current=>[...current,item]);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Dialog open title="选择项目参考素材" onClose={onClose}><div className="generation-resource-tabs">{categories.map(([k,n])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{n}</button>)}<button onClick={onRefresh}><RefreshCw size={14}/>刷新图片</button></div><input aria-label="搜索资源名称" placeholder="搜索资源名称" value={query} onChange={e=>setQuery(e.target.value)}/><div className="generation-resource-grid"><button onClick={upload} disabled={busy}><Plus/><span>{busy?'上传中…':'上传本地素材'}</span></button>{shown.map(r=><button key={r.id} className={picked.some(p=>p.id===r.id)?'selected':''} onClick={()=>setPicked(current=>current.some(p=>p.id===r.id)?current.filter(p=>p.id!==r.id):[...current,r])}>{r.kind==='image'?<img src={r.url} alt={r.name}/>:r.kind==='video'?<video src={r.url} preload="metadata"/>:<span>♫ 音频</span>}<small>{r.name}</small></button>)}</div>{error&&<p className="collab-error">{error}</p>}<footer className="generation-resource-tabs"><span>已选择 {picked.length} 项</span><button onClick={onClose}>取消</button><button className="primary" onClick={()=>onSelect(picked)}>确认引用</button></footer></Dialog>;
}

function Shot({shot,episode,epNumber,scene,project,assets,media,api,state,canEdit,refresh,loadMedia,tasks,onCreate,creating}) {
 const storageKey=`xz-shot-draft:${project.id}:${shot.id}`;
 const read=()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}};
 const initial=()=>read()||{value:{...shot.generationConfig,prompt:shot.content||'',references:shot.generationConfig?.references||autoReferences(shot.content||'',assets)},base:{content:shot.content,generationConfig:shot.generationConfig},dirty:false};
 const [draft,setDraft]=useState(initial),[picker,setPicker]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const current=useRef(draft);current.current=draft;
 useEffect(()=>{if(!current.current.dirty)setDraft({value:{...shot.generationConfig,prompt:shot.content||'',references:shot.generationConfig?.references||autoReferences(shot.content||'',assets)},base:{content:shot.content,generationConfig:shot.generationConfig},dirty:false});},[shot,assets]);
 const change=value=>{const next={...current.current,value,dirty:true};current.current=next;setDraft(next);localStorage.setItem(storageKey,JSON.stringify(next));};
 const cloudChanged=draft.dirty&&(shot.content!==draft.base.content||JSON.stringify(shot.generationConfig)!==JSON.stringify(draft.base.generationConfig));
 const resolveRefs=refs=>refs.map(ref=>{
  const asset=assets.find(a=>a.id===ref.assetId),image=asset?.images?.find(i=>i.id===ref.id),file=media.find(m=>m.id===ref.id);
  return image?{...ref,url:image.url}:file?{...ref,url:file.url}:ref;
 });
 const save=async()=>{
  if(!canEdit)return;setSaving(true);setError('');
  const savingDraft=current.current;
  try{const {prompt,...generationConfig}=savingDraft.value;
   await api.collabPatchStoryboard({projectId:project.id,episodeId:episode.id,shotId:shot.id,base:savingDraft.base,updates:{content:prompt,generationConfig}});
   // Do not clear edits typed while the request was in flight.
   if(current.current===savingDraft){const next={...savingDraft,base:{content:prompt,generationConfig},dirty:false};current.current=next;setDraft(next);localStorage.removeItem(storageKey);}
   await refresh();return true;
  }catch(e){setError(e.message);return false;}finally{setSaving(false);}
 };
 const chooseUpload=async tab=>{
  const item=await api.collabUploadMedia({projectId:project.id,episode:epNumber,scene,note:`参考素材 ${shot.label}`,kind:tab});
  if(!item)return null;const all=await api.collabListMedia({projectId:project.id});await loadMedia();const found=all.find(m=>m.id===item.id);return found?{...found,name:found.filename||found.note}:null;
 };
 const cloudVideos=media.filter(m=>m.kind==='video'&&(m.note?.includes(`[shot:${shot.id}]`)||m.note===shot.label)&&m.scene===scene).map(m=>({...m,status:'success',prompt:shot.content}));
 const localTasks=tasks.filter(t=>t.projectId===project.id&&t.shotId===shot.id);
 const results=[...localTasks,...cloudVideos.filter(m=>!localTasks.some(t=>t.mediaId===m.id))];
 return <><article className="collab-shot-card"><header><b className="collab-shot-badge">{shot.label}</b><span>{shot.manual?'手工分镜':'导演工作台提示词'}</span><button disabled={!canEdit||!draft.dirty||saving} onClick={save}><Save size={14}/>{saving?'保存中…':'保存分镜'}</button></header>{cloudChanged&&<div className="generation-conflict">云端已有新修改，本地草稿已保留。<pre>{shot.content}</pre><button onClick={()=>{localStorage.removeItem(storageKey);setDraft({value:{...shot.generationConfig,prompt:shot.content,references:shot.generationConfig?.references||autoReferences(shot.content,assets)},base:{content:shot.content,generationConfig:shot.generationConfig},dirty:false});}}>采用云端版本</button><button onClick={()=>{const next={...draft,base:{content:shot.content,generationConfig:shot.generationConfig}};setDraft(next);localStorage.setItem(storageKey,JSON.stringify(next));}}>已核对，保留我的草稿继续编辑</button></div>}{shot.sourceConflict&&<div className="generation-conflict">导演工作台也修改了此提示词，请核对：<pre>{shot.sourceConflict}</pre><button disabled={!canEdit} onClick={()=>change({...draft.value,prompt:shot.sourceConflict})}>采用导演新提示词</button></div>}{shot.sourceRemoved&&<p className="generation-draft-note">导演已移除该提示词；此分镜及作品仍保留。</p>}<GenerationComposer api={api} state={state} value={{...draft.value,references:resolveRefs(draft.value.references||[])}} onChange={change} disabled={!canEdit} onPick={kind=>setPicker(kind||'image')} onSubmit={async input=>{
  if(cloudChanged)throw new Error('请先核对云端修改');
  change({...current.current.value,model:input.model,profileId:input.profileId,ratio:input.ratio,duration:input.duration,resolution:input.resolution,references:input.references});
  if(!await save())throw new Error('分镜尚未保存，请先处理保存提示');
  const unresolved=assets.filter(a=>{const name=referenceName(a.name);return (input.originalPrompt.includes(`@${name}`)||input.originalPrompt.includes(`@【${name}】`))&&!input.references.some(r=>r.assetId===a.id);});
  if(unresolved.length)throw new Error(`以下引用尚未选择图片：${unresolved.map(a=>a.name).join('、')}`);
  await api.generationSubmit({...input,projectId:project.id,episode:epNumber,scene,shotId:shot.id,shotLabel:shot.label});window.dispatchEvent(new Event('xz-refresh-generation'));await loadMedia();
 }}>{draft.dirty&&<small className="generation-draft-note">本地草稿已保留，保存后协作者可见</small>}</GenerationComposer>{error&&<p className="collab-error">{error}</p>}<GenerationResults tasks={results} api={api} onRefresh={async()=>{window.dispatchEvent(new Event('xz-refresh-generation'));await loadMedia();}} onDelete={canEdit?async t=>{if(!window.confirm('删除此生成结果？'))return;try{const mediaId=t.mediaId||(!t.filePath?t.id:null);if(mediaId)await api.collabDeleteMedia({projectId:project.id,mediaId});if(t.filePath)await api.generationArchive({id:t.id});await loadMedia();}catch(e){setError(e.message);}}:undefined} onReuse={t=>change({...draft.value,...t,prompt:t.originalPrompt||t.prompt,references:t.references||[]})}/></article><button className="collab-create-storyboard" disabled={!canEdit||creating} onClick={onCreate}><Plus size={17}/>{creating?'创建中…':'创建分镜'}</button>{picker&&<ResourcePicker initialTab={picker} assets={assets} media={media} selected={draft.value.references||[]} onClose={()=>setPicker(null)} onSelect={references=>{change({...draft.value,references});setPicker(null);}} onUpload={chooseUpload} onRefresh={async()=>{await refresh();await loadMedia();}}/>}</>;
}

export function StoryboardWorkbench({project,assets,api,state,refresh,canEdit}) {
 const [episodeId,setEpisodeId]=useState(null),[scene,setScene]=useState(''),[media,setMedia]=useState([]),[tasks,setTasks]=useState([]),[error,setError]=useState(''),[creating,setCreating]=useState(false);
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
 const loadMedia=async()=>{const ticket=++request.current;try{const [m,t]=await Promise.all([api.collabListMedia({projectId:project.id}),api.generationList()]);if(ticket===request.current){setMedia(m||[]);setTasks(t||[]);}}catch(e){setError(e.message||'素材读取失败，请重试');}};
 useEffect(()=>{selectEpisode(null);loadMedia();const timer=setInterval(loadMedia,8000);return()=>{request.current++;clearInterval(timer);};},[project.id]);
 const create=async()=>{
  if(creating||!canEdit||!episode)return;
  setCreating(true);setError('');
  try{
   await api.collabPatchStoryboard({projectId:project.id,episodeId:episode.id,operation:'create',shotId:crypto.randomUUID(),scene:currentScene});
   await refresh();
  }catch(e){setError(e.message||'创建分镜失败，请重试');}finally{setCreating(false);}
 };
 if(!episode)return <section className="collab-episode-overview">
  <header className="collab-storyboard-heading"><div><Clapperboard size={21}/><h2>分镜工作台</h2></div><span>共 {episodes.length} 集 · 选择分集继续创作</span></header>
  {error&&<p role="alert" className="collab-error">{error}</p>}
  <div className="collab-episode-grid">{episodes.map(ep=><button className="collab-episode-card" key={ep.id} onClick={()=>selectEpisode(ep.id)}><b>{ep.title}</b><small>{ep.content?.slice(0,70)}</small><span>{ep.prompts?.length||0} 条分镜</span></button>)}</div>
  {!episodes.length&&<p className="generation-empty">当前项目尚无分集，请在导演工作台完善项目后，点击左下角刷新云端数据。</p>}
 </section>;
 return <div className="collab-storyboard">
  <aside className="collab-sb-left">
   <nav className="collab-sb-navigation" aria-label="分镜导航">
    <button className="collab-sb-back" onClick={()=>selectEpisode(null)}><ArrowLeft size={16}/>返回分集</button>
    <div className="collab-sb-ep-switch">
     <label>集数<select aria-label="选择集数" value={episodeId} onChange={e=>selectEpisode(e.target.value)}>{episodes.map(ep=><option key={ep.id} value={ep.id}>{ep.title}</option>)}</select></label>
     <label>场景<select aria-label="选择场景" value={currentScene} onChange={e=>setScene(e.target.value)}>{labels.map(label=><option key={label} value={label}>{label}</option>)}</select></label>
    </div>
   </nav>
   <textarea aria-label="当前场景剧本" className="collab-sb-script" readOnly value={parsed.find(s=>s.label===currentScene)?.content||episode.content||''}/>
  </aside>
  <section className="collab-sb-mid collab-sb-prompt-stack">
   <div className="collab-panel-title">场景 {currentScene} · {prompts.length} 条分镜</div>
   {error&&<p role="alert" className="collab-error">{error}</p>}
   {prompts.map(p=><Shot key={`${project.id}:${p.id}`} shot={p} episode={episode} epNumber={epNumber} scene={currentScene} project={project} assets={assets} media={media} api={api} state={state} canEdit={canEdit} refresh={refresh} loadMedia={loadMedia} tasks={tasks} creating={creating} onCreate={create}/>)}
   {!prompts.length&&<button className="collab-create-storyboard" onClick={create} disabled={!canEdit||creating}><Plus size={20}/>{creating?'创建中…':'创建分镜'}</button>}
  </section>
 </div>;
}

import React,{useState} from 'react';
import {Upload,RefreshCw,Check,AudioLines,Search,Trash2} from 'lucide-react';
import {Dialog} from './GlobalTools.jsx';
import {DeleteConfirm} from './DeleteConfirm.jsx';
import CloudAssetImage from './CloudAssetImage.jsx';
import {displayAssetName} from '../../core/collabStore.js';
import {projectAudioReferences,mediaSource,isProjectGenerationReference,canDeleteUploadedReference} from '../../core/generationReferences.js';
import {generationReferenceKey} from '../../core/automaticReferences.js';
import {referenceForAssetCard,sameAssetImageSlot} from '../../core/assetImageSlot.js';
import {storyboardReferencePreviews,storyboardAssetSlots,visibleStoryboardReference} from '../../core/storyboardReferences.js';
import './ProjectResourcePicker.css';

export default function ProjectResourcePicker({api,projectId,accountId,canEdit=false,assets,media,voiceCards=[],selected,onClose,onSelect,onUpload,onRefresh,onAssetSlotEmpty,onDelete,initialTab}) {
 const [tab,setTab]=useState(['audio','video'].includes(initialTab)?initialTab:'character'),[query,setQuery]=useState(''),[picked,setPicked]=useState(()=>storyboardAssetSlots(selected,projectId)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [deleting,setDeleting]=useState(null),[removed,setRemoved]=useState([]);
 const categories=[['character','角色'],['prop','物品'],['scene','场景'],['image','参考图'],['audio','音频'],['video','视频']];
 const assetRows=storyboardReferencePreviews(assets.map(a=>referenceForAssetCard({...a,displayName:displayAssetName(a,assets)},projectId)).filter(r=>r.assetImageSlot),assets,null,projectId).filter(visibleStoryboardReference);
 const readyAssets=new Set(assetRows.map(r=>r.assetId));
 const selectedCount=picked.filter(r=>!r.assetImageSlot||readyAssets.has(r.assetId)).length;
 const protectedReferences=[...assets.flatMap(a=>a.images?.length?a.images:[{url:a.image_url}]),...voiceCards.filter(card=>!card.pendingAudio).map(card=>card.reference)];
 const canRemove=ref=>canDeleteUploadedReference(ref,{projectId,accountId,canEdit,protectedReferences});
 const rows=['character','prop','scene'].includes(tab)?assetRows.filter(a=>a.category===tab):tab==='audio'?projectAudioReferences(media,voiceCards,projectId):media.filter(m=>m.kind===tab&&isProjectGenerationReference(m,projectId)).map(m=>({...m,name:m.filename||m.note||'参考素材'}));
 const shown=rows.filter(r=>!removed.includes(generationReferenceKey(r))&&[r.name,r.displayName,r.characterName].filter(Boolean).some(name=>name.toLowerCase().includes(query.trim().toLowerCase())));
 const matches=(p,r)=>sameAssetImageSlot(p,r)||generationReferenceKey(p)===generationReferenceKey(r);
 const has=r=>picked.some(p=>matches(p,r));
 const toggle=r=>setPicked(current=>current.some(p=>matches(p,r))?current.filter(p=>!matches(p,r)):[...current,r]);
 const run=async action=>{setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const upload=()=>run(async()=>{const item=await onUpload(tab);if(item)setPicked(current=>current.some(p=>generationReferenceKey(p)===generationReferenceKey(item))?current:[...current,item]);});
 const remove=()=>run(async()=>{
  if(!deleting||!onDelete||!canRemove(deleting))throw Error('当前素材不可在此删除');
  const result=await onDelete(deleting),key=generationReferenceKey(deleting);
  setRemoved(current=>[...current,key]);setPicked(current=>current.filter(ref=>generationReferenceKey(ref)!==key));setDeleting(null);
  if(result?.cleanupWarning)setError(result.cleanupWarning);
 });
 return <><Dialog open className="project-resource-picker" title="选择项目参考素材" onClose={()=>{if(!busy&&!deleting)onClose();}}>
  <div className="resource-picker-categories" role="group" aria-label="素材分类">{categories.map(([k,n])=><button type="button" key={k} aria-pressed={tab===k} onClick={()=>setTab(k)}>{n}</button>)}</div>
  <div className="resource-picker-toolbar"><label className="resource-picker-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="搜索资源名称" placeholder="搜索资源名称" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" className="resource-picker-refresh" aria-label="刷新素材" title="刷新素材" disabled={busy} onClick={()=>run(onRefresh)}><RefreshCw size={17}/></button><button type="button" className="resource-picker-upload" disabled={busy} onClick={upload}><Upload size={17}/>{busy?'处理中…':'上传本地素材'}</button></div>
  <div className={`resource-picker-content${tab==='audio'?' resource-picker-audio':' resource-picker-grid'}`} aria-label="可选参考素材">
   {shown.map(r=><div key={generationReferenceKey(r)} className={`resource-picker-item${has(r)?' selected':''}`}>
    <button type="button" className="resource-picker-select" aria-pressed={has(r)} aria-label={`选择${r.displayName||r.name}`} onClick={()=>toggle(r)}>
     {r.kind==='image'?<CloudAssetImage api={api} projectId={projectId} assetId={r.assetId} image={{...r,id:r.imageId||r.id}} onAssetSlotEmpty={onAssetSlotEmpty} alt=""/>:r.kind==='video'?<video src={mediaSource(r)} preload="none"/>:<span className="resource-picker-audio-icon"><AudioLines size={22}/></span>}
     <span className="resource-picker-name" title={r.displayName||r.name}>{r.displayName||r.name}{r.adoptedVoice&&<small>已采用音色</small>}</span><span className="resource-picker-check" aria-hidden="true">{has(r)&&<Check size={14}/>}</span>
    </button>
    {onDelete&&canRemove(r)&&<button type="button" className="resource-picker-delete" aria-label={`删除${r.displayName||r.name}`} title="删除上传素材" disabled={busy} onClick={()=>{setError('');setDeleting(r);}}><Trash2 size={16}/></button>}
    {r.kind==='audio'&&<audio controls preload="none" aria-label={`试听${r.name}`} src={mediaSource(r)}/>}
   </div>)}
   {!shown.length&&<p className="resource-picker-empty">{query?'没有匹配的素材':'暂无素材'}</p>}
  </div>
  {error&&<p role="alert" className="collab-error">{error}</p>}
  <footer className="resource-picker-footer"><span aria-live="polite">已选择 <b>{selectedCount}</b> 项</span><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy} onClick={()=>onSelect(picked)}>确认引用</button></footer>
 </Dialog><DeleteConfirm open={Boolean(deleting)} title="删除上传素材" name={deleting?.displayName||deleting?.name} detail="将从项目中永久删除此上传素材，并移除当前分镜引用，无法恢复。取消素材选择也不会撤销删除；本机原文件保留。" busy={busy} error={error} onCancel={()=>{if(!busy){setDeleting(null);setError('');}}} onConfirm={remove}/></>;
}

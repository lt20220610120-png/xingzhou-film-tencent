import {useWorkspacePolling} from './useWorkspacePolling.js';
import {promptMaterialRow} from '../../core/promptMaterialStatus.js';
import StoryboardMaterialHint from './StoryboardMaterialHint.jsx';
import './prompt-material-overview.css';
import {recommendedPromptDuration} from '../../core/promptDisplay.js';
import {alignStoryboardDuration,savedStoryboardTiming,storyboardEstimateIssue,storyboardRecommendationLimit,storyboardTimingForDraft} from '../../core/storyboardTiming.js';
import {estimateVideoDurations,normalizeVideoDurationLimit} from '../../core/videoDurationEstimator.js';
import {requestVideoDurationText} from '../../core/videoDurationRequest.js';
import {readRemembered} from '../useRememberedState.js';
import {confirmAction} from '../components/workspace-dialog.js';
import StoryboardBatchPanel from './StoryboardBatchPanel.jsx';
import {videoExportId} from '../../core/projectVideoPool.js';
import {storyboardShots} from '../../core/storyboardPublication.js';
import {readStoryboardDefaults,applyStoryboardDefaults,rebaseStoryboardDefaultsDraft,rebaseLocalStoryboardDraft,storyboardDraftKey,hasUnsavedStoryboardTimingEdit} from '../../core/storyboardDefaults.js';
import {missingStoryboardReferences,restoreStoryboardReferences,rememberStoryboardRemoval,storyboardRecoveryBaseline} from '../../core/storyboardReferenceRecovery.js';
import './StoryboardWorkbench.css';
import {readCollabNavigation,rememberCollabNavigation} from '../../core/collabNavigation.js';
import useProjectPromptBinding from './useProjectPromptBinding.js';
import {storyboardPromptValue,storyboardSaveUpdates,canRefreshStoryboardBinding} from '../../core/promptAssetUsage.js';
import {FormattedText,FormattedEditor} from '../components/FormattedText.jsx';
import {queueDraft,readQueuedDraft} from '../editing.js';
import ResourcePicker from './ProjectResourcePicker.jsx';
import {notifyBindingSaved} from './useScenePromptLinks.js';
import React,{useState,useEffect,useRef,useMemo,useLayoutEffect} from 'react';
import {Plus,RefreshCw,Save,ArrowLeft,Clapperboard,RotateCcw,Trash2,SlidersHorizontal,ChevronDown} from 'lucide-react';
import {DeleteConfirm} from './DeleteConfirm.jsx';
import {GenerationComposer,GenerationResults} from './GenerationComposer.jsx';
import {referenceName,isProjectGenerationReference,mediaSource,normalizeGenerationReferences} from '../../core/generationReferences.js';
import {assetSkipsReferenceImage} from '../../core/assetReferencePolicy.js';
import {cleanStoryboardReferenceValue,storyboardReferencePreviews,visibleStoryboardReference} from '../../core/storyboardReferences.js';
import {storyboardSceneReferences,importStoryboardSceneReferences} from '../../core/storyboardSceneReferences.js';
import {parseDirectorScenesReadonly,inferDirectorEpisodeNumber} from '../../core/scriptImport.js';
import {normalizeStoryboardEpisodes} from '../../core/storyboardIdentity.js';
import {projectReferenceCandidates, removeGenerationReference, generationReferenceKey} from '../../core/automaticReferences.js';

function readStoryboardDraft(key){
 try{const stored=readQueuedDraft(key);return stored.found?stored.value:JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
}

function GenerationWorkbenchTools({scopeKey,settings,progress,children}){
 const key='xz-generation-tools:'+scopeKey;
 const read=()=>{try{return localStorage.getItem(key)!=='closed';}catch{return true;}};
 const [saved,setSaved]=useState(()=>({key,open:read()}));
 const open=saved.key===key?saved.open:read();
 const toggle=()=>{const next=!open;setSaved({key,open:next});try{localStorage.setItem(key,next?'open':'closed');}catch{}};
 return <section className="storyboard-generation-tools" aria-label="生成设置"><button type="button" className="storyboard-tools-toggle" aria-expanded={open} aria-controls="storyboard-generation-tools-content" onClick={toggle}><span className="storyboard-tools-title"><i><SlidersHorizontal size={16}/></i>生成设置</span>{!open&&<span className="storyboard-tools-summary">{settings?.model?`${settings.model} · ${settings.duration} 秒默认`:'展开配置默认参数'}</span>}{progress&&<span className="storyboard-tools-progress">{progress.running?'批量处理中':'批量进度'} {progress.percent}%</span>}<ChevronDown size={16} className={open?'expanded':''}/></button><div id="storyboard-generation-tools-content" className="storyboard-tools-content" hidden={!open}>{children}</div></section>;
}

export function Shot({shot,episode,epNumber,scene,project,assets,media,api,state,canEdit,refresh,loadMedia,tasks,onDelete,onProjectChange,promptBinding,accountId,defaults,bindingLoading=false,bindingReadError='',onOpenReview,captureReferenceScroll}) {
 const materialEntry=promptBinding?.snapshot?.entries?.find(e=>e.id===(shot.sourcePromptId||shot.id)||e.label===shot.label&&e.prompt===(shot.sourceContent||shot.content));
 const material=materialEntry&&promptMaterialRow(promptBinding,materialEntry);
 const storageKey=storyboardDraftKey(project.id,shot,accountId);
 const editable=value=>({...value,referenceBindingMode:'storyboard',bindingIssue:'',storyboardPublicationId:shot.storyboardPublicationId||''});
 const baseFor=row=>({content:row.content,generationConfig:row.generationConfig,durationEstimate:row.durationEstimate});
 const read=()=>readStoryboardDraft(storageKey);
 const sceneReferences=()=>projectReferenceCandidates(assets,media,project.id,epNumber,scene,{assetImageSlots:true,includeEmptyAssetSlots:true});
 const cleanDraft=entry=>{
  const cleaned=applyStoryboardDefaults(cleanStoryboardReferenceValue(entry.value,project.id),defaults,shot.id);
  const linked=storyboardPromptValue(promptBinding,shot,cleaned,accountId);
  const value=editable(linked?.referenceBindingMode==='pending'&&!linked.references?.length&&cleaned.references?.length?cleaned:linked||cleaned);
  const needsSave=linked&&(JSON.stringify(value.references)!==JSON.stringify(shot.generationConfig?.references||[])||value.bindingCompiledPrompt!==shot.generationConfig?.bindingCompiledPrompt||value.prompt!==shot.content);
  return {...entry,value,dirty:entry.dirty||cleaned!==entry.value||needsSave};
 };
 const cloudDraft=()=>cleanDraft({value:{...shot.generationConfig,prompt:shot.content||'',references:shot.generationConfig?.references||sceneReferences()},base:baseFor(shot),dirty:false});
 const initial=()=>{const saved=read();if(!saved)return cloudDraft();const stored=rebaseLocalStoryboardDraft(rebaseStoryboardDefaultsDraft(saved,shot,defaults),shot,project);const value=applyStoryboardDefaults(cleanStoryboardReferenceValue(stored.value,project.id),defaults,shot.id),next=value===stored.value?stored:{...stored,value,dirty:true};return canRefreshStoryboardBinding(next,shot)?cleanDraft(next):{...next,value:editable(next.value)};};
 const [draft,setDraft]=useState(initial),[picker,setPicker]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[noticeTarget,setNoticeTarget]=useState(null),[estimating,setEstimating]=useState(false);
 const estimateRequest=useRef(null);
 useEffect(()=>()=>estimateRequest.current?.abort(),[]);
 const current=useRef(draft);current.current=draft;
 const restoreReferenceScroll=useRef(null);
 useLayoutEffect(()=>{
  restoreReferenceScroll.current?.();
  restoreReferenceScroll.current=null;
 },[draft]);
 useEffect(()=>{const old=rebaseLocalStoryboardDraft(rebaseStoryboardDefaultsDraft(current.current,shot,defaults),shot,project),value=applyStoryboardDefaults(old.value,defaults,shot.id);let next=value===old.value?old:{...old,value,dirty:true};if(!next.dirty)next=cloudDraft();else if(canRefreshStoryboardBinding(next,shot))next=cleanDraft(next);current.current=next;setDraft(next);if(value!==old.value||next.value.storyboardDefaultsRevision&&next.dirty)queueDraft(storageKey,next);},[shot,assets,media,scene,epNumber,promptBinding,defaults]);
 const change=value=>{
  value=editable(cleanStoryboardReferenceValue(value,project.id));
  const previous=current.current.value;
  for(const ref of previous.references||[])if(!(value.references||[]).some(r=>generationReferenceKey(r)===generationReferenceKey(ref))&&!(ref.autoAssetImage&&value.references?.some(n=>n.autoAssetImage&&n.assetId===ref.assetId))) {
   const removed=removeGenerationReference(previous,generationReferenceKey(ref));
   value={...value,autoReferenceExclusions:[...new Set([...(value.autoReferenceExclusions||[]),...removed.autoReferenceExclusions])]};
  }
  value=rememberStoryboardRemoval(previous,value);
  const before=previous.references||[], after=value.references||[];
  if(before.length!==after.length||before.some((ref,index)=>generationReferenceKey(ref)!==generationReferenceKey(after[index]))){
   restoreReferenceScroll.current??=captureReferenceScroll?.();
  }
  const next={...current.current,value,dirty:true};current.current=next;setDraft(next);queueDraft(storageKey,next);
 };
 const referenceCandidates=useMemo(()=>draft.value.referenceBindingMode?[]:projectReferenceCandidates(assets,media,project.id,epNumber,scene,{assetImageSlots:true}),[assets,media,project.id,epNumber,scene,draft.value.referenceBindingMode]);
 const baseline=cleanStoryboardReferenceValue(storyboardRecoveryBaseline(shot,draft.value,sceneReferences(),storyboardPromptValue(promptBinding,shot,{...draft.value,prompt:shot.content||'',references:shot.generationConfig?.references||sceneReferences()},accountId)),project.id);
 const removedReferences=storyboardReferencePreviews(missingStoryboardReferences(draft.value,baseline),assets,media,project.id).filter(visibleStoryboardReference);
 const restore=keys=>change(restoreStoryboardReferences(current.current.value,baseline,keys));
 const [sceneImportNotice,setSceneImportNotice]=useState('');
 let sceneImportRefs=[],sceneImportError='';
 try{sceneImportRefs=storyboardSceneReferences({assets,media,binding:promptBinding,shot,projectId:project.id,episode:epNumber,scene});}catch(e){sceneImportError=e.message;}
 const importScene=()=>{
  if(!canEdit||saving||bindingLoading||bindingReadError||sceneImportError||!sceneImportRefs.length)return;
  const previous=current.current.value,next=importStoryboardSceneReferences(previous,sceneImportRefs,scene);
  change(next);setSceneImportNotice(next.references.length>previous.references.length?`已补入 ${next.references.length-previous.references.length} 项场景素材`:'本场景素材已全部加入');
 };
 const referencePreviews=storyboardReferencePreviews(draft.value.references||[],assets,media,project.id);
 const readyReferenceCount=referencePreviews.filter(visibleStoryboardReference).length;
 const audioNeedsShare=project.storageMode!=='local'&&referencePreviews.some(ref=>ref.kind==='audio'&&ref.filePath&&!ref.mediaId);
 const refreshAssets=()=>{void Promise.resolve(refresh?.({assetsOnly:true})).catch(()=>{});};
 const save=async({estimate}={})=>{
  if(!canEdit)return;setSaving(true);setError('');
  const savingDraft=current.current;
  try{const savedValue=cleanStoryboardReferenceValue(savingDraft.value,project.id),{content,generationConfig}=storyboardSaveUpdates(savedValue);
   const saved=await api.collabPatchStoryboard({ackOnly:true,projectId:project.id,episodeId:episode.id,...(!episode.storyboardPrompts?{promptEditionId:episode.promptEditionId||'legacy'}:{}),editPolicy:'direct',storyboardPublicationId:shot.storyboardPublicationId,shotId:shot.id,base:savingDraft.base,...(estimate?{requireExactBase:true}:{}),updates:{content,generationConfig,...(estimate?{durationEstimate:estimate}:{})}});
   onProjectChange(saved);
   // Do not clear edits typed while the request was in flight.
   const acknowledged=saved.storyboardReceipt?.shot||(saved.episodes||[]).flatMap(storyboardShots).find(p=>p.id===shot.id),savedBase=acknowledged?baseFor(acknowledged):{content,generationConfig,durationEstimate:estimate||savingDraft.base.durationEstimate};
   if(current.current===savingDraft){
    const references=acknowledged?.generationConfig?.references;
    const value=references?{...savedValue,references}:savedValue;
    const next={...savingDraft,value,base:savedBase,dirty:false};current.current=next;setDraft(next);queueDraft(storageKey,null);
    if(references?.some(ref=>ref.kind==='audio'&&ref.mediaId))void loadMedia();
   }
   else if(current.current.base===savingDraft.base){const next={...current.current,base:savedBase,dirty:true};current.current=next;setDraft(next);queueDraft(storageKey,next);}
   return true;
  }catch(e){const message=String(e.message).replace(/^Error invoking remote method '[^']+': Error: /,'');let refreshed=false;if(/协作者修改|分镜已变更|提示词版本已切换/.test(message)&&api.collabGetProject){try{onProjectChange(await api.collabGetProject({projectId:project.id}));refreshed=true;}catch{}}setError(refreshed?'':message);return false;}finally{setSaving(false);}
 };
 const timing=storyboardTimingForDraft(savedStoryboardTiming(episode,shot,promptBinding),draft.value,shot.content||'');
 const reestimate=async()=>{
  if(!canEdit||saving||estimateRequest.current)return;
  const snapshot=current.current, prompt=snapshot.value.prompt;
  if(!prompt?.trim())return;
  const profiles=state.apiProfiles||[],source=state.directorProjects?.find(row=>row.id===project.director_project_id||row.cloudProjectId===project.director_project_id);
  const sourceEpisode=source?.episodes?.find(ep=>inferDirectorEpisodeNumber(ep)===epNumber);
  let directorModel='';
  try{if(sourceEpisode)directorModel=localStorage.getItem(`xz-model:director-model:${accountId}:${source.id}:${sourceEpisode.id}`);}catch{}
  const ids=[readRemembered(`xz-director-duration-model:${accountId}`,''),directorModel,state.activeApiId];
  const profile=ids.map(id=>profiles.find(row=>row.id===id)).find(Boolean)||profiles[0];
  if(!profile||!api.aiChat){setError('请选择可用的文本估时模型');return;}
  const job=new AbortController(),taskId=crypto.randomUUID();let attempt=0;
  estimateRequest.current=job;setEstimating(true);setError('');
  const segmentId=shot.label||shot.id,maxDurationSeconds=normalizeVideoDurationLimit(timing.durationEstimate?.maxDurationSeconds??timing.maxDurationSeconds);
  try{
   const estimates=await estimateVideoDurations({segments:[{id:segmentId,script:timing.durationSourceScript||'',prompt}],maxDurationSeconds,
    signal:job.signal,request:options=>requestVideoDurationText({api,profile,taskId:`${taskId}:${++attempt}`,...options})});
   job.signal.throwIfAborted();
   if(current.current.value.prompt!==prompt||current.current.base.content!==snapshot.base.content||JSON.stringify(current.current.base.durationEstimate)!==JSON.stringify(snapshot.base.durationEstimate)){setError('分镜已修改，请重新估时');return;}
   const estimate=estimates.get(segmentId);
   if(estimate)await save({estimate});
  }catch(reason){if(!job.signal.aborted)setError(String(reason?.message||'估时未完成').replace(/^Error invoking remote method '[^']+': Error: /,''));}
  finally{if(!job.signal.aborted)setEstimating(false);if(estimateRequest.current===job)estimateRequest.current=null;}
 };
 const chooseUpload=async tab=>{
  const item=await api.collabUploadMedia({projectId:project.id,episode:epNumber,scene,note:`参考素材 ${shot.label}`,kind:tab});
  if(!item)return null;const all=await loadMedia();const found=all?.find(m=>m.id===item.id);return found?{...found,name:found.filename||found.note}:null;
 };
 const deletedMediaIds=new Set(tasks.filter(t=>t.projectVideoDeleted).map(t=>t.mediaId));
 const cloudVideos=media.filter(m=>!deletedMediaIds.has(m.id)&&m.kind==='video'&&(m.note?.includes(`[shot:${shot.id}]`)||m.note===shot.label)&&m.scene===scene).map(m=>({...m,mediaId:m.id,shotLabel:shot.label,localResult:false,status:'success',prompt:shot.content}));
 const localTasks=tasks.filter(t=>t.projectId===project.id&&t.shotId===shot.id&&!t.archived&&!t.projectVideoDeleted).map(t=>({...t,localResult:true}));
 const results=[...localTasks,...cloudVideos.filter(m=>!localTasks.some(t=>t.mediaId===m.id))];
 return <><article className="collab-shot-card" data-shot-id={shot.id}><header><b className="collab-shot-badge">{shot.label}</b><div className="storyboard-reference-actions"><button type="button" className="storyboard-import-scene" disabled={!canEdit||saving||bindingLoading||!!bindingReadError||!!sceneImportError||!sceneImportRefs.length} onClick={importScene}><Plus size={14}/>导入本场景素材</button><button type="button" disabled={!canEdit||!baseline.references?.length} onClick={()=>restore()}><RefreshCw size={14}/>重新载入本条关联素材</button>{!!removedReferences.length&&<details><summary><RotateCcw size={14}/>恢复素材（{removedReferences.length}）</summary><div className="storyboard-reference-recovery"><button disabled={!canEdit} onClick={()=>restore()}>全部恢复</button>{removedReferences.map(ref=><button key={generationReferenceKey(ref)} disabled={!canEdit} onClick={()=>restore([generationReferenceKey(ref)])}>{ref.kind==='image'&&<img src={mediaSource(ref)} alt=""/>}{ref.name}</button>)}</div></details>}</div><div className="storyboard-save-actions"><span ref={setNoticeTarget} className="storyboard-notice-slot"/><button disabled={!canEdit||(!draft.dirty&&!audioNeedsShare)||saving} onClick={save}><Save size={14}/>{saving?'保存中…':'保存分镜'}</button><button className="danger" disabled={!canEdit||saving} onClick={()=>onDelete(shot)}><Trash2 size={14}/>删除分镜</button></div></header>{(sceneImportNotice||sceneImportError)&&<p className="storyboard-scene-import-status" role={sceneImportError?"alert":"status"}>{sceneImportError||sceneImportNotice}</p>}<GenerationComposer api={api} accountId={accountId} state={state} referenceViewport promptHeadingAccessory={material&&!material.ready&&<StoryboardMaterialHint label={material.label} issues={material.issues} count={readyReferenceCount} entryLabel={materialEntry.label} onLocate={onOpenReview?()=>onOpenReview(materialEntry):undefined}/>} onAssetSlotEmpty={refreshAssets} bindingNoticeTarget={noticeTarget} timing={timing} estimating={estimating} onReestimate={reestimate} referenceCandidates={referenceCandidates} value={{...draft.value,references:referencePreviews}} onChange={change} disabled={!canEdit} onPick={kind=>setPicker(kind||'image')} onSubmit={async input=>{
  change({...current.current.value,prompt:input.originalPrompt,references:[...normalizeGenerationReferences(current.current.value.references||[]),...input.references.filter(r=>!normalizeGenerationReferences(current.current.value.references||[]).some(old=>generationReferenceKey(old)===generationReferenceKey(r)))],model:input.model,profileId:input.profileId,ratio:input.ratio,duration:input.duration,resolution:input.resolution,autoReferenceOrder:input.autoReferenceOrder,autoReferenceSignature:input.autoReferenceSignature,autoReferenceExclusions:input.autoReferenceExclusions});
  if(!await save())throw new Error('分镜尚未保存，请先处理保存提示');
  const unresolved=assets.filter(a=>{const name=referenceName(a.name);return !assetSkipsReferenceImage(a)&&(input.originalPrompt.includes(`@${name}`)||input.originalPrompt.includes(`@【${name}】`))&&!input.references.some(r=>r.assetId===a.id);});
  if(unresolved.length)throw new Error(`以下引用尚未选择图片：${unresolved.map(a=>a.name).join('、')}`);
  try{await api.generationSubmit({...input,storyboardEdit:true,storyboardPublicationId:shot.storyboardPublicationId||'',projectId:project.id,episode:epNumber,scene,shotId:shot.id,shotLabel:shot.label});}catch(reason){if(String(reason?.message||reason).includes('分镜参考图片已变化'))refreshAssets();throw reason;}window.dispatchEvent(new Event('xz-refresh-generation'));await loadMedia();
 }}></GenerationComposer>{error&&<p className="collab-error">{error}</p>}{!!results.length&&<GenerationResults square tasks={results} api={api} onRefresh={async()=>{window.dispatchEvent(new Event('xz-refresh-generation'));await loadMedia();}} onDeleteMany={canEdit?async rows=>{const result=await api.projectVideoDelete({projectId:project.id,ids:rows.map(videoExportId)});await loadMedia();window.dispatchEvent(new Event('xz-video-pool-refresh'));return result;}:undefined} onReuse={({storyboardSourceReferences,...t})=>change({...draft.value,...t,prompt:t.originalPrompt||t.prompt,references:storyboardSourceReferences||t.references||[]})}/>}</article>{picker&&<ResourcePicker api={api} projectId={project.id} initialTab={picker} onAssetSlotEmpty={refreshAssets} accountId={accountId} canEdit={canEdit} onDelete={async row=>{const result=await api.collabDeleteMedia({projectId:project.id,mediaId:row.id,purpose:'reference-upload',accountId});const key=generationReferenceKey(row),removed=removeGenerationReference(current.current.value,key);change(removed);await loadMedia();return result;}} voiceCards={(promptBinding?.currentSnapshot||promptBinding?.snapshot)?.voiceCards||[]} assets={assets} media={media} selected={draft.value.references||[]} onClose={()=>setPicker(null)} onSelect={references=>{change({...draft.value,references});setPicker(null);}} onUpload={chooseUpload} onRefresh={async()=>{notifyBindingSaved(project.id,accountId,null);await refresh();await loadMedia();}}/>}</>;
}

export function StoryboardWorkbench({project,assets,api,state,refresh,canEdit,onProjectChange,accountId,onOpenReview,stageRef,navigationTarget,onNavigationHandled}) {
 const {data:promptBinding,loading:bindingLoading,error:bindingReadError}=useProjectPromptBinding({api,project,assets,accountId,localSources:state.directorProjects});
 const editionId=project.episodes?.some(e=>e.storyboardPrompts)?'published':project.episodes?.find(e=>e.promptEditionId)?.promptEditionId||'legacy',defaultsScope=JSON.stringify([accountId,project.id,editionId]);
 const scope={accountId,projectId:project.id,editionId};
 const [resolvedSettings,setResolvedSettings]=useState(null),[timingNotice,setTimingNotice]=useState(''),[batchStatus,setBatchStatus]=useState(null);
 const [manualResetScope,setManualResetScope]=useState(null);
 const [defaultState,setDefaultState]=useState(()=>({scope:defaultsScope,value:readStoryboardDefaults(scope)})),[defaultForm,setDefaultForm]=useState(()=>readStoryboardDefaults(scope)?.settings||{}),[defaultsError,setDefaultsError]=useState(''),[applying,setApplying]=useState(false);
 const legacyDefaults=defaultState.scope===defaultsScope?defaultState.value:readStoryboardDefaults(scope);
 useEffect(()=>{setDefaultState({scope:defaultsScope,value:readStoryboardDefaults(scope)});setDefaultForm(readStoryboardDefaults(scope)?.settings||{});setDefaultsError('');},[defaultsScope]);
 const applyDefaults=async(settings,target)=>{if(applying)return;setApplying(true);setDefaultsError('');setTimingNotice('');try{const saved=await api.collabPatchStoryboard({projectId:project.id,operation:'settings',scope:target,episodeId:episode?.id,sceneId:currentScene,settings,revision:crypto.randomUUID()});onProjectChange(saved);setDefaultForm(settings);}catch(e){setDefaultsError(e.message);}finally{setApplying(false);}};
 const episodes=useMemo(()=>normalizeStoryboardEpisodes(project.episodes).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传'),[project.episodes]);
 const navScope={accountId,projectId:project.id,section:'storyboard'};
 const [selection,setSelection]=useState(()=>{
  const nav=navigationTarget||readCollabNavigation(navScope);
  const episode=episodes.find((ep,index)=>inferDirectorEpisodeNumber(ep,index+1)===Number(nav.episodeNumber));
  return {episodeId:episode?.id||null,scene:episode?nav.sceneId||'':'',target:navigationTarget||null};
 });
 const {episodeId,scene,target}=selection;
 const [media,setMedia]=useState([]),[tasks,setTasks]=useState([]),[error,setError]=useState(''),[creating,setCreating]=useState(false);
 const leftColumn=useRef(null),scriptArea=useRef(null),shotStack=useRef(null),scrollReserve=useRef(null);
 useLayoutEffect(()=>{let frame;const fit=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const node=leftColumn.current;if(node)node.style.setProperty('--storyboard-left-height',Math.max(300,innerHeight-Math.max(0,node.getBoundingClientRect().top)-16)+'px');});};fit();window.addEventListener('resize',fit);window.addEventListener('scroll',fit,true);return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',fit);window.removeEventListener('scroll',fit,true);};},[project.id,episodeId,defaultState]);

 const [deleteTarget,setDeleteTarget]=useState(null),[deleting,setDeleting]=useState(false);
 const createPending=useRef(null);
 const createLock=useRef(false);
 const episode=episodes.find(e=>e.id===episodeId);
 const epNumber=episode?inferDirectorEpisodeNumber(episode,episodes.indexOf(episode)+1):0;
 const parsed=episode?parseDirectorScenesReadonly(episode.content||'',epNumber):[];
 const shots=episode?storyboardShots(episode):[];
 const labels=[...new Set((parsed.length?parsed.map(s=>s.label):shots.map(p=>String(p.label||'').split('-').slice(0,2).join('-'))).filter(label=>label.startsWith(epNumber+'-')&&/^\d+-\d+$/.test(label)))];
 if(!labels.length)labels.push(`${epNumber}-1`);
 const currentScene=labels.includes(scene)?scene:labels[0];
 const defaults=episode?.storyboardDefaultSettings?.scenes?.[currentScene]||episode?.storyboardDefaultSettings?.global||legacyDefaults;
 useEffect(()=>{if(defaults?.settings)setDefaultForm(defaults.settings);},[episode?.id,currentScene,defaults?.revision]);
 const applyRecommended=async(target,includeManualDuration=false)=>{
  if(applying||!resolvedSettings)return;setApplying(true);setDefaultsError('');setTimingNotice('');setManualResetScope(null);
  try{
   const recommendedDurations={},recommendedDurationSources={},excludedShotIds=[];
   const {supportedDurations,durationRange,...settings}=resolvedSettings,policy={supportedDurations,durationRange};
   const selected=episodes.filter(ep=>target==='project'||ep.id===episode?.id).flatMap(ep=>storyboardShots(ep).filter(shot=>target!=='scene'||String(shot.label||'').startsWith(currentScene+'-')).map(shot=>({ep,shot})));
   const labelsById=new Map(selected.map(({shot})=>[shot.id,shot.label||shot.id]));
   for(const {ep,shot} of selected){
    const draft=readStoryboardDraft(storyboardDraftKey(project.id,shot,accountId));
    if(hasUnsavedStoryboardTimingEdit(shot,draft)){
     excludedShotIds.push(shot.id);
     continue;
    }
    const timing=savedStoryboardTiming(ep,shot,promptBinding);
    if(storyboardEstimateIssue(timing)||!includeManualDuration&&shot.generationConfig?.durationManuallyAdjusted===true)continue;
    const seconds=recommendedPromptDuration(timing);if(seconds===null)continue;
    recommendedDurationSources[shot.id]={sourcePromptId:timing.sourcePromptId||shot.sourcePromptId||shot.id,sourceContent:timing.sourceContent||shot.sourceContent||shot.content,recommendedDurationSeconds:seconds,...(timing.durationEstimate?{durationEstimate:timing.durationEstimate}:{})};
    const aligned=alignStoryboardDuration(seconds,policy,storyboardRecommendationLimit(timing));
    if(aligned!==null)recommendedDurations[shot.id]=aligned;
   }
   const revision=crypto.randomUUID();
   const saved=await api.collabPatchStoryboard({projectId:project.id,operation:'settings',scope:target,episodeId:episode?.id,sceneId:currentScene,durationMode:'recommended',recommendedDurations,recommendedDurationSources,excludedShotIds,supportedDurations,durationRange,includeManualDuration,settings,revision});
   onProjectChange(saved);
   const reports=(saved.episodes||[]).flatMap(ep=>{const row=target==='scene'?ep.storyboardDefaultSettings?.scenes?.[currentScene]:ep.storyboardDefaultSettings?.global;return row?.revision===revision&&row.recommendedDurationReport?[row.recommendedDurationReport]:[];});
   const count=key=>reports.reduce((total,report)=>total+(report[key]?.length||0),0);
   const manual=count('manual'),pending=count('missing')+count('blocked');
   const skipped=reports.flatMap(report=>(report.skipped||[]).map(id=>labelsById.get(id)||id));
   setTimingNotice([`已按建议设置 ${count('applied')} 条`,count('aligned')?`${count('aligned')} 条已贴齐模型档位`:'',manual?`已保护 ${manual} 条手调时长`:'',pending?`${pending} 条待估时或重分`:'',count('unsupported')?`${count('unsupported')} 条当前模型无法容纳，请更换模型或处理时长`:'',skipped.length?`已跳过未保存分镜 ${skipped.join('、')}`:''].filter(Boolean).join(' · '));
   if(manual&&!includeManualDuration)setManualResetScope({target,episodeId:episode?.id,sceneId:currentScene});
  }catch(e){setDefaultsError(String(e.message).replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{setApplying(false);}
 };
 const resetManualDurations=async()=>{
  const target=manualResetScope;
  if(!target||target.episodeId!==episode?.id||target.sceneId!==currentScene||applying)return;
  if(await confirmAction('将本范围已手动调整的秒数重置为建议时长。未估时、超载或当前模型不支持的分镜仍保留原值。',{title:'重置手调时长'}))await applyRecommended(target.target,true);
 };
 const prompts=shots.filter(p=>p.label===currentScene||p.label?.startsWith(currentScene+'-'));
 const navigate=(id,nextScene='')=>{
  if(target)onNavigationHandled?.(target);
  setSelection({episodeId:id,scene:nextScene,target:null});
  setError('');
 };
 useLayoutEffect(()=>{
  if(scrollReserve.current)scrollReserve.current.style.height='';
  if(stageRef.current)stageRef.current.scrollTop=0;
  if(scriptArea.current)scriptArea.current.scrollTop=0;
 },[episodeId,currentScene,stageRef]);
 const captureReferenceScroll=()=>{
  const stage=stageRef.current,reserve=scrollReserve.current;
  if(!stage||!reserve)return;
  const top=stage.scrollTop;
  return ()=>{
   // Preserve the old bottom only if this edit shortened the scroll range.
   const shortfall=Math.max(0,Math.ceil(top+stage.clientHeight-stage.scrollHeight+reserve.offsetHeight));
   if(shortfall!==reserve.offsetHeight)reserve.style.height=shortfall?shortfall+'px':'';
   stage.scrollTop=top;
  };
 };
 useEffect(()=>{
  const stage=stageRef.current;
  if(!stage)return;
  const releaseReserve=()=>{
   const reserve=scrollReserve.current,height=reserve?.offsetHeight||0;
   if(height&&Math.ceil(stage.scrollTop)<=stage.scrollHeight-stage.clientHeight-height)reserve.style.height='';
  };
  stage.addEventListener('scroll',releaseReserve,{passive:true});
  return()=>stage.removeEventListener('scroll',releaseReserve);
 },[stageRef]);
 const updateMedia=useWorkspacePolling(async current=>{
  try{
   const [m,t]=await Promise.all([api.collabListMedia({projectId:project.id}),api.generationList({includeArchived:true})]);
   if(!current())return;
   setMedia((m||[]).filter(ref=>isProjectGenerationReference(ref,project.id)));setTasks(t||[]);
   return m||[];
  }catch(e){if(current())setError(e.message||'素材读取失败，请重试');}
 },{scope:JSON.stringify([accountId,project.id]),delay:8000});
 const loadMedia=()=>updateMedia({afterCurrent:true});
 useEffect(()=>{if(episode)rememberCollabNavigation(navScope,{episodeNumber:epNumber,sceneId:currentScene,shotId:null});},[accountId,project.id,epNumber,currentScene,episode?.id]);
 useLayoutEffect(()=>{
  if(!target)return;
  if(target!==navigationTarget){
   setSelection(current=>({...current,target:null}));
   return;
  }
  if(bindingLoading)return;
  const stage=stageRef.current;
  if(stage&&Number(target.episodeNumber)===epNumber&&target.sceneId===currentScene){
   const shot=[...(shotStack.current?.querySelectorAll('.collab-shot-card')||[])].find(node=>node.dataset.shotId===target.shotId);
   if(shot)stage.scrollTop+=shot.getBoundingClientRect().top-stage.getBoundingClientRect().top-stage.clientTop;
  }
  setSelection(current=>({...current,target:null}));
  onNavigationHandled?.(target);
 },[target,navigationTarget,bindingLoading,epNumber,currentScene,stageRef,onNavigationHandled]);
 const create=async()=>{
  if(createLock.current||!canEdit||!episode)return;
  createLock.current=true;
  setCreating(true);setError('');
  try{
   const key=episode.id+':'+(episode.promptEditionId||'legacy')+':'+currentScene;
   if(createPending.current?.key!==key)createPending.current={key,shotId:crypto.randomUUID()};
   const saved=await api.collabPatchStoryboard({projectId:project.id,episodeId:episode.id,promptEditionId:episode.promptEditionId||'legacy',editPolicy:'direct',operation:'create',shotId:createPending.current.shotId,scene:currentScene});
   onProjectChange(saved);createPending.current=null;
  }catch(e){setError(e.message||'创建分镜失败，请重试');}finally{createLock.current=false;setCreating(false);}
 };
 if(!episode)return <section className="collab-episode-overview">
  <header className="collab-storyboard-heading"><div><Clapperboard size={21}/><h2>分镜工作台</h2></div><span>共 {episodes.length} 集 · 选择分集继续创作</span></header>
  {error&&<p role="alert" className="collab-error">{error}</p>}
  <div className="collab-episode-grid">{episodes.map(ep=><button className="collab-episode-card" key={ep.id} onClick={()=>navigate(ep.id)}><b>{ep.title}</b><small>{ep.content?.slice(0,70)}</small><span>{storyboardShots(ep).length} 条分镜</span></button>)}</div>
  {!episodes.length&&<p className="generation-empty">当前项目尚无分集，请在导演工作台完善项目后，点击左下角刷新云端数据。</p>}
 </section>;
 return <><GenerationWorkbenchTools scopeKey={JSON.stringify([accountId,project.id])} settings={resolvedSettings} progress={batchStatus}><GenerationComposer settingsOnly accountId={accountId} onSettingsResolved={setResolvedSettings} api={api} state={state} value={defaultForm} onChange={setDefaultForm} disabled={!canEdit||applying} onApplySettings={settings=>applyDefaults(settings,'project')} onApplySceneSettings={settings=>applyDefaults(settings,'scene')} onApplyEpisodeSettings={settings=>applyDefaults(settings,'episode')}/>{defaultsError&&<p className="collab-error" role="alert">{defaultsError}</p>}{timingNotice&&<p className="storyboard-timing-notice" role="status">{timingNotice}{manualResetScope?.episodeId===episode?.id&&manualResetScope?.sceneId===currentScene&&<button className="ghost" type="button" disabled={applying||!canEdit} onClick={resetManualDurations}>重置手调时长</button>}</p>}<StoryboardBatchPanel onStatusChange={setBatchStatus} onRecommended={applyRecommended} settingsBusy={applying} api={api} project={project} accountId={accountId} episodeId={episode.id} sceneId={currentScene} settings={resolvedSettings} assets={assets} media={media} binding={promptBinding} canEdit={canEdit} onProjectChange={onProjectChange}/></GenerationWorkbenchTools><div className="collab-storyboard">
  <aside ref={leftColumn} className="collab-sb-left">
   <nav className="collab-sb-navigation" aria-label="分镜导航">
    <button className="collab-sb-back" onClick={()=>navigate(null)}><ArrowLeft size={16}/>返回分集</button>
    <div className="collab-sb-ep-switch">
     <label>集数<div className="storyboard-scope-row"><select aria-label="选择集数" value={episodeId} onChange={e=>navigate(e.target.value)}>{episodes.map(ep=><option key={ep.id} value={ep.id}>{ep.title}</option>)}</select><span>{labels.length}场景</span></div></label>
     <label>场景<div className="storyboard-scope-row"><select aria-label="选择场景" value={currentScene} onChange={e=>navigate(episodeId,e.target.value)}>{labels.map(label=><option key={label} value={label}>{label}</option>)}</select><span>{prompts.length}分镜</span></div></label>
    </div>
   </nav>
   <textarea ref={scriptArea} aria-label="当前场景剧本" className="collab-sb-script" readOnly value={parsed.find(s=>s.label===currentScene)?.content||episode.content||''}/>
  </aside>
  <section ref={shotStack} className="collab-sb-mid collab-sb-prompt-stack">

   {error&&<p role="alert" className="collab-error">{error}</p>}{bindingReadError&&<p role="alert" className="collab-error">关联刷新未完成：{bindingReadError}</p>}
   {bindingLoading&&!promptBinding&&!episode.storyboardPrompts?<p role="status">正在读取提示词关联素材…</p>:prompts.map(p=><Shot key={`${project.id}:${p.storyboardPublicationId||'legacy'}:${p.id}`} shot={p} episode={episode} epNumber={epNumber} scene={currentScene} project={project} assets={assets} media={media} api={api} state={state} canEdit={canEdit&&!applying} refresh={refresh} loadMedia={loadMedia} tasks={tasks} onOpenReview={onOpenReview} promptBinding={promptBinding} bindingLoading={bindingLoading} bindingReadError={bindingReadError} accountId={accountId} defaults={defaults} onDelete={setDeleteTarget} onProjectChange={onProjectChange} captureReferenceScroll={captureReferenceScroll}/>)}
   {<button className="collab-create-storyboard" onClick={create} disabled={!canEdit||creating}><Plus size={20}/>{creating?'创建中…':'创建分镜'}</button>}
  </section>
  <DeleteConfirm open={Boolean(deleteTarget)} title="删除分镜" name={deleteTarget?.label} detail={deleting?'正在删除…':'确认删除这条分镜？生成的视频与素材会保留，导演工作台原提示词不会删除。'} onCancel={()=>!deleting&&setDeleteTarget(null)} onConfirm={async()=>{
   if(deleting)return;setDeleting(true);setError('');
   try{const saved=await api.collabPatchStoryboard({projectId:project.id,episodeId:episode.id,promptEditionId:episode.promptEditionId||'legacy',editPolicy:'direct',storyboardPublicationId:deleteTarget.storyboardPublicationId,operation:'delete',shotId:deleteTarget.id,base:{content:deleteTarget.content,generationConfig:deleteTarget.generationConfig}});onProjectChange(saved);queueDraft(storyboardDraftKey(project.id,deleteTarget,accountId),null);setDeleteTarget(null);}catch(e){setError(e.message);setDeleteTarget(null);}finally{setDeleting(false);}
  }}/>
 </div><div ref={scrollReserve} aria-hidden="true"/></>;
}

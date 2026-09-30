import {referencePolicy} from '../../core/promptBook.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import {mediaModelChoices} from '../../core/modelChoices.js';
import React, {useState, useEffect, useRef} from 'react';
import {Plus, X, Sparkles, Upload, RefreshCw, Download, Copy, Film} from 'lucide-react';
import models from '../../core/feituo-models.json';
import {activeMediaProfile, generationMediaProfiles, isFeituoEndpoint, videoModelCapabilities, imageModelFormats, IMAGE_FORMATS} from '../../core/canvasStore.js';
import {numberedReferences, bindReferencePrompt, mediaSource, appendImportedReferences} from '../../core/generationReferences.js';
import {activePromptMention, insertPromptReference, matchingPromptReferences} from '../../core/promptMentions.js';
import {matchBasicReferences, removeGenerationReference, generationReferenceKey, selectionAfterPromptEdit} from '../../core/automaticReferences.js';

function caretPoint(textarea, caret) {
  const style=getComputedStyle(textarea);
  const mirror=document.createElement('div');
  for(const key of ['boxSizing','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','textIndent','tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'])mirror.style[key]=style[key];
  mirror.style.width=`${textarea.offsetWidth}px`;
  mirror.style.position='absolute';
  mirror.style.visibility='hidden';
  mirror.style.whiteSpace='pre-wrap';
  mirror.style.overflowWrap='break-word';
  mirror.textContent=textarea.value.slice(0,caret);
  const marker=document.createElement('span');
  marker.textContent=textarea.value.slice(caret,caret+1)||'\u200b';
  mirror.append(marker);
  document.body.append(mirror);
  const point={x:marker.offsetLeft-textarea.scrollLeft,y:marker.offsetTop-textarea.scrollTop,lineHeight:parseFloat(style.lineHeight)||24};
  mirror.remove();
  return point;
}

const PromptTextarea=React.forwardRef(function PromptTextarea({prompt,onPromptChange,references,disabled},forwardedRef) {
  const textareaRef=useRef(null);
  const selectionRef=useRef({start:String(prompt||'').length,end:String(prompt||'').length});
  const suppressRef=useRef(null);
  const optionRefs=useRef([]);
  const [mention,setMention]=useState(null);
  const [activeIndex,setActiveIndex]=useState(0);
  const [position,setPosition]=useState({left:4,top:4});
  const matches=mention?matchingPromptReferences(references,mention.query):[];

  const syncSelection=(textarea,nextText=textarea.value)=>{
    const start=textarea.selectionStart,end=textarea.selectionEnd;
    selectionRef.current={start,end};
    if(disabled){setMention(null);return;}
    if(suppressRef.current?.text===nextText&&suppressRef.current?.caret===start&&start===end){setMention(null);return;}
    suppressRef.current=null;
    const found=activePromptMention(nextText,start,end);
    if(!found){setMention(null);return;}
    const point=caretPoint(textarea,start);
    const roomBelow=window.innerHeight-textarea.getBoundingClientRect().top-point.y;
    setPosition({left:Math.max(4,Math.min(point.x,textarea.clientWidth-294)),top:Math.max(4,roomBelow<250?point.y-235:point.y+point.lineHeight+4)});
    setMention(found);
    setActiveIndex(0);
  };

  const insertAlias=alias=>{
    const textarea=textareaRef.current;
    const selection=textarea&&document.activeElement===textarea?{start:textarea.selectionStart,end:textarea.selectionEnd}:selectionRef.current;
    const result=insertPromptReference(prompt,selection.start,selection.end,alias);
    suppressRef.current={text:result.text,caret:result.caret};
    selectionRef.current={start:result.caret,end:result.caret};
    setMention(null);
    onPromptChange(result.text);
    requestAnimationFrame(()=>{
      textarea?.focus({preventScroll:true});
      textarea?.setSelectionRange(result.caret,result.caret);
    });
  };
  React.useImperativeHandle(forwardedRef,()=>({insertAlias,
    captureSelection:()=>{
      const textarea=textareaRef.current;
      return textarea&&document.activeElement===textarea?{start:textarea.selectionStart,end:textarea.selectionEnd,scrollTop:textarea.scrollTop,scrollLeft:textarea.scrollLeft}:null;
    },
    restoreSelection:selection=>{
      const textarea=textareaRef.current;
      if(!selection||document.activeElement!==textarea)return;
      textarea.setSelectionRange(selection.start,selection.end);
      textarea.scrollTop=selection.scrollTop;textarea.scrollLeft=selection.scrollLeft;
      selectionRef.current={start:selection.start,end:selection.end};
    }
  }));
  useEffect(()=>{optionRefs.current[activeIndex]?.scrollIntoView({block:'nearest'});},[activeIndex,mention?.query]);

  const onKeyDown=e=>{
    if(!mention)return;
    if(e.key==='Escape'){e.preventDefault();setMention(null);suppressRef.current={text:prompt,caret:e.currentTarget.selectionStart};return;}
    if(!matches.length)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      setActiveIndex(i=>(i+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length);
    }else if(e.key==='Enter'||e.key==='Tab'){
      e.preventDefault();
      insertAlias(matches[activeIndex]?.alias||matches[0].alias);
    }
  };

  return <div className="generation-textarea-wrap">
    <textarea ref={textareaRef} aria-label="提示词" placeholder="描述画面、动作、镜头与声音；输入 @ 选择素材，或点击下方素材编号…" value={prompt||''} onChange={e=>{onPromptChange(e.target.value);syncSelection(e.target,e.target.value);}} onClick={e=>syncSelection(e.currentTarget)} onSelect={e=>syncSelection(e.currentTarget)} onKeyUp={e=>{if(!['Escape','ArrowDown','ArrowUp','Enter','Tab'].includes(e.key))syncSelection(e.currentTarget);}} onScroll={e=>{if(mention)syncSelection(e.currentTarget);}} onKeyDown={onKeyDown} disabled={disabled}/>
    {mention&&references.length>0&&<div className="generation-mention-menu" role="listbox" aria-label="选择参考素材" style={position}>
      {matches.length?matches.map((ref,index)=><button key={`${ref.kind}-${ref.alias}-${index}`} ref={node=>{optionRefs.current[index]=node;}} role="option" aria-selected={index===activeIndex} className={index===activeIndex?'active':''} onMouseDown={e=>e.preventDefault()} onClick={()=>insertAlias(ref.alias)}><span className="generation-mention-kind">{{image:'图',audio:'音',video:'视'}[ref.kind]}</span><strong>{ref.alias}</strong><span className="generation-mention-name" title={ref.name}>{ref.name}</span></button>):<div className="generation-mention-empty">没有匹配的素材</div>}
    </div>}
  </div>;
});

export function GenerationComposer({state,api,kind='video',value,onChange,onSubmit,disabled=false,onPick,children,episodeReferences=false,onImportingChange,referenceCandidates}) {
  const [busy,setBusy]=useState(false), [importing,setImporting]=useState(false), [error,setError]=useState('');
  const lock=useRef(false);
  const promptEditorRef=useRef(null);
  const profiles=generationMediaProfiles(state,kind);
  const profile=value.profileId?profiles.find(p=>p.id===value.profileId):activeMediaProfile(state,kind);
  const choices=mediaModelChoices(state,kind);
  const feituo=isFeituoEndpoint(profile?.endpoint);
  const available=feituo ? models.filter(m=>m.kind===kind) : [{id:profile?.model || '',name:profile?.model || '请先配置 API'}];
  const model=available.find(m=>m.id===value.model) || available.find(m=>m.id===profile?.model) || available[0];
  const caps=feituo ? model : kind==='video' ? videoModelCapabilities(model.id,profile) : {ratios:imageModelFormats(profile).map(x=>x.value),resolutions:[]};
  const resolutions=caps.resolutions?.length ? caps.resolutions : ['固定'];
  const resolution=resolutions.includes(value.resolution) ? value.resolution : resolutions[0];
  const durations=caps.durationByResolution?.[resolution] || caps.durations || [];
  const duration=durations.includes(value.duration)?value.duration:durations[0];
  const ratio=caps.ratios.includes(value.ratio)?value.ratio:caps.ratios[0];
  const allRefs=value.references || [];
  const limits=kind==='video'?referencePolicy(feituo,caps):null;
  const limitKey=k=>k==='image'?'maxImages':k==='audio'?'maxAudios':'maxVideos';
  const refs=limits?allRefs.filter(r=>limits[limitKey(r.kind)]!==0):allRefs;
  const allowedKinds=['image','audio','video'].filter(k=>!limits||limits[limitKey(k)]!==0);
  const autoOptions={allowedKinds};
  const candidates=referenceCandidates||allRefs;
  useEffect(()=>{
    if(disabled)return;
    const timer=setTimeout(()=>{
      let selection=promptEditorRef.current?.captureSelection();
      const onPromptEdit=edit=>{if(selection)selection=selectionAfterPromptEdit(selection,edit);};
      let next=kind==='video'?matchBasicReferences(value,candidates,{...autoOptions,onPromptEdit}):value;
      if(!next.profileId&&profile)next={...next,profileId:profile.id,model:next.model||profile.model};
      if(next!==value){onChange(next);if(selection)requestAnimationFrame(()=>promptEditorRef.current?.restoreSelection(selection));}
    },350);
    return()=>clearTimeout(timer);
  },[value,referenceCandidates,kind,profile?.id,allowedKinds.join(','),disabled]);
  const hiddenCount=allRefs.length-refs.length;
  const referenceIssue=limits?Object.entries({image:'图片',video:'视频',audio:'音频'}).map(([k,label])=>{
    const count=refs.filter(r=>r.kind===k).length,max=limits[limitKey(k)];
    return count>max?`${label}共 ${count} 个，当前模型最多 ${max} 个，请移除多余参考。`:'';
  }).filter(Boolean).join(' '):'';
  const change=patch=>onChange({...value,...patch});
  const latest=useRef({value,caps,feituo});latest.current={value,caps,feituo};
  const importLock=useRef(false);
  const importFile=async mediaKind=>{
    if(importLock.current)return;
    importLock.current=true;setImporting(true);onImportingChange?.(true);setError('');
    try {
      const selected=api.mediaImportFiles ? await api.mediaImportFiles(mediaKind) : [await api.mediaImportFile(mediaKind)].filter(Boolean);
      if(!selected?.length)return;
      const current=latest.current;
      const references=appendImportedReferences(current.value.references||[],selected,mediaKind,current.feituo?current.caps:{});
      onChange({...current.value,references});
    }catch(e){setError(e.message);}finally{importLock.current=false;setImporting(false);onImportingChange?.(false);}
  };
  const run=async()=>{
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{
      if(!profile?.apiKey)throw new Error('请先在 API 接口设置中填写 API Key');
      const input=kind==='video'?matchBasicReferences(value,candidates,autoOptions):value;
      const submitRefs=(input.references||[]).filter(r=>allowedKinds.includes(r.kind));
      if(limits)for(const k of allowedKinds){if(submitRefs.filter(r=>r.kind===k).length>limits[limitKey(k)])throw new Error(`当前模型的${{image:'图片',audio:'音频',video:'视频'}[k]}参考超出上限，请移除多余素材。`);}
      if(model.protocol==='metadata-content'&&submitRefs.some(r=>r.filePath&&!r.url))throw new Error('当前官转模型要求公网素材链接。请改选支持本地素材的模型，或从项目素材库选用已上传的素材。');
      const prompt=bindReferencePrompt(input.prompt,submitRefs);
      await onSubmit({...input,prompt,originalPrompt:input.prompt,profileId:profile.id,kind,model:model.id,endpoint:profile.endpoint,apiKey:profile.apiKey,ratio,duration,resolution:resolution==='固定'?undefined:resolution,size:imageModelFormats(profile).find(x=>x.value===ratio)?.size, references:submitRefs});
    }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
  };
  return <div className="generation-composer"><div className="generation-editor"><div className="generation-prompt-area"><label>画面与镜头描述 <small>{value.prompt?.length || 0} 字</small></label>{kind==='video'&&<div className="generation-auto-reference-note"><small>根据基础设定自动匹配素材，可手动移除</small><button disabled={disabled} onClick={()=>onChange(matchBasicReferences({...value,autoReferenceSignature:null,autoReferenceExclusions:[]},candidates,autoOptions))}>重新匹配素材</button></div>}<PromptTextarea ref={promptEditorRef} prompt={value.prompt || ''} onPromptChange={prompt=>change({prompt})} references={refs} disabled={disabled}/><div className="generation-references">{numberedReferences(refs).map((r,i)=><figure key={r.id || i}>{r.kind==='image'?(r.filePath?<img src={mediaSource(r)} alt={r.name} loading="lazy" />:<CloudAssetImage api={api} projectId={r.projectId} assetId={r.assetId} image={{...r,id:r.imageId||r.id,url:mediaSource(r)}} alt={r.name} />):r.kind==='video'?<video src={mediaSource(r)} controls preload="none"/>:<audio src={mediaSource(r)} controls preload="none"/>}<button className="reference-remove" aria-label={`移除${r.name}`} disabled={disabled} onClick={()=>onChange(removeGenerationReference(value,generationReferenceKey(refs[i]),autoOptions))}><X size={12}/></button><button className="reference-alias" disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>promptEditorRef.current?.insertAlias(r.alias)}>{r.alias}</button><figcaption>{r.name}</figcaption>{model.protocol==='metadata-content'&&r.kind==='image'&&<select aria-label="图片用途" value={r.role||'reference_image'} onChange={e=>change({references:allRefs.map(item=>item===refs[i]?{...item,role:e.target.value}:item)})}><option value="reference_image">参考图</option><option value="first_frame">首帧</option><option value="last_frame">尾帧</option></select>}</figure>)}{!episodeReferences&&<button className="collab-add-ref" aria-label="添加参考素材" disabled={disabled||importing} onClick={()=>onPick?onPick():importFile('image')}><Plus/></button>}</div>{hiddenCount>0&&<p className="generation-limits">当前模型不支持的 {hiddenCount} 个参考已隐藏，切换支持该类型的模型后会恢复。</p>}{episodeReferences&&!feituo&&<p className="generation-limits">当前接口支持单张图片参考，不支持视频和音频参考。</p>}{episodeReferences&&model.protocol==='metadata-content'&&refs.some(r=>r.filePath&&!r.url)&&<p className="generation-limits">此官转模型要求公网素材链接；本地文件请使用支持本地素材的模型。</p>}{referenceIssue&&<p className="collab-error" role="alert">{referenceIssue}</p>}{children}</div><div className="generation-controls"><label>生成接口<select aria-label="生成接口" value={profile?.id||''} onChange={e=>change({profileId:e.target.value,model:''})}>{!profiles.length&&<option>请先配置 API</option>}{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>模型<select aria-label="模型" value={JSON.stringify([profile?.id,model.id])} onChange={e=>{const chosen=choices.find(p=>p.id===e.target.value);if(chosen)change({profileId:chosen.profileId,model:chosen.model});}}>{!profile&&<option value={JSON.stringify([undefined,model.id])}>请选择已配置模型</option>}{choices.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="generation-param-grid"><label>画面比例<select aria-label="比例" value={ratio} onChange={e=>change({ratio:e.target.value})}>{caps.ratios.map(r=><option key={r}>{r}</option>)}</select></label>{kind==='video'&&<label>视频时长<select aria-label="时长" value={duration} onChange={e=>change({duration:+e.target.value})}>{durations.map(d=><option key={d} value={d}>{d} 秒</option>)}</select></label>}{kind==='video'&&<label>分辨率<select aria-label="分辨率" value={resolution} onChange={e=>change({resolution:e.target.value})}>{resolutions.map(r=><option key={r}>{r}</option>)}</select></label>}</div>{feituo&&<small className="generation-limits">图片 {caps.maxImages ?? '不限'} 张 · 视频 {caps.maxVideos} 个 · 音频 {caps.maxAudios} 个<br/>{model.price}<br/>以平台实际结算为准</small>}<div className="generation-upload-buttons">{['image',...(kind==='video'?['audio','video']:[])].map(k=><button key={k} disabled={disabled || importing || (!episodeReferences && feituo && caps[k==='image'?'maxImages':k==='audio'?'maxAudios':'maxVideos']===0)} onClick={()=>onPick?onPick(k):importFile(k)}><Upload size={14}/>{k==='image'?'参考图片':k==='audio'?'参考音频':'参考视频'}</button>)}</div><button className="primary" disabled={disabled||busy||!value.prompt?.trim()||!profile} onClick={run}><Sparkles size={16}/>{busy?'正在提交…':kind==='video'?'生成视频':'生成图片'}</button>{error&&<p className="collab-error" role="alert">{error}</p>}</div></div></div>;
}

export { GenerationResults } from './GenerationResults.jsx';

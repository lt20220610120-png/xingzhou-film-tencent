import {referencePolicy} from '../../core/promptBook.js';
import CloudAssetImage from './CloudAssetImage.jsx';
import {mediaModelChoices} from '../../core/modelChoices.js';
import React, {useState, useEffect, useRef} from 'react';
import {Plus, X, Sparkles, Upload, RefreshCw, Download, Copy, Film} from 'lucide-react';
import models from '../../core/feituo-models.json';
import {activeMediaProfile, generationMediaProfiles, isFeituoEndpoint, videoModelCapabilities, imageModelFormats, IMAGE_FORMATS} from '../../core/canvasStore.js';
import {numberedReferences, bindReferencePrompt, mediaSource, appendImportedReferences} from '../../core/generationReferences.js';

export function GenerationComposer({state,api,kind='video',value,onChange,onSubmit,disabled=false,onPick,children,episodeReferences=false,onImportingChange}) {
  const [busy,setBusy]=useState(false), [importing,setImporting]=useState(false), [error,setError]=useState('');
  const lock=useRef(false);
  const profiles=generationMediaProfiles(state,kind);
  const profile=value.profileId?profiles.find(p=>p.id===value.profileId):activeMediaProfile(state,kind);
  const choices=mediaModelChoices(state,kind);
  useEffect(()=>{if(!value.profileId&&profile)onChange({...value,profileId:profile.id,model:value.model||profile.model});},[profile?.id,value.profileId]);
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
  const limits=episodeReferences?referencePolicy(feituo,caps):null;
  const limitKey=k=>k==='image'?'maxImages':k==='audio'?'maxAudios':'maxVideos';
  const refs=limits?allRefs.filter(r=>limits[limitKey(r.kind)]!==0):allRefs;
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
      if(referenceIssue)throw new Error(referenceIssue);
      if(episodeReferences&&model.protocol==='metadata-content'&&refs.some(r=>r.filePath&&!r.url))throw new Error('当前官转模型要求公网素材链接。请改选支持本地素材的模型，或从项目素材库选用已上传的素材。');
      const prompt=bindReferencePrompt(value.prompt,refs);
      await onSubmit({...value,prompt,originalPrompt:value.prompt,profileId:profile.id,kind,model:model.id,endpoint:profile.endpoint,apiKey:profile.apiKey,ratio,duration,resolution:resolution==='固定'?undefined:resolution,size:imageModelFormats(profile).find(x=>x.value===ratio)?.size, references:refs});
    }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
  };
  return <div className="generation-composer"><div className="generation-editor"><div className="generation-prompt-area"><label>画面与镜头描述 <small>{value.prompt?.length || 0} 字</small></label><textarea aria-label="提示词" placeholder="描述画面、动作、镜头与声音；点击素材编号可插入引用…" value={value.prompt || ''} onChange={e=>change({prompt:e.target.value})} disabled={disabled}/><div className="generation-references">{numberedReferences(refs).map((r,i)=><figure key={r.id || i}>{r.kind==='image'?<CloudAssetImage api={api} projectId={r.projectId} assetId={r.assetId} image={{...r,id:r.imageId||r.id,url:mediaSource(r)}} alt={r.name} />:r.kind==='video'?<video src={mediaSource(r)} controls preload="none"/>:<audio src={mediaSource(r)} controls preload="none"/>}<button className="reference-remove" aria-label={`移除${r.name}`} disabled={disabled} onClick={()=>change({references:allRefs.filter(item=>item!==refs[i])})}><X size={12}/></button><button className="reference-alias" disabled={disabled} onClick={()=>change({prompt:`${value.prompt || ''} ${r.alias}`})}>{r.alias}</button><figcaption>{r.name}</figcaption>{model.protocol==='metadata-content'&&r.kind==='image'&&<select aria-label="图片用途" value={r.role||'reference_image'} onChange={e=>change({references:allRefs.map(item=>item===refs[i]?{...item,role:e.target.value}:item)})}><option value="reference_image">参考图</option><option value="first_frame">首帧</option><option value="last_frame">尾帧</option></select>}</figure>)}{!episodeReferences&&<button className="collab-add-ref" aria-label="添加参考素材" disabled={disabled||importing} onClick={()=>onPick?onPick():importFile('image')}><Plus/></button>}</div>{hiddenCount>0&&<p className="generation-limits">当前模型不支持的 {hiddenCount} 个参考已隐藏，切换支持该类型的模型后会恢复。</p>}{episodeReferences&&!feituo&&<p className="generation-limits">当前接口支持单张图片参考，不支持视频和音频参考。</p>}{episodeReferences&&model.protocol==='metadata-content'&&refs.some(r=>r.filePath&&!r.url)&&<p className="generation-limits">此官转模型要求公网素材链接；本地文件请使用支持本地素材的模型。</p>}{referenceIssue&&<p className="collab-error" role="alert">{referenceIssue}</p>}{children}</div><div className="generation-controls"><label>生成接口<select aria-label="生成接口" value={profile?.id||''} onChange={e=>change({profileId:e.target.value,model:''})}>{!profiles.length&&<option>请先配置 API</option>}{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>模型<select aria-label="模型" value={JSON.stringify([profile?.id,model.id])} onChange={e=>{const chosen=choices.find(p=>p.id===e.target.value);if(chosen)change({profileId:chosen.profileId,model:chosen.model});}}>{!profile&&<option value={JSON.stringify([undefined,model.id])}>请选择已配置模型</option>}{choices.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="generation-param-grid"><label>画面比例<select aria-label="比例" value={ratio} onChange={e=>change({ratio:e.target.value})}>{caps.ratios.map(r=><option key={r}>{r}</option>)}</select></label>{kind==='video'&&<label>视频时长<select aria-label="时长" value={duration} onChange={e=>change({duration:+e.target.value})}>{durations.map(d=><option key={d} value={d}>{d} 秒</option>)}</select></label>}{kind==='video'&&<label>分辨率<select aria-label="分辨率" value={resolution} onChange={e=>change({resolution:e.target.value})}>{resolutions.map(r=><option key={r}>{r}</option>)}</select></label>}</div>{feituo&&<small className="generation-limits">图片 {caps.maxImages ?? '不限'} 张 · 视频 {caps.maxVideos} 个 · 音频 {caps.maxAudios} 个<br/>{model.price}<br/>以平台实际结算为准</small>}<div className="generation-upload-buttons">{['image',...(kind==='video'?['audio','video']:[])].map(k=><button key={k} disabled={disabled || importing || (feituo && caps[k==='image'?'maxImages':k==='audio'?'maxAudios':'maxVideos']===0)} onClick={()=>onPick?onPick(k):importFile(k)}><Upload size={14}/>{k==='image'?'参考图片':k==='audio'?'参考音频':'参考视频'}</button>)}</div><button className="primary" disabled={disabled||busy||!value.prompt?.trim()||!profile} onClick={run}><Sparkles size={16}/>{busy?'正在提交…':kind==='video'?'生成视频':'生成图片'}</button>{error&&<p className="collab-error" role="alert">{error}</p>}</div></div></div>;
}

export function GenerationResults({tasks,api,onReuse,onRefresh,onDelete}) {
 const [preview,setPreview]=useState(null),[error,setError]=useState('');
 const names={submitting:'提交中',submitted:'排队 / 生成中',downloading:'下载中',success:'已完成',failed:'失败',uncertain:'待核对'};
 return <section className="generation-results"><header><h3>生成结果 <small>{tasks.length}</small></h3><button onClick={onRefresh}><RefreshCw size={14}/>刷新结果</button></header>{error&&<p role="alert">{error}</p>}<div className="generation-result-grid">{tasks.map(t=><article key={t.id}><header><span className={`status-${t.status}`}>{names[t.status]||t.status}</span><small>{t.kind==='video'?`${t.duration || ''} 秒`:'图片'}</small></header>{(t.filePath||t.url)?<button className="generation-result-preview" aria-label="预览生成结果" onClick={()=>setPreview(t)}>{t.kind==='image'?<img loading="lazy" decoding="async" src={mediaSource(t)} alt="生成图片"/>:<video src={mediaSource(t)} preload="none" muted/>}<span>点击预览</span></button>:<div className="generation-result-placeholder"><Film/><span>{names[t.status]}</span></div>}<p title={t.originalPrompt||t.prompt}>{t.originalPrompt||t.prompt}</p><small>{models.find(m=>m.id===t.model)?.name||t.model}</small>{t.jobId&&<small title={t.jobId}>任务 {t.jobId}</small>}{(t.error||t.warning)&&<p className="collab-error">{t.error||t.warning}</p>}<footer>{onReuse&&<button onClick={()=>onReuse(t)}><Copy size={13}/>复用</button>}{(t.filePath||t.url)&&<button onClick={async()=>{try{for(const filePath of t.files||[t.filePath])await api.mediaExportFile({filePath,url:t.url,kind:t.kind});}catch(e){setError(e.message);}}}><Download size={13}/>下载</button>}{onDelete&&t.status==='success'&&<button onClick={()=>onDelete(t)}>删除</button>}{t.costYuan&&<small>¥{t.costYuan}</small>}</footer></article>)}</div>{!tasks.length&&<div className="generation-empty"><Film/><p>生成的作品会保存在这里</p><small>可预览、下载，或复用提示词与参数</small></div>}{preview&&<div className="generation-preview-overlay" role="dialog" aria-label="作品预览"><button aria-label="关闭预览" onClick={()=>setPreview(null)}><X/></button>{preview.kind==='image'?<img src={mediaSource(preview)} alt="生成结果大图"/>:<video src={mediaSource(preview)} controls autoPlay/>}</div>}</section>;
}

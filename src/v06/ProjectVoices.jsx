import React,{useEffect,useMemo,useRef,useState} from 'react';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {projectVoiceRoster,setVoiceCandidate,confirmVoiceCandidate} from '../../core/characterVoices.js';
import {readProjectVoices} from '../../core/voiceAnalysisRunner.js';
import {mediaSource} from '../../core/generationReferences.js';
import {ModelSelect,useWindowModel} from './ModelSelect.jsx';
import {AUDIO_LANGUAGES} from './AudioWorkbench.jsx';
import {notifyBindingSaved} from './useScenePromptLinks.js';
import './project-voices.css';

function VoiceCard({character,profile={},profiles,defaultId,store,api,canEdit,onChanged}){
 const [modelId,setModelId]=useState(profile.draft?.profileId||defaultId||profiles[0]?.id||'');
 const [quote,setQuote]=useState(profile.draft?.quote??character.quote),[instructions,setInstructions]=useState(profile.draft?.instructions||''),[language,setLanguage]=useState(profile.draft?.language||'Chinese');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const quoteEdited=useRef(Boolean(profile.draft&&'quote' in profile.draft));
 useEffect(()=>{if(!quoteEdited.current)setQuote(character.quote);},[character.quote]);
 const selected=profiles.find(p=>p.id===modelId);
 const settings=()=>({profileId:modelId,model:selected?.model||'',quote,instructions,language});
 const execute=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(e.message);}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const saveDraft=()=>store.setVoiceProfile(character.key,p=>({...p,draft:settings()}));
 const generate=()=>execute(async()=>{
  if(!selected)throw Error('请选择语音模型');await saveDraft();
  const result=await api.audioGenerate({...selected,input:quote,instructions:instructions||selected.instructions,language});
  if(!alive.current)return;
  await store.setVoiceProfile(character.key,p=>setVoiceCandidate(p,{...result,name:character.name+'音色',sourceResultId:result.id},settings()));
 });
 const upload=()=>execute(async()=>{
  const files=api.mediaImportFiles?await api.mediaImportFiles('audio'):[await api.mediaImportFile('audio')].filter(Boolean);
  if(!alive.current)return;
  await store.setVoiceProfile(character.key,p=>files.reduce((next,file)=>setVoiceCandidate(next,{...file,id:crypto.randomUUID(),name:character.name+'音色'},{quote,language}),p));
 });
 const confirm=id=>execute(async()=>{const candidate=profile.candidates?.find(c=>c.id===id);const retained=candidate?.sourceResultId&&!candidate.retained?await api.audioResultRetain({id:candidate.sourceResultId}):null;await store.setVoiceProfile(character.key,p=>confirmVoiceCandidate(retained?{...p,candidates:p.candidates.map(c=>c.id===id?{...c,filePath:retained.filePath,retained:true}:c)}:p,id));await onChanged();});
 return <article className="project-voice-card">
  <header><h3>{character.name}</h3><span>{character.episodes.length} 集 · {profile.confirmed?'音色已确定':'待确定音色'}</span></header>
  <details><summary>人物介绍与关联场景</summary><p>{character.description||'清单尚无人物介绍'}</p><p>出场：{character.episodes.join('、')} 集</p><p>正常对白场景：{character.speakingSceneIds.join('、')||'尚未识别到正常对白'}</p></details>
  <label>人物的一句话<textarea aria-label={`${character.name}一句话`} rows={3} maxLength={1000} value={quote} disabled={!canEdit||busy} onChange={e=>{quoteEdited.current=true;setQuote(e.target.value);}} onBlur={()=>canEdit&&saveDraft().catch(e=>setError(e.message))}/><small>{character.quoteSceneId?`剧本原话来源：${character.quoteSceneId}`:'可上传已有音色，或先补读正常对白'}</small></label>
  <ModelSelect label={`${character.name}语音模型`} displayLabel="调用的语音模型" profiles={profiles} value={modelId} onChange={setModelId} disabled={!canEdit||busy}/>
  <label>音色描述<textarea aria-label={`${character.name}音色描述`} rows={2} maxLength={2000} placeholder="性别、年龄感、声线与说话方式" value={instructions} onChange={e=>setInstructions(e.target.value)} disabled={!canEdit||busy}/></label>
  <label>语言<select value={language} disabled={!canEdit||busy} onChange={e=>setLanguage(e.target.value)}>{AUDIO_LANGUAGES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  <div className="project-voice-actions"><button className="primary" disabled={!canEdit||busy||!selected||!quote.trim()} onClick={generate}>{busy?'处理中…':'生成语音'}</button><button className="secondary" disabled={!canEdit||busy} onClick={upload}>上传本地语音</button></div>
  {profile.confirmed&&<section className="project-voice-confirmed"><b>已确定音色</b><audio aria-label={`${character.name}固定音色`} controls preload="metadata" src={mediaSource(profile.confirmed)}/><small>后续关联复用这条音频；新生成或上传不会替换它。</small></section>}
  <div className="project-voice-results">{[...(profile.candidates||[])].reverse().map((sample,index)=><div key={sample.id}><span>样音 {profile.candidates.length-index}{sample.id===profile.confirmed?.id?' · 已确定':''}</span><audio aria-label={`${character.name}样音${profile.candidates.length-index}`} controls preload="none" src={mediaSource(sample)}/><button disabled={!canEdit||busy||sample.id===profile.confirmed?.id} onClick={()=>confirm(sample.id)}>确定音色</button><button disabled={busy} onClick={()=>execute(()=>api.mediaExportFile({...sample,kind:'audio'}))}>导出</button></div>)}</div>
  {error&&<p role="alert" className="collab-error">{error}</p>}
 </article>;
}
export default function ProjectVoices({project,assets,api,state,accountId,canEdit}){
 const store=useMemo(()=>getArtReviewStore({api,projectId:project.id,accountId}),[api,project.id,accountId]);
 const [ledger,setLedger]=useState(store.snapshot()),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[all,setAll]=useState(false);
 const [modelId,setModelId,model]=useWindowModel('voice-reading:'+accountId,state.apiProfiles||[],state.activeApiId);const job=useRef(null);
 useEffect(()=>{let alive=true;const unsub=store.subscribe(()=>alive&&setLedger(store.snapshot()));store.load(project,assets).then(()=>alive&&setLoaded(true)).catch(e=>alive&&setError(e.message));return()=>{alive=false;unsub();if(job.current){job.current.cancelled=true;for(const taskId of job.current.taskIds||[])api.cancelAiTask?.({taskId});}};},[store,project,assets,api]);
 const roster=projectVoiceRoster(project,ledger),characters=roster.characters.filter(c=>all||c.major),profiles=(state.mediaProfiles||[]).filter(p=>p.kind==='audio');
 const changed=async()=>{const saved=(await api.promptArtStatus?.())?.enabled?await api.promptArtLoad?.({projectId:project.id,accountId}):null;notifyBindingSaved(project.id,accountId,saved);};
 const read=async()=>{if(job.current)return;const current={cancelled:false};job.current=current;setBusy(true);setError('');try{await readProjectVoices({project,store,api,profile:model,job:current,onProgress:()=>!current.cancelled&&setNotice(current.notice)});if(!current.cancelled){await changed();setNotice('正常对白读取已保存');}}catch(e){if(!current.cancelled)setError(e.message);}finally{if(!current.cancelled)setBusy(false);job.current=null;}};
 return <section className="project-voices"><header><div><h1>人物语音</h1><p>主要人物：出场 ≥3 集 · 只关联正常对白</p><p>{roster.complete?'全剧读取完成':`对白已读取 ${roster.read} / ${roster.total} 集，当前为暂定统计`}</p></div><div><ModelSelect profiles={state.apiProfiles||[]} value={modelId} onChange={setModelId} label="对白读取模型" disabled={busy}/><button className="secondary" disabled={!canEdit||!loaded||busy||!model} onClick={read}>{busy?'正在补读…':'补读全剧正常对白'}</button></div></header>
  <label className="project-voice-filter"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>同时显示不足 3 集的人物</label>
  {roster.identityError&&<p className="collab-error" role="alert">{roster.identityError}</p>}{error&&<p className="collab-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!characters.length&&<p className="project-voice-empty">尚无符合条件的人物。先完成信息读取，再补读正常对白；也可以显示全部人物。</p>}
  <div className="project-voice-grid">{characters.map(c=><VoiceCard key={`${project.id}:${accountId}:${c.key}`} character={c} profile={ledger.voiceProfiles?.[c.key]} profiles={profiles} defaultId={state.activeAudioApiId} store={store} api={api} canEdit={canEdit} onChanged={changed}/>)}</div>
 </section>;
}

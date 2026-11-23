import React,{memo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {queueDraft,readQueuedDraft} from '../editing.js';
import {Sparkles,Video,Image as ImageIcon,KeyRound} from 'lucide-react';
import {GenerationComposer,GenerationResults} from './GenerationComposer.jsx';
import {PromptBookWorkspace} from './PromptBookWorkspace.jsx';
import {MediaApiSettings} from './CanvasWorkspace.jsx';
import {useWorkspaceActive} from '../components/WorkspacePresence.jsx';
import {useWorkspacePolling} from './useWorkspacePolling.js';

const Results = memo(GenerationResults);
const emptyDraft = {prompt:'',references:[]};

export function GenerationWorkspace({state,api,setState,getState,saveLocal,account}){
 const [kind,setKind]=useState('video'),[drafts,setDrafts]=useState(()=>{try{const queued=readQueuedDraft('xz-generation-drafts');return queued.found?queued.value:JSON.parse(localStorage.getItem('xz-generation-drafts')||'{}')}catch{return {}}}),[tasks,setTasks]=useState([]),[settings,setSettings]=useState(false),[error,setError]=useState('');
 const active=useWorkspaceActive();
 const bookMode=state.generationWorkflow?.mode==='book';
 const setBookMode=useCallback(mode=>setState(current=>current.generationWorkflow?.mode===mode?current:{...current,generationWorkflow:{...current.generationWorkflow,mode}}),[setState]);
 const latestDrafts=useRef(drafts);latestDrafts.current=drafts;
 const load=useWorkspacePolling(async current=>{
   try {const rows=await api.generationList();if(current()){setTasks(rows);setError('');}}
   catch (cause) {if(current())setError(cause.message);}
 },{scope:account?.id,delay:4000});
 useEffect(()=>{if(!active)setSettings(false);},[active]);
 const change=useCallback(value=>setDrafts(current=>{const next={...current,[kind]:value};queueDraft('xz-generation-drafts',next);return next;}),[kind]);
 const submit=useCallback(async input=>{await api.generationSubmit(input);await load({afterCurrent:true});},[api,load]);
 const refresh=useCallback(async()=>{window.dispatchEvent(new Event('xz-refresh-generation'));await load({afterCurrent:true});},[load]);
 const clear=useCallback(async(ids,options={})=>{
   const retainedPaths=Object.values(latestDrafts.current).flatMap(draft=>(draft.references||[]).map(ref=>ref.filePath).filter(Boolean));
   const result=await api.generationClear({ids,retainedPaths,includeActive:options.includeActive===true});
   await load({afterCurrent:true});return result;
 },[api,load]);
 const reuse=useCallback(task=>{setBookMode('manual');change({...task,prompt:task.originalPrompt||task.prompt});window.scrollTo({top:0,behavior:'smooth'});},[change,setBookMode]);
 const kindTasks=useMemo(()=>tasks.filter(task=>task.kind===kind),[tasks,kind]);
 return <main className="generation-workspace"><header><div><h1><Sparkles/>图视生成</h1></div><div className="generation-tabs"><button className={kind==='video'?'active':''} onClick={()=>setKind('video')}><Video/>AI视频生成</button><button className={kind==='image'?'active':''} onClick={()=>setKind('image')}><ImageIcon/>AI图片生成</button><button onClick={()=>setSettings(true)}><KeyRound/>API 设置</button></div></header>{kind==='video'&&<div className="generation-tabs prompt-book-mode"><button className={!bookMode?'active':''} onClick={()=>setBookMode('manual')}>单条创作</button><button className={bookMode?'active':''} onClick={()=>setBookMode('book')}>整本提示词与素材</button></div>}{kind==='video'&&bookMode?<PromptBookWorkspace state={state} setState={setState} getState={getState} saveLocal={saveLocal} api={api} accountId={account?.id} onSubmit={submit}/>:<GenerationComposer key={'composer-'+kind} accountId={account?.id} state={state} api={api} kind={kind} value={drafts[kind]||emptyDraft} onChange={change} onSubmit={submit}/>} {error&&<p className="collab-error">{error}</p>}<Results key={'results-'+kind} api={api} tasks={kindTasks} onRefresh={refresh} onClear={clear} onReuse={reuse}/>{active&&settings&&<MediaApiSettings state={state} setState={setState} onClose={()=>setSettings(false)}/>}</main>;
}
export default GenerationWorkspace;

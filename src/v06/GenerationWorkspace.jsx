import React,{useEffect,useState} from 'react';
import {Sparkles,Video,Image as ImageIcon,KeyRound} from 'lucide-react';
import {GenerationComposer,GenerationResults} from './GenerationComposer.jsx';
import {PromptBookWorkspace} from './PromptBookWorkspace.jsx';
import {MediaApiSettings} from './CanvasWorkspace.jsx';
export function GenerationWorkspace({state,api,setState}){
 const [kind,setKind]=useState('video'),[drafts,setDrafts]=useState(()=>{try{return JSON.parse(localStorage.getItem('xz-generation-drafts')||'{}')}catch{return {}}}),[tasks,setTasks]=useState([]),[settings,setSettings]=useState(false),[error,setError]=useState('');
 const bookMode=state.generationWorkflow?.mode==='book';
 const setBookMode=mode=>setState(current=>({...current,generationWorkflow:{...current.generationWorkflow,mode}}));
 const load=async()=>{try{setTasks(await api.generationList());}catch(e){setError(e.message);}};
 useEffect(()=>{load();const timer=setInterval(load,4000);return()=>clearInterval(timer);},[]);
 const change=value=>setDrafts(current=>{const next={...current,[kind]:value};localStorage.setItem('xz-generation-drafts',JSON.stringify(next));return next;});
 return <main className="generation-workspace"><header><div><small>创作工作台 / GENERATION</small><h1><Sparkles/>图视生成</h1></div><div className="generation-tabs"><button className={kind==='video'?'active':''} onClick={()=>setKind('video')}><Video/>AI视频生成</button><button className={kind==='image'?'active':''} onClick={()=>setKind('image')}><ImageIcon/>AI图片生成</button><button onClick={()=>setSettings(true)}><KeyRound/>API 设置</button></div></header>{kind==='video'&&<div className="generation-tabs prompt-book-mode"><button className={!bookMode?'active':''} onClick={()=>setBookMode('manual')}>单条创作</button><button className={bookMode?'active':''} onClick={()=>setBookMode('book')}>整本提示词与素材</button></div>}{kind==='video'&&bookMode?<PromptBookWorkspace state={state} setState={setState} api={api} onSubmit={async input=>{await api.generationSubmit(input);await load();}}/>:<GenerationComposer key={kind} state={state} api={api} kind={kind} value={drafts[kind]||{prompt:'',references:[]}} onChange={change} onSubmit={async input=>{await api.generationSubmit(input);await load();}}/>}{error&&<p className="collab-error">{error}</p>}<GenerationResults api={api} tasks={tasks.filter(t=>t.kind===kind)} onRefresh={async()=>{window.dispatchEvent(new Event('xz-refresh-generation'));await load();}} onDelete={async t=>{if(!window.confirm('移除这条生成记录？'))return;await api.generationArchive({id:t.id});await load();}} onReuse={t=>{setBookMode('manual');change({...t,prompt:t.originalPrompt||t.prompt});window.scrollTo({top:0,behavior:'smooth'});}}/>{settings&&<MediaApiSettings state={state} setState={setState} onClose={()=>setSettings(false)}/>}</main>;
}
export default GenerationWorkspace;

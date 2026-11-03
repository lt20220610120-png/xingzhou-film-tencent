import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ProductionRunWorkspace} from './ProductionRunWorkspace.jsx';

function ProjectView({run,account,state,setState,production,api}){
 const [error,setError]=useState('');
 const action=async fn=>{setError('');try{await fn();}catch(reason){setError(reason.message);}};
 return <section className="production-console is-running"><ProductionRunWorkspace run={run} runs={[run]} projects={state.directorProjects||[]} state={state} production={production} api={api} error={error} onError={reason=>setError(reason?.message||String(reason))} onAction={action} onSaveDefault={rule=>setState(s=>({...s,productionRules:{...s.productionRules,[account.id]:rule}}))}/></section>;
}

// Render into same-origin native windows from the existing controller. Closing a
// project view must never create, restore or stop a second production executor.
export function useProductionProjectWindows({account,state,setState,production,api}){
 const windows=useRef(new Map()),mounted=useRef(false),[,refresh]=useState(0);
 useEffect(()=>{
   mounted.current=true;
   return ()=>{mounted.current=false;for(const entry of windows.current.values())entry.child?.close();windows.current.clear();};
 },[]);
 const openProject=async run=>{
   if(!api.productionWindowTicket||!run)return;
   const projectId=run.projectId;
   const existing=windows.current.get(projectId);
   if(existing&&!existing.child?.closed){
     existing.runId=run.id;existing.child?.focus();refresh(v=>v+1);return;
   }
   const entry={runId:run.id,child:null};
   windows.current.set(projectId,entry);
   try{
     const ticket=await api.productionWindowTicket();
     if(!mounted.current||windows.current.get(projectId)!==entry)return;
     const child=window.open('about:blank',ticket);
     if(!child)throw Error('未能打开制作项目窗口，请从运行进度重试。');
     entry.child=child;
     const doc=child.document;
     doc.title=(state.directorProjects?.find(p=>p.id===projectId)?.name||run.name||'制作项目')+' · 行舟影视';
     doc.documentElement.lang='zh-CN';
     for(const style of document.querySelectorAll('style,link[rel="stylesheet"]')){
       const copy=style.cloneNode(true);
       if(style.tagName==='LINK')copy.href=style.href;
       doc.head.appendChild(copy);
     }
     const closed=()=>{
       if(windows.current.get(projectId)!==entry)return;
       windows.current.delete(projectId);
       if(mounted.current)refresh(v=>v+1);
     };
     child.addEventListener('pagehide',closed,{once:true});
     child.focus();refresh(v=>v+1);
   }catch(error){windows.current.delete(projectId);entry.child?.close();throw error;}
 };
 const runs=production?.snapshot()||[];
 const views=[...windows.current.entries()].map(([projectId,{runId,child}])=>{
   const run=runs.find(r=>r.projectId===projectId&&r.id===runId);
   if(!run||!child||child.closed)return null;
   return createPortal(<ProjectView key={run.id} {...{run,account,state,setState,production,api}}/>,child.document.body,projectId);
 });
 return {openProject:api.productionWindowTicket?openProject:null,views};
}

import React,{useState,useEffect} from 'react';
export function useWindowModel(scope,profiles,defaultId){
 const fallback=()=>profiles.find(p=>p.id===defaultId)?.id||profiles[0]?.id||'';
 const read=()=>{try{return localStorage.getItem('xz-model:'+scope)||fallback();}catch{return fallback();}};
 const [selection,setSelection]=useState(()=>({scope,id:read()}));
 const id=selection.scope===scope?selection.id:read();
 const choose=id=>{try{localStorage.setItem('xz-model:'+scope,id);}catch{}setSelection({scope,id});};
 useEffect(()=>{if(selection.scope!==scope)setSelection({scope,id:read()});else if(!id&&profiles.length)choose(fallback());else if(id){try{if(!localStorage.getItem('xz-model:'+scope))localStorage.setItem('xz-model:'+scope,id);}catch{}}},[scope,id,profiles.length]);
 return [id,choose,profiles.find(p=>p.id===id)];
}
export function ModelSelect({profiles,value,onChange,label='调用模型',disabled=false}){
 return <label className="window-model-select">{label}<select aria-label={label} value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value)}>
 {!profiles.some(p=>p.id===value)&&<option value={value||''}>{value?'接口已移除，请重新选择':'请选择已配置的接口'}</option>}
 {profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}{p.provider==='codexLocal'?` · ${p.reasoningEffort||'medium'}`:''}</option>)}
 </select></label>;
}

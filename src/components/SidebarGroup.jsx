import React,{useId,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import './sidebar-group.css';

export function SidebarGroup({label,Icon,active,selected,items,onNavigate,onSelect}){
 const [hovered,setHovered]=useState(false),[pinned,setPinned]=useState(false),[focused,setFocused]=useState(false);
 const id=useId(),open=hovered||pinned||focused;
 return <div className={`sidebar-group ${open?'expanded':''}`} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocus={()=>setFocused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}} onKeyDown={e=>{if(e.key==='Escape'){setPinned(false);setHovered(false);setFocused(false);e.currentTarget.querySelector('.sidebar-group-trigger')?.focus();setFocused(false);}}}>
  <button type="button" className={`sidebar-group-trigger ${active?'active':''}`} aria-label={label} title={label} aria-expanded={open} aria-controls={id} onClick={()=>{setPinned(v=>!v);onNavigate();}}><Icon size={19}/><span>{label}</span><ChevronDown className="sidebar-group-chevron" size={14}/></button>
  <div id={id} className="sidebar-subnav-motion" aria-hidden={!open} inert={!open}><div className="sidebar-subnav" aria-label={`${label}分类`}>{items.map(item=><button type="button" key={item.id} className={active&&selected===item.id?'active':''} aria-current={active&&selected===item.id?'page':undefined} onClick={()=>onSelect(item.id)}><span className="sidebar-subnav-dot"/><span>{item.label}</span></button>)}</div></div>
 </div>;
}

import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {UserRound,Film,PenLine,Check,LockKeyhole,ChevronRight} from 'lucide-react';
import './quick-role-switch.css';

export function QuickRoleSwitch({role,account,onSelect,onChooseScreen}){
 const [position,setPosition]=useState(null),trigger=useRef(null),menu=useRef(null),timer=useRef(null),suppressFocus=useRef(false),id=useId();
 const close=()=>{clearTimeout(timer.current);setPosition(null);};
 const open=()=>{clearTimeout(timer.current);const r=trigger.current?.getBoundingClientRect();if(r)setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-232)),bottom:Math.max(8,window.innerHeight-r.top+8)});};
 const later=()=>{clearTimeout(timer.current);timer.current=setTimeout(close,180);};
 useEffect(()=>{close();},[role,account?.id]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useEffect(()=>{
  if(!position)return;
  const outside=e=>{if(!trigger.current?.contains(e.target)&&!menu.current?.contains(e.target))close();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();close();suppressFocus.current=true;trigger.current?.focus();suppressFocus.current=false;}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);window.addEventListener('resize',close);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',close);};
 },[position]);
 const keepFocus=e=>{if(!menu.current?.contains(e.relatedTarget)&&!trigger.current?.contains(e.relatedTarget))later();};
 return <><button ref={trigger} type="button" aria-label="切换身份" title="快速切换身份" aria-haspopup="menu" aria-expanded={!!position} aria-controls={position?id:undefined} onMouseEnter={open} onMouseLeave={later} onFocus={()=>{if(!suppressFocus.current)open();}} onBlur={keepFocus} onClick={open} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();requestAnimationFrame(()=>menu.current?.querySelector('button:not(:disabled)')?.focus());}}}><UserRound size={18}/><span>切换身份</span><ChevronRight className="quick-role-arrow" size={14}/></button>
 {position&&createPortal(<div ref={menu} id={id} className="role-switch-menu" role="menu" aria-label="快速切换身份" style={position} onMouseEnter={()=>clearTimeout(timer.current)} onMouseLeave={later} onBlur={keepFocus} onFocus={()=>clearTimeout(timer.current)} onKeyDown={e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...menu.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}}>
  <strong>切换工作身份</strong><small>共用工具保留当前页面</small>
  {[['creator','内容创作者',PenLine],['director','导演',Film]].map(([key,label,Icon])=><button type="button" role="menuitem" key={key} disabled={role===key} aria-label={`切换到${label}`} onClick={()=>{close();onSelect(key);}}><Icon size={17}/><span>{label}</span>{role===key?<Check size={15}/>:!account.roles.includes(key)?<LockKeyhole size={14}/>:<ChevronRight size={14}/>}</button>)}
  <button type="button" role="menuitem" className="role-screen-link" onClick={()=>{close();onChooseScreen();}}>返回身份选择页</button>
 </div>,document.body)}</>;
}

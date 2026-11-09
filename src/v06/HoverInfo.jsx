import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './editor-polish.css';
export default function HoverInfo({children,content,className='',label,buttonProps={}}){
 const id=useId(),trigger=useRef(null),panel=useRef(null),timer=useRef(null),[open,setOpen]=useState(false),[position,setPosition]=useState({left:8,top:8});
 const cancel=()=>clearTimeout(timer.current),show=()=>{cancel();setOpen(true);};
 const leave=()=>{cancel();timer.current=setTimeout(()=>{if(!trigger.current?.matches(':hover')&&!panel.current?.matches(':hover')&&document.activeElement!==trigger.current)setOpen(false);},120);};
 useEffect(()=>()=>cancel(),[]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const a=trigger.current?.getBoundingClientRect(),b=panel.current?.getBoundingClientRect();if(a&&b)setPosition({left:Math.max(8,Math.min(a.right-b.width,innerWidth-b.width-8)),top:a.bottom+6+b.height<innerHeight-8?a.bottom+6:Math.max(8,a.top-b.height-6)});};
  place();const escape=e=>{if(e.key==='Escape'){e.stopPropagation();cancel();setOpen(false);}};
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);document.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('keydown',escape);};
 },[open,content]);
 return <><button {...buttonProps} ref={trigger} type="button" className={`hover-info-trigger ${className}`} aria-label={label||buttonProps['aria-label']} aria-describedby={open?id:undefined} onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={()=>{cancel();setOpen(false);}} onClick={event=>{show();buttonProps.onClick?.(event);}}>{children}</button>{open&&createPortal(<div ref={panel} id={id} className="hover-info-panel" role="tooltip" style={position} onMouseEnter={cancel} onMouseLeave={leave}>{content}</div>,document.body)}</>;
}

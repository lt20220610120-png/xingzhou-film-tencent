import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {CircleAlert} from 'lucide-react';
import {useWorkspaceActive} from '../components/WorkspacePresence.jsx';

export default function StoryboardMaterialHint({label,issues,count,entryLabel,onLocate}){
 const active=useWorkspaceActive(),id=useId();
 const trigger=useRef(null),panel=useRef(null),action=useRef(null),timer=useRef(null);
 const pinned=useRef(false),restoringFocus=useRef(false);
 const [open,setOpen]=useState(false);
 const cancelClose=()=>clearTimeout(timer.current);
 const contains=node=>trigger.current?.contains(node)||panel.current?.contains(node);
 const show=()=>{cancelClose();setOpen(true);};
 const close=(restore=false)=>{
  cancelClose();pinned.current=false;setOpen(false);
  if(restore){
   restoringFocus.current=true;
   trigger.current?.focus({preventScroll:true});
   restoringFocus.current=false;
  }
 };
 const leave=()=>{
  cancelClose();
  timer.current=setTimeout(()=>{
   if(!pinned.current&&!contains(document.activeElement)&&!trigger.current?.matches(':hover')&&!panel.current?.matches(':hover'))close();
  },220);
 };
 const activate=event=>{
  if(pinned.current){close();return;}
  pinned.current=true;show();
  if(event.detail===0){
   if(action.current?.getClientRects().length)action.current.focus({preventScroll:true});
   else requestAnimationFrame(()=>{if(pinned.current)action.current?.focus({preventScroll:true});});
  }
 };
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useEffect(()=>{if(!active)close();},[active]);
 useLayoutEffect(()=>{
  if(!open||!active)return;
  const popup=panel.current,anchor=trigger.current;
  const place=()=>{
   const anchorBox=anchor.getBoundingClientRect();
   if(anchorBox.bottom<0||anchorBox.top>innerHeight){close();return;}
   const popupBox=popup.getBoundingClientRect(),edge=8,gap=4;
   const below=anchorBox.bottom+gap,above=anchorBox.top-popupBox.height-gap;
   popup.style.left=`${Math.max(edge,Math.min(anchorBox.left,innerWidth-popupBox.width-edge))}px`;
   popup.style.top=`${Math.max(edge,Math.min(below+popupBox.height<=innerHeight-edge?below:above,innerHeight-popupBox.height-edge))}px`;
  };
  const outside=event=>{if(!contains(event.target))close();};
  const escape=event=>{
   if(event.key!=='Escape'||event.target.closest?.('select:open'))return;
   event.preventDefault();event.stopPropagation();close(panel.current?.contains(document.activeElement));
  };
  popup.showPopover();place();
  const observer=new ResizeObserver(place);observer.observe(popup);observer.observe(anchor);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
  return()=>{
   observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);
   document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);
   if(popup.matches(':popover-open'))popup.hidePopover();
  };
 },[open,active]);
 return <>
  <button ref={trigger} type="button" className="storyboard-material-trigger" aria-label={`查看${entryLabel}的${label}详情`}
   aria-haspopup="dialog" aria-controls={id} aria-expanded={active&&open} aria-describedby={active&&open?`${id}-message`:undefined}
   onMouseEnter={show} onMouseLeave={leave} onFocus={()=>{if(!restoringFocus.current)show();}} onBlur={leave} onClick={activate}>
   <CircleAlert size={16} aria-hidden="true"/>
  </button>
  <section ref={panel} popover="manual" id={id} role="dialog" aria-label={label} className="storyboard-material-popover"
   onMouseEnter={cancelClose} onMouseLeave={leave} onFocus={cancelClose} onBlur={leave}>
   <p id={`${id}-message`}><strong>{label}</strong>：{issues.join('；')||'提示词关联尚未发布'} · 当前素材 {count} 项</p>
   {onLocate&&<button ref={action} className="storyboard-material-locate" type="button" onClick={()=>{close();onLocate();}}>定位清单中的 {entryLabel}</button>}
  </section>
 </>;
}

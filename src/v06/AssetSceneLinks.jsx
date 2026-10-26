import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

export default function AssetSceneLinks({sceneIds=[],promptIds=[],promptMode=false,name}){
 const title=promptMode?'对应提示词':'对应场景';
 const id=useId(),trigger=useRef(null),panel=useRef(null),timer=useRef(),pinned=useRef(false),skipFocus=useRef(false);
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:12,top:12});
 const cancel=()=>clearTimeout(timer.current);
 const show=()=>{cancel();setOpen(true);};
 const enter=()=>{pinned.current=true;show();requestAnimationFrame(()=>panel.current?.querySelector('.asset-scene-links-list')?.focus());};
 const close=(restore=false)=>{cancel();pinned.current=false;setOpen(false);if(restore&&document.activeElement!==trigger.current){skipFocus.current=true;trigger.current?.focus();skipFocus.current=false;}};
 const leave=()=>{cancel();if(!pinned.current)timer.current=setTimeout(()=>setOpen(false),160);};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const rect=trigger.current?.getBoundingClientRect(),box=panel.current?.getBoundingClientRect();if(rect&&box)setPosition({left:Math.max(12,Math.min(rect.left,innerWidth-box.width-12)),top:Math.max(12,Math.min(rect.bottom+6,innerHeight-box.height-12))});};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,sceneIds,promptIds,promptMode]);
 useEffect(()=>{
  if(!open)return;
  const outside=e=>{if(!trigger.current?.contains(e.target)&&!panel.current?.contains(e.target))close();};
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(panel.current?.contains(document.activeElement));}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
 },[open]);
 return <>
  <button ref={trigger} type="button" className="asset-scene-links-trigger" aria-label={`查看${name}的${title}`} aria-haspopup="dialog" aria-controls={open?id:undefined} aria-expanded={open}
   onMouseEnter={show} onMouseLeave={leave} onFocus={()=>{if(!skipFocus.current)show();}} onBlur={leave}
   onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();enter();}}}
   onClick={e=>{if(pinned.current)close();else if(e.detail===0)enter();else{pinned.current=true;show();}}}>{title}</button>
  {open&&createPortal(<section ref={panel} id={id} role="dialog" aria-label={`${name}的${title}`} className="asset-scene-links-popover" style={position} onMouseEnter={cancel} onMouseLeave={leave} onFocus={cancel} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))leave();}}>
   <header><b>{title}</b><button type="button" aria-label={`关闭${title}`} onClick={()=>close(true)}><X size={14}/></button></header>
   <div className="asset-scene-links-list" tabIndex={0} aria-label={`${title}列表`}>{(promptMode?promptIds:sceneIds).map((value,index)=><span key={`${value}:${index}`}>{value}</span>)}{promptMode&&!promptIds.length&&<small>尚未分发到提示词</small>}</div>{promptMode&&!!sceneIds.length&&<><small className="asset-scene-links-parent">所属场景</small><div className="asset-scene-links-list" aria-label="所属场景列表">{sceneIds.map(value=><span key={value}>{value}</span>)}</div></>}
  </section>,document.body)}
 </>;
}

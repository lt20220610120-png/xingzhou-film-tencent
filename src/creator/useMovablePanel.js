import {useLayoutEffect,useRef,useState} from 'react';

// The header moves the panel; fields and buttons retain their normal behavior.
export function useMovablePanel(storageKey,label,open=true) {
 const panelRef=useRef(null),drag=useRef(null),current=useRef(null);
 const [position,setPosition]=useState(null),[dragging,setDragging]=useState(false);
 const clamp=point=>{
  const rect=panelRef.current?.getBoundingClientRect();if(!rect)return point;
  return {x:Math.max(8,Math.min(point.x,Math.max(8,window.innerWidth-rect.width-8))),y:Math.max(8,Math.min(point.y,Math.max(8,window.innerHeight-rect.height-8)))};
 };
 const move=point=>{const next=clamp(point);current.current=next;setPosition(next);};
 const remember=()=>{if(storageKey&&current.current)try{localStorage.setItem(storageKey,JSON.stringify(current.current));}catch{}};
 useLayoutEffect(()=>{
  let saved;try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}
  if(Number.isFinite(saved?.x)&&Number.isFinite(saved?.y))move(saved);
  const resize=()=>{if(current.current)move(current.current);};
  window.addEventListener('resize',resize);
  const observer=new ResizeObserver(resize);if(panelRef.current)observer.observe(panelRef.current);
  return ()=>{window.removeEventListener('resize',resize);observer.disconnect();};
 },[storageKey,open]);
 const finish=e=>{if(drag.current?.id!==e.pointerId)return;drag.current=null;setDragging(false);remember();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
 return {panelRef,dragging,style:position?{position:'fixed',left:position.x,top:position.y,right:'auto',bottom:'auto',margin:0,transform:'none'}:undefined,
  handleProps:{tabIndex:0,role:'toolbar','aria-label':`移动${label}`,title:'拖动标题栏移动窗口；方向键也可移动',className:`movable-panel-handle ${dragging?'dragging':''}`,
   onPointerDown:e=>{if(e.button!==0||e.target.closest('button,input,textarea,select,a,summary'))return;const rect=panelRef.current.getBoundingClientRect();e.preventDefault();e.currentTarget.focus({preventScroll:true});drag.current={id:e.pointerId,dx:e.clientX-rect.left,dy:e.clientY-rect.top};move({x:rect.left,y:rect.top});e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);},
   onPointerMove:e=>{const d=drag.current;if(d?.id===e.pointerId)move({x:e.clientX-d.dx,y:e.clientY-d.dy});},
   onPointerUp:finish,onPointerCancel:finish,onLostPointerCapture:e=>{if(drag.current?.id===e.pointerId){drag.current=null;setDragging(false);remember();}},
   onKeyDown:e=>{if(e.target!==e.currentTarget)return;const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();const rect=panelRef.current.getBoundingClientRect(),step=e.shiftKey?40:10;move({x:rect.left+d[0]*step,y:rect.top+d[1]*step});remember();}
  }};
}

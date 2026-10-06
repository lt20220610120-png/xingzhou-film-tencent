import {useState,useRef,useLayoutEffect} from 'react';
import {floatingPanelGeometry} from '../../core/floatingPanel.js';

export function useFloatingAgent(projectId,open) {
 const storageKey=`xz-rewrite-agent-position:${projectId}`;
 const measure=position=>floatingPanelGeometry({viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,
  sidebarRight:document.getElementById('app-sidebar')?.getBoundingClientRect().right||0,position});
 const customized=useRef(false);
 const [geometry,setGeometry]=useState(()=>{
  let saved;try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}
  customized.current=Number.isFinite(saved?.x)&&Number.isFinite(saved?.y);
  return measure(saved);
 });
 const current=useRef(geometry),drag=useRef(null);
 const [dragging,setDragging]=useState(false);
 const move=position=>{const next=measure(position);current.current=next;setGeometry(next);};
 const remember=()=>{try{localStorage.setItem(storageKey,JSON.stringify({x:current.current.x,y:current.current.y}));}catch{}};
 useLayoutEffect(()=>{
  const resize=()=>move(customized.current?current.current:undefined);
  resize();window.addEventListener('resize',resize);
  const sidebar=document.getElementById('app-sidebar');
  const observer=new ResizeObserver(resize);if(sidebar)observer.observe(sidebar);
  return ()=>{window.removeEventListener('resize',resize);observer.disconnect();};
 },[projectId,open]);
 const finish=e=>{
  if(drag.current?.pointerId!==e.pointerId)return;
  drag.current=null;setDragging(false);remember();
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 return {style:{left:geometry.x,top:geometry.y,width:geometry.width,height:geometry.height},dragging,
  handleProps:{tabIndex:0,role:'toolbar','aria-label':'移动项目协作浮窗',title:'拖住此处移动；方向键也可移动浮窗',
   onPointerDown:e=>{
    if(e.button!==0||e.target.closest('button,input,textarea,select,a'))return;
    customized.current=true;
    e.preventDefault();e.currentTarget.focus({preventScroll:true});
    drag.current={pointerId:e.pointerId,offsetX:e.clientX-current.current.x,offsetY:e.clientY-current.current.y};
    e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);
   },
   onPointerMove:e=>{const d=drag.current;if(d?.pointerId===e.pointerId)move({x:e.clientX-d.offsetX,y:e.clientY-d.offsetY});},
   onPointerUp:finish,onPointerCancel:finish,
   onLostPointerCapture:e=>{if(drag.current?.pointerId===e.pointerId){drag.current=null;setDragging(false);remember();}},
   onKeyDown:e=>{
    if(e.target!==e.currentTarget)return;
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(!direction)return;e.preventDefault();customized.current=true;const step=e.shiftKey?40:10;
    move({x:current.current.x+direction[0]*step,y:current.current.y+direction[1]*step});remember();
   }
  }};
}

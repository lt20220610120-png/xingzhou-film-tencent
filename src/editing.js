import {flushSync} from 'react-dom';
const editors=new Set(),drafts=new Map(),compositionWaiters=new Set();
let quiet=null,deadline=null,compositionTarget=null;
export const registerEditor=(flush,pending=()=>false,endComposition=()=>{})=>{const editor={flush,pending,endComposition};editors.add(editor);return()=>editors.delete(editor);};
export const isEditingComposing=()=>compositionTarget!==null;
export function flushDraftCache(){clearTimeout(quiet);clearTimeout(deadline);quiet=deadline=null;if(isEditingComposing())return;for(const [key,value] of drafts){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));drafts.delete(key);}catch{/* Preserve unsaved memory for a later retry. */}}}
const schedule=()=>{clearTimeout(quiet);quiet=setTimeout(flushDraftCache,1200);if(deadline===null)deadline=setTimeout(flushDraftCache,15000);};
export const queueDraft=(key,value)=>{drafts.set(key,value);if(!isEditingComposing())schedule();};
export const readQueuedDraft=key=>drafts.has(key)?{found:true,value:drafts.get(key)}:{found:false};
export function flushEditing(){for(const editor of [...editors])editor.flush();flushDraftCache();}
export const hasPendingEditing=()=>isEditingComposing()||[...editors].some(editor=>editor.pending());
export async function settleEditing(){
 if(isEditingComposing())await new Promise(resolve=>compositionWaiters.add(resolve));
 flushEditing();return !hasPendingEditing();
}
function endComposition(){
 compositionTarget=null;
 if(drafts.size)schedule();
 for(const resolve of compositionWaiters)setTimeout(resolve,0);
 compositionWaiters.clear();
}
export function interruptEditingComposition(){
 const target=compositionTarget;if(!target)return;
 endComposition();
 for(const editor of [...editors])editor.endComposition();
 document.dispatchEvent(new CustomEvent('xz-composition-interrupted',{detail:target}));
}
if(typeof document!=='undefined'){
 // Flush before action handlers read their state, even when clicking does not
 // blur the editor (e.g. a disabled action becomes enabled by the new text).
 document.addEventListener('pointerdown',event=>{const editing=event.target?.closest?.('input,textarea,[contenteditable=true]');if(!editing)flushSync(flushEditing);},true);
 document.addEventListener('submit',()=>flushSync(flushEditing),true);
 document.addEventListener('compositionstart',event=>{
  if(compositionTarget&&compositionTarget!==event.target)interruptEditingComposition();
  compositionTarget=event.target;clearTimeout(quiet);clearTimeout(deadline);quiet=deadline=null;
 },true);
 document.addEventListener('compositionend',event=>{if(event.target===compositionTarget)endComposition();},true);
 document.addEventListener('focusout',event=>{if(event.target===compositionTarget)interruptEditingComposition();},true);
 document.addEventListener('focusin',event=>{if(compositionTarget&&event.target!==compositionTarget)interruptEditingComposition();},true);
 document.addEventListener('input',event=>{
  if(event.target===compositionTarget&&event.isComposing===false&&!['insertCompositionText','deleteCompositionText'].includes(event.inputType))interruptEditingComposition();
 },true);
 window.addEventListener('blur',interruptEditingComposition);
 const flushOnHide=()=>{interruptEditingComposition();flushEditing();};
 window.addEventListener('pagehide',flushOnHide);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flushOnHide();});
}

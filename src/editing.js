import {flushSync} from 'react-dom';
const editors=new Set(),drafts=new Map();let quiet=null,deadline=null,composing=false;
export const registerEditor=(flush,pending=()=>false)=>{const editor={flush,pending};editors.add(editor);return()=>editors.delete(editor);};
export function flushDraftCache(){clearTimeout(quiet);clearTimeout(deadline);quiet=deadline=null;if(composing)return;for(const [key,value] of drafts){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));drafts.delete(key);}catch{/* Preserve unsaved memory for a later retry. */}}}
const schedule=()=>{clearTimeout(quiet);quiet=setTimeout(flushDraftCache,1200);if(deadline===null)deadline=setTimeout(flushDraftCache,15000);};
export const queueDraft=(key,value)=>{drafts.set(key,value);if(!composing)schedule();};
export const readQueuedDraft=key=>drafts.has(key)?{found:true,value:drafts.get(key)}:{found:false};
export function flushEditing(){for(const editor of [...editors])editor.flush();flushDraftCache();}
export const hasPendingEditing=()=>composing||[...editors].some(editor=>editor.pending());
export async function settleEditing(){
 if(composing)await new Promise(resolve=>{const end=()=>{document.removeEventListener('compositionend',end);setTimeout(resolve,0);};document.addEventListener('compositionend',end);});
 flushEditing();return !hasPendingEditing();
}
if(typeof document!=='undefined'){
 // Flush before action handlers read their state, even when clicking does not
 // blur the editor (e.g. a disabled action becomes enabled by the new text).
 document.addEventListener('pointerdown',event=>{const editing=event.target?.closest?.('input,textarea,[contenteditable=true]');if(!editing)flushSync(flushEditing);},true);
 document.addEventListener('submit',()=>flushSync(flushEditing),true);
 document.addEventListener('compositionstart',()=>{composing=true;clearTimeout(quiet);clearTimeout(deadline);quiet=deadline=null;},true);
 document.addEventListener('compositionend',()=>{composing=false;if(drafts.size)schedule();},true);
 window.addEventListener('pagehide',flushEditing);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flushEditing();});
}

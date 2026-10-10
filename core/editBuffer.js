// Delay expensive document conversion until typing pauses. Keep a bounded
// checkpoint, and never commit an unfinished input-method composition.
export function createEditBuffer({read,commit,delay=1200,maxWait=15000,setTimer=setTimeout,clearTimer=clearTimeout}) {
 let dirty=false,composing=false,quiet=null,deadline=null;
 const clear=()=>{clearTimer(quiet);clearTimer(deadline);quiet=deadline=null;};
 const flush=()=>{if(composing)return false;clear();if(!dirty)return false;dirty=false;commit(read());return true;};
 const schedule=()=>{clearTimer(quiet);quiet=setTimer(flush,delay);if(deadline===null)deadline=setTimer(flush,maxWait);};
 return {
  input(){dirty=true;if(!composing)schedule();},
  flush,
  compositionStart(){composing=true;clear();},
  compositionEnd(){composing=false;if(dirty)schedule();},
  cancel(){dirty=false;clear();},
  pending:()=>dirty,
 };
}

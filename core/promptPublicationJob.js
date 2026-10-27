import {reviewPromptScope} from './promptReviewBatch.js';

const jobs=new WeakMap();
// View-independent owner: unsubscribing a page never stops the publication.
// Cloud receipts and per-episode review checkpoints remain in the existing stores.
export function createPromptPublicationJob(run=reviewPromptScope){
 let state={running:false},promise;const listeners=new Set();
 const emit=patch=>{state={...state,...patch};for(const fn of listeners)try{fn();}catch{}};
 return {
  snapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  start(options){
   if(promise)return promise;
   emit({running:true,startedAt:Date.now(),finishedAt:null,phase:'preparing',result:null,error:'',total:0,done:0,active:[],items:[]});
   // Assign the promise before calling run, including synchronous failure paths.
   promise=Promise.resolve().then(()=>run({...options,onProgress:value=>emit(value)})).then(result=>{emit({running:false,phase:'complete',finishedAt:Date.now(),result});return result;},error=>{emit({running:false,phase:'failed',finishedAt:Date.now(),error:error.message});throw error;}).finally(()=>{promise=null;});
   return promise;
  }
 };
}
export function getPromptPublicationJob(api,accountId,projectId){
 let scoped=jobs.get(api);if(!scoped){scoped=new Map();jobs.set(api,scoped);}const key=JSON.stringify([accountId,projectId]);
 if(!scoped.has(key))scoped.set(key,createPromptPublicationJob());return scoped.get(key);
}

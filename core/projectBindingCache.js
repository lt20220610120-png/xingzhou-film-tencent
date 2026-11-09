import {activeDirectorEditionId} from './directorPromptEditions.js';

export function createProjectBindingCache(){
 let state={data:null,loading:true,error:''},inputs=null,pending=null,epoch=0;const listeners=new Set();
 const emit=value=>{state=value;for(const fn of listeners)fn();};
 return {snapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  hasSubscribers:()=>listeners.size>0,
  invalidate(clear=false){epoch++;inputs=null;pending=null;if(clear)emit({data:null,loading:true,error:''});},
  load(next,read){
   if(inputs?.length===next.length&&inputs.every((value,i)=>value===next[i]))return pending||Promise.resolve(state.data);
   inputs=next;const version=++epoch;emit({...state,loading:!state.data,error:''});
   let result;try{result=read();}catch(error){result=Promise.reject(error);}
   const work=Promise.resolve(result).then(data=>{if(version===epoch)emit({data,loading:false,error:''});return data;},error=>{
    if(version!==epoch)return;
    inputs=null;
    const message=error?.message||String(error),denied=[error?.status,error?.statusCode,error?.code].some(code=>[401,403,'401','403','PROJECT_ACCESS_DENIED','UNAUTHORIZED','FORBIDDEN'].includes(code))||/project_access_denied|\b(?:401|403)\b|forbidden|unauthorized|没有.*权限|无权|账号.*切换|登录状态|请先登录|资料目录.*变化/i.test(message);
    emit({data:denied||!state.data?{error:message}:state.data,loading:false,error:message});
   }).finally(()=>{if(version===epoch)pending=null;});pending=work;return work;
  },
 };
}
const scopes=new WeakMap(),registry=new Set(),storageListeners=new Set();let storageEpoch=0;
export const bindingStorageEpoch=()=>storageEpoch;
export function subscribeBindingStorage(fn){storageListeners.add(fn);return()=>storageListeners.delete(fn);}
export function resetBindingStorage(){storageEpoch++;for(const row of registry){row.cache.invalidate(true);row.entries.delete(row.key);}registry.clear();for(const fn of storageListeners)fn();}
if(typeof window!=='undefined')window.addEventListener('xz-storage-changed',resetBindingStorage);
export const projectBindingScope=(project,source)=>JSON.stringify([project.director_project_id||'',activeDirectorEditionId(project)||'legacy',activeDirectorEditionId(source)||'legacy',storageEpoch]);
export function invalidateProjectBindings(accountId,projectId){for(const row of registry)if(row.accountId===accountId&&row.projectId===projectId)row.cache.invalidate();}
export function projectBindingCache(api,accountId,projectId,scope=''){
 let entries=scopes.get(api);if(!entries){entries=new Map();scopes.set(api,entries);}const key=JSON.stringify([accountId,projectId,scope,storageEpoch]);
 let row=entries.get(key);if(!row){row={accountId,projectId,key,entries,cache:createProjectBindingCache()};entries.set(key,row);}
 registry.delete(row);registry.add(row);
 // Retain at most twelve inactive views across accounts/projects/editions.
 let inactive=[...registry].filter(item=>!item.cache.hasSubscribers());while(inactive.length>12){const old=inactive.shift();old.cache.invalidate(true);old.entries.delete(old.key);registry.delete(old);}
 return row.cache;
}

import {useSyncExternalStore} from 'react';
const scopes=new Map();
export function useAssetImageActivity(projectId){
 if(!scopes.has(projectId))scopes.set(projectId,{ids:new Set(),ref:{current:new Set()},listeners:new Set()});
 const scope=scopes.get(projectId);
 const ids=useSyncExternalStore(listener=>{scope.listeners.add(listener);return()=>scope.listeners.delete(listener);},()=>scope.ids);
 const update=change=>{scope.ids=typeof change==='function'?change(scope.ids):change;for(const notify of scope.listeners)notify();};
 return [ids,update,scope.ref];
}

import {useSyncExternalStore} from 'react';
import {subscribeBindingStorage} from '../../core/projectBindingCache.js';
const scopes=new Map();
subscribeBindingStorage(()=>scopes.clear());
export function useAssetImageActivity(projectId,accountId){
 const key=JSON.stringify([accountId,projectId]);
 if(!scopes.has(key))scopes.set(key,{ids:new Set(),ref:{current:new Set()},listeners:new Set()});
 const scope=scopes.get(key);
 const ids=useSyncExternalStore(listener=>{scope.listeners.add(listener);return()=>scope.listeners.delete(listener);},()=>scope.ids);
 const update=change=>{scope.ids=typeof change==='function'?change(scope.ids):change;for(const notify of scope.listeners)notify();};
 return [ids,update,scope.ref];
}

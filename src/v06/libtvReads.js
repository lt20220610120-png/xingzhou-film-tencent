import {useCallback,useEffect,useRef,useSyncExternalStore} from 'react';
import {useWorkspaceActive} from '../components/WorkspacePresence.jsx';

const scopes=new WeakMap();
const noApi={};
const empty={value:null,error:null,loadedAt:0,retryAt:0,revision:0};
const freshMs=60000;
const retryMs=8000;

function entryFor(api,group,key){
 let entries=scopes.get(api);
 if(!entries){entries=new Map();scopes.set(api,entries);}
 const id=JSON.stringify([group,key]);
 let entry=entries.get(id);
 if(!entry){
  const listeners=new Set();
  entry={group,value:empty,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
   notify(state){entry.value=state;for(const listener of listeners)listener();},
   snapshot:()=>entry.value,active:()=>listeners.size>0};
  entries.set(id,entry);
 }
 for(const [oldId,old] of entries){
  if(entries.size<=100)break;
  if(old!==entry&&!old.active()&&!old.work)entries.delete(oldId);
 }
 return entry;
}

function read(entry,loader,force){
 const previous=entry.value,now=Date.now(),revision=previous.revision;
 if(entry.work)return entry.work;
 if(!force&&(now<previous.retryAt||previous.loadedAt&&now-previous.loadedAt<freshMs))return Promise.resolve(previous.value);
 const work=Promise.resolve().then(loader).then(value=>{
  if(entry.value.revision===revision)entry.notify({value,error:null,loadedAt:Date.now(),retryAt:0,revision});
  return value;
 },error=>{
  if(entry.value.revision===revision)entry.notify({...previous,error,retryAt:Date.now()+retryMs});
  throw error;
 }).finally(()=>{if(entry.work===work)entry.work=null;});
 entry.work=work;
 return work;
}

export function invalidateLibTVReads(api,{group,preserve=false}={}){
 for(const entry of scopes.get(api)?.values()||[]){
  if(group&&entry.group!==group)continue;
  const revision=entry.value.revision+1,value=preserve?entry.value.value:null;
  entry.work=null;
  entry.notify({...empty,value,revision});
 }
}

export function useLibTVRead(api,group,key,loader,enabled=true){
 const active=useWorkspaceActive(),entry=entryFor(api||noApi,group,key),latest=useRef(loader);
 latest.current=loader;
 const state=useSyncExternalStore(entry.subscribe,entry.snapshot,entry.snapshot);
 useEffect(()=>{
  if(active&&enabled)void read(entry,()=>latest.current(),false).catch(()=>{});
 },[active,enabled,entry,state.revision]);
 const refresh=useCallback(()=>read(entry,()=>latest.current(),true),[entry]);
 return {...state,refresh};
}

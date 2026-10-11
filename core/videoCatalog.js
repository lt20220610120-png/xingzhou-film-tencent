import builtins from './feituo-models.json' with {type:'json'};
import {normalizeCapabilities} from './modelCapabilities.js';
export const ftEndpoint=address=>{try{return new URL(address).hostname==='feituokuajing.com';}catch{return false;}};
export function profileModels(profile,kind=profile.kind){
 if(profile.provider==='libtv')return (profile.modelCatalog||[]).filter(m=>m.kind===kind);
 // Dynamic protocol support in this release is for video; keep the established
 // image interface and its builtin provider capabilities unchanged.
 if(kind!=='video')return ftEndpoint(profile.endpoint)?builtins.filter(m=>m.kind===kind):[{id:profile.model,name:profile.model,kind,...normalizeCapabilities(profile.capabilities)}];
 const supplied=Array.isArray(profile.modelCatalog)?profile.modelCatalog.filter(m=>(m.kind||m.type)===kind&&typeof m.id==='string'):[];
 const rows=supplied.length?supplied:(ftEndpoint(profile.endpoint)?builtins.filter(m=>m.kind===kind):[]);
 const byId=new Map(rows.map(m=>{const flat={...m,...normalizeCapabilities(m.capabilities||m)};delete flat.capabilities;return [m.id,flat];}));
 if(profile.model){const current=byId.get(profile.model);byId.set(profile.model,{id:profile.model,name:profile.model,kind,...current,...normalizeCapabilities(profile.capabilities)});}
 return [...byId.values()];
}
export function resolveVideoModel(profile,id){return profileModels(profile,'video').find(m=>m.id===id)||{id:id||profile.model,name:id||profile.model,kind:'video',...normalizeCapabilities(profile.capabilities)};}

import models from './feituo-models.json' with {type:'json'};
import {generationMediaProfiles,isFeituoEndpoint} from './canvasStore.js';
export function mediaModelChoices(state,kind){
 return generationMediaProfiles(state,kind).flatMap(p=>(isFeituoEndpoint(p.endpoint)?models.filter(m=>m.kind===kind):[{id:p.model,name:p.model}]).map(m=>({...p,id:JSON.stringify([p.id,m.id]),profileId:p.id,model:m.id,name:`${p.name} · ${m.name}`})));
}

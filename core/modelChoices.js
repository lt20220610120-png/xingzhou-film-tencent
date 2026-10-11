import {profileModels} from './videoCatalog.js';
import {generationMediaProfiles} from './canvasStore.js';
export function mediaModelChoices(state,kind){
 return generationMediaProfiles(state,kind).flatMap(p=>profileModels(p,kind).map(m=>({...p,id:JSON.stringify([p.id,m.id]),profileId:p.id,model:m.id,name:`${p.name} · ${m.name}${m.legacy?'（旧型号，需核对上游可用性）':''}`})));
}

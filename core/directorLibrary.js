import {parseMasterScript,splitFullScript} from './scriptImport.js';
const uid=()=>`library-director-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export function prepareLibraryDirector(state,item) {
  const existing=state.directorProjects.find(p=>p.sourceType==='library'&&p.sourceId===item.id);
  if(existing)return {state,project:existing};
  if(!item.content?.trim())throw new Error('剧本库作品没有正文');
  const parsed=parseMasterScript(item.content),blocks=parsed.episodes.length?parsed.episodes:splitFullScript(item.content).episodes;
  const timestamp=new Date().toISOString();
  const project={id:uid(),name:item.name,sourceId:item.id,sourceType:'library',sourceLibraryVersionId:item.versions?.at(-1)?.id||null,groupId:'director-workbench',masterScript:item.content,
    episodes:blocks.map(ep=>({...ep,id:uid(),prompts:[],status:'待导演处理'})),createdAt:timestamp,updatedAt:timestamp};
  return {state:{...state,directorProjects:[project,...state.directorProjects]},project};
}

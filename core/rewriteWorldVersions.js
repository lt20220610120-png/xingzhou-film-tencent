import {readWorldCandidate,rewriteWorldInput} from './rewriteWorld.js';
import {validateRewriteOutline} from './rewriteOutline.js';
import {storySourceOptions,referenceKey} from './rewriteStory.js';
import {updateCreatorProject,updateCreatorSection,creatorInputFingerprint} from './creatorWorkspace.js';

const uid=()=>`world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const project=(state,id)=>{const p=state.scriptProjects.find(p=>p.id===id);if(!p||p.creator?.mode!=='rewrite')throw new Error('找不到洗稿项目。');return p;};
export const rewriteOutlineVersions=p=>p.creator?.rewrite?.outlineVersions||[];
const save=(state,id,versions,patch={})=>updateCreatorProject(state,'script',id,{rewrite:{...project(state,id).creator.rewrite,outlineVersions:versions,...patch}});
const number=versions=>Math.max(0,...versions.map(v=>v.number||0))+1;

export function addWorldSimulationVersion(state,id,recordId) {
 const p=project(state,id),versions=rewriteOutlineVersions(p),record=p.creator.records.find(r=>r.id===recordId);
 if(versions.some(v=>v.recordId===recordId))return state;
 if(record?.target?.task!=='rewriteWorldSim'||record.status!=='pending')throw new Error('模拟未完成，不能保存为大纲版本。');
 const result=readWorldCandidate(record.output);
 const sources=storySourceOptions(p).filter(s=>record.target.sourceIds?.includes(s.sourceId));
 for(const group of result.outline.groups)for(const event of group.events)if(event.references?.some(r=>!sources.some(s=>referenceKey(s)===referenceKey(r))))throw new Error('模拟包含无法对应的参考事件，原始结果已留在历史，请修正引用后重试。');
 const version={id:`world-${recordId}`,number:number(versions),name:result.title,createdAt:record.createdAt,recordId,target:record.target,
  output:JSON.stringify(result.outline),originalOutput:record.output,instruction:record.instruction,
  changeSummary:result.changeSummary,constraintsCheck:result.constraintsCheck,inputFingerprint:record.inputFingerprint,
  inputSnapshot:record.worldInputSnapshot||rewriteWorldInput(p,record.target)};
 return save(state,id,[...versions,version]);
}
export function saveCurrentOutlineVersion(state,id,{versionId=uid()}={}) {
 const p=project(state,id),versions=rewriteOutlineVersions(p),output=JSON.stringify(validateRewriteOutline(p.creator.sections.macroOutline?.output));
 const target={section:'macroOutline',side:'output',task:'rewriteWorldSim',sourceIds:[],baseVersionId:'current'};
 const version={id:versionId,number:number(versions),name:'人工保存的大纲',createdAt:new Date().toISOString(),output,target,
  inputFingerprint:creatorInputFingerprint(p,target),inputSnapshot:rewriteWorldInput(p,target),changeSummary:'人工保存当前大纲，保留名称、顺序及事件细节。'};
 return save(state,id,[...versions,version]);
}
export function updateOutlineVersion(state,id,versionId,patch) {
 const p=project(state,id),versions=rewriteOutlineVersions(p);
 if(!versions.some(v=>v.id===versionId))throw new Error('大纲版本已移除。');
 const allowed=Object.fromEntries(['name','output'].filter(k=>Object.hasOwn(patch,k)).map(k=>[k,patch[k]]));
 return save(state,id,versions.map(v=>v.id===versionId?{...v,...allowed,editedAt:new Date().toISOString()}:v));
}
export function adoptOutlineVersion(state,id,versionId,{allowStale=false}={}) {
 const p=project(state,id),versions=rewriteOutlineVersions(p),version=versions.find(v=>v.id===versionId);
 if(!version)throw new Error('大纲版本已移除。');
 if(p.creator.sections.macroOutline?.locked)throw new Error('新作大纲已锁定，请先解锁后采用版本。');
 const output=JSON.stringify(validateRewriteOutline(version.output));
 if(!allowStale&&version.inputFingerprint!==creatorInputFingerprint(p,version.target))throw new Error('新作设定、人物、起点或素材已变化，请核对版本并勾选复核后采用。');
 let nextVersions=versions;
 const previous=p.creator.sections.macroOutline?.output;
 if(previous?.trim()&&!versions.some(v=>v.output===previous))nextVersions=[...versions,{id:uid(),number:number(versions),name:'采用前的大纲备份',createdAt:new Date().toISOString(),output:previous,target:version.target,
  inputFingerprint:creatorInputFingerprint(p,version.target),inputSnapshot:rewriteWorldInput(p,version.target),changeSummary:'保留采用新版本之前的人工大纲。'}];
 let next=updateCreatorSection(state,'script',id,'macroOutline',{output,accepted:true,stale:false});
 return save(next,id,nextVersions.map(v=>v.id===versionId?{...v,adoptedAt:new Date().toISOString()}:v),{activeOutlineVersionId:versionId});
}
export function deleteOutlineVersion(state,id,versionId) {
 const p=project(state,id);
 if(p.creator.rewrite?.activeOutlineVersionId===versionId)throw new Error('当前采用的大纲版本不能删除，请先采用其他版本。');
 return save(state,id,rewriteOutlineVersions(p).filter(v=>v.id!==versionId),p.creator.rewrite?.worldConfig?.baseVersionId===versionId?{worldConfig:{...p.creator.rewrite.worldConfig,baseVersionId:'current'}}:{});
}

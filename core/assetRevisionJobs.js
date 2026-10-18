import {buildAssetRevisionMessages,characterBaselineAsset,isCharacterWardrobeVariant,wardrobeDescription} from './collabStore.js';
import {readComposedAssetPrompt,serializeComposedAssetPrompt,projectCharacterComposition} from './artImageComposition.js';
import {withStorageWork} from './storageWork.js';
const stores=new WeakMap();
export const assetRevisionJobs=store=>{if(!stores.has(store))stores.set(store,createAssetRevisionJobs(store));return stores.get(store);};
export function createAssetRevisionJobs(draftStore){
 const jobs=new Map(),listeners=new Map(),key=(p,a)=>JSON.stringify([p,a]);
 const publish=(id,job)=>{jobs.set(id,job);for(const listener of listeners.get(id)||[])listener();return job;};
 const scope=()=>{if(!draftStore.isCurrent())throw Error('账号或资料目录已变化，修改结果未写入其他账号');};
 const manager={
  read:(p,a)=>jobs.get(key(p,a))||null,
  subscribe(p,a,listener){const id=key(p,a);if(!listeners.has(id))listeners.set(id,new Set());listeners.get(id).add(listener);return()=>{listeners.get(id)?.delete(listener);if(!listeners.get(id)?.size)listeners.delete(id);};},
  start({projectId,asset,assets=[],project={},inputDescription,instruction,profile,api,refresh}){
   const id=key(projectId,asset.id),prior=jobs.get(id);if(prior?.status==='running')return prior.promise;
   const original=inputDescription??asset.description??'',settings=readComposedAssetPrompt({...asset,description:original},project.style,projectCharacterComposition(project));
   const root=asset.category==='character'?characterBaselineAsset(asset,assets):null;
   const rootDraft=root&&draftStore.read(projectId,root.id);
   const baseline=rootDraft?{...root,description:rootDraft.content}:root;
   const job=publish(id,{status:'running',instruction,error:'',startedAt:Date.now()});
   job.promise=withStorageWork(async()=>{
    try{
     scope();
     const messages=buildAssetRevisionMessages({instruction,originalContent:settings.content,category:asset.category,baseline:baseline?.id!==asset.id?baseline:null,world:project});
     const raw=await api.aiChat({profileId:profile.profileId||profile.id,protocol:profile.protocol,provider:profile.provider,libtvOwnerKey:profile.libtvOwnerKey,endpoint:profile.endpoint,apiKey:profile.apiKey,model:profile.model,reasoningEffort:profile.reasoningEffort,messages,timeout:600000});
     // The whole workspace can have unmounted during logout. Its old React ref
     // cannot observe the new account, so verify through the desktop bridge too.
     if(api.authSession&&draftStore.accountId!=='local'){
      const account=await api.authSession();if(account?.id!==draftStore.accountId)throw Error('账号已切换，原修改结果不会写入其他账号');
     }
     scope();if(raw&&typeof raw==='object'&&raw.ok===false)throw Error(raw.error||'模型请求失败');
     const output=typeof raw==='string'?raw:raw?.ok===true?raw.output:null;if(!output?.trim())throw Error('模型没有返回新的提示词');
     const content=baseline?.id!==asset.id&&baseline&&isCharacterWardrobeVariant(asset,assets)?wardrobeDescription(baseline,output.trim()):output.trim();
     const description=settings.customized?serializeComposedAssetPrompt({...settings,content}):content;
     if((draftStore.read(projectId,asset.id)?.content??original)!==original)return publish(id,{...job,status:'conflict',description,error:'你已继续编辑，AI结果未覆盖新草稿，可选择采用。'});
     draftStore.write(projectId,asset.id,description);
     await draftStore.save(api,projectId,asset.id,description);scope();
     publish(id,{...job,status:'completed',description,error:''});
     try{await refresh?.();}catch{/* The saved result and draft remain authoritative if refresh fails. */}
    }catch(error){publish(id,{...job,status:'error',error:String(error.message||'AI修改失败')});}
   });return job.promise;
  },
 };return manager;
}

import {editArtReview,isReviewCurrent,isSceneVerified} from './artReview.js';
import {readableCloudError} from './collabAssetDrafts.js';

export async function approveAllArtReviews(store,episodes,actor=''){
 let count=0,skipped=0;
 const changes=episodes.filter(e=>isReviewCurrent(store.snapshot().episodes[e.episodeNumber],e)).map(e=>({number:e.episodeNumber,reduce:r=>{
  const readable=r.scenes.filter(s=>s.mappingReady||s.items.length);
  skipped+=r.scenes.length-readable.length;count+=readable.length;
  if(readable.length===r.scenes.length&&readable.length)return editArtReview(r,{type:'approve-episode'},actor);
  for(const scene of readable)r=editArtReview(r,{type:'approve',sceneId:scene.id},actor);
  return r;
 }}));
 await store.updateMany(changes);return {count,skipped};
}
const projectBlocked=error=>error?.artCheckpointFailure||['EPISODE_IDENTITY_CONFLICT','collab_episode_identity_invalid'].includes(error?.code)||[401,403,410,423].includes(error?.status)||/分集编号无法可靠解析|分集编号.*(?:冲突|重复)|项目已锁定|项目已删除|无权|没有权限|登录已过期/.test(readableCloudError(error));
export async function publishAllArtReviews(store,episodes){
 let count=0,blocked=false;const failures=[],warnings=[];
 for(const episode of episodes){
  const number=episode.episodeNumber,r=store.snapshot().episodes[number];
  if(!isReviewCurrent(r,episode))continue;
  const ids=r.scenes.filter(isSceneVerified).map(s=>s.id);if(!ids.length)continue;
  try{const saved=await store.publish(number,ids);count+=ids.length;warnings.push(...(saved.publicationWarnings||[]).map(w=>typeof w==='string'?w:w.message).filter(Boolean));}
  catch(error){failures.push({episode:number,error:readableCloudError(error)});if(projectBlocked(error)){blocked=true;break;}}
 }
 return {count,blocked,failures,warnings:[...new Set(warnings)]};
}
export function artReviewFailureSummary(failures=[]){
 const groups=new Map();
 for(const row of failures){const message=readableCloudError(row.error);if(!groups.has(message))groups.set(message,[]);groups.get(message).push(row.episode);}
 const lines=[...groups].slice(0,3).map(([message,numbers])=>`第 ${numbers.slice(0,5).join('、')}${numbers.length>5?'…':''} 集${numbers.length>1?`（共 ${numbers.length} 集）`:''}：${message.slice(0,600)}`);
 if(groups.size>3)lines.push(`另有 ${groups.size-3} 类问题，请到清单核实查看。`);
 return lines.join('\n');
}

import {parseArtAnalysis,parseAssetName,readAssetPrompt} from './collabStore.js';
import {parseDirectorScenesReadonly} from './scriptImport.js';

export const ART_REVIEW_SCHEMA=1;
export const ART_REVIEW_MAP_MARKER='【逐场资产对应表】';
export const ART_REVIEW_CATEGORIES={character:'人物',scene:'场景',prop:'道具'};
export const reviewAssetKey=item=>`${item.category}\u0000${item.name}`;
export const reviewName=name=>String(name||'').replace(/^【|】$/g,'');
export const canonicalReviewName=name=>`【${reviewName(name).trim()}】`;
const clone=value=>structuredClone(value);
const identity=()=>crypto.randomUUID();
export function reviewRoster(record){
 const excluded=new Set((record.excludedUnassigned||[]).map(reviewAssetKey)),rows=[...(record.roster||[]),...(record.unassigned||[]),...(record.scenes||[]).flatMap(s=>s.items)];
 const unique=new Map();for(const i of rows)if(!excluded.has(reviewAssetKey(i))&&!unique.has(reviewAssetKey(i)))unique.set(reviewAssetKey(i),i);
 return [...unique.values()];
}
function refreshRoster(record){
 record.roster=reviewRoster(record);const used=new Set(record.scenes.flatMap(s=>s.items).map(reviewAssetKey));record.unassigned=record.roster.filter(i=>!used.has(reviewAssetKey(i)));return record;
}
function mergeCard(old,incoming){
 if(!old)return clone(incoming);if(!incoming)return clone(old);
 const alternate=old.ready&&incoming.ready&&old.description!==incoming.description?{description:incoming.description,at:Date.now()}:null;
 const alternatives=[...(old.alternatives||[]),...(incoming.alternatives||[]),...(alternate?[alternate]:[])].filter((a,i,all)=>a.description!==old.description&&all.findIndex(v=>v.description===a.description)===i);
 return {...old,...((!old.ready||!old.description?.trim())&&incoming.ready?{description:incoming.description,ready:true,warning:incoming.warning||''}:{}),alternatives};
}
export function reviewSceneSignature(scene){return JSON.stringify([scene.id,scene.source,scene.items.map(i=>[i.id,i.category,i.name,i.description,i.ready,...(i.detailStatus?[i.detailStatus]:[])])]);}
// Human approval confirms the scene's list. Detail generation is a separate step.
export const isSceneVerified=scene=>Boolean(scene?.approval?.signature===reviewSceneSignature(scene));
export const needsArtReviewDetails=item=>item.detailStatus!=='nonvisual'&&(!item.ready||!item.description?.trim());
export const reviewLedgerSignature=record=>JSON.stringify((record?.scenes||[]).filter(isSceneVerified).map(s=>[s.id,s.items.map(i=>[i.category,i.name,i.description])]));
export const isReviewCurrent=(record,episode)=>record?.sourceContent===String(episode?.content||'');
export function sourceReviewScenes(episode){
 const scenes=parseDirectorScenesReadonly(episode.content,episode.episodeNumber);
 if(new Set(scenes.map(s=>s.label)).size!==scenes.length)throw Error('场次编号重复，请先核对剧本编号');
 return scenes.map(s=>({id:s.label,title:s.content.split('\n').find(line=>line.trim())||s.label,source:s.content,items:[],removed:[],approval:null}));
}
export function newArtReview(episode,genre=''){
 return {schema:1,episodeNumber:episode.episodeNumber,sourceContent:String(episode.content||''),genre,version:0,scenes:sourceReviewScenes(episode),roster:[],unassigned:[],history:[],published:{},status:'empty',inventory:'',rawOutput:'',dependencies:{}};
}
function inventoryItems(inventory,number,available=[]){
 const parsed=parseArtAnalysis(inventory),episode=parsed.episodes.find(e=>e.episode===number);
 if(!episode)return [];
 const items=[];
 for(const category of Object.keys(ART_REVIEW_CATEGORIES))for(const entry of episode[category]||[]){
  const previous=available.find(i=>i.category===category&&i.name===entry.name),reuse=entry.reuseOf;
  const description=reuse&&previous?readAssetPrompt(previous).content:String(entry.description||'');
  items.push({id:`${category}:${entry.name}`,category,name:canonicalReviewName(entry.name),description,ready:entry.generatable!==false&&Boolean(description.trim())&&(!reuse||Boolean(previous)),firstEpisode:previous?.firstEpisode||previous?.first_episode||reuse||number,referenceName:description.match(/参考【([^】]+)】/)?.[1]||'',warning:entry.generatable===false?'该条可能仅声音或仅提及，请确认是否需要可见资产':reuse&&!previous?'未找到可复用的前集资产，请补齐描述':'',manual:false});
 }
 return [...new Map(items.map(i=>[reviewAssetKey(i),i])).values()];
}
export function decodeArtReviewOutput(raw,number,available=[]){
 const text=String(raw||''),offset=text.indexOf(ART_REVIEW_MAP_MARKER),inventory=(offset<0?text:text.slice(0,offset)).trim();
 const items=inventoryItems(inventory,number,available),warnings=[];let mapping=[];
 if(offset>=0){
  const tail=text.slice(offset+ART_REVIEW_MAP_MARKER.length).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'').trim();
  try{const data=JSON.parse(tail);mapping=Array.isArray(data)?data:data.scenes;if(!Array.isArray(mapping))mapping=[];}catch{warnings.push('逐场对应表尚未完整返回，已保存清单；继续分析可单独补齐对应表。');}
 }else warnings.push('已保存美术清单，尚需补齐逐场对应表。');
 const complete=['人物','场景','道具'].every(cat=>new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?${cat}[：:]\\s*(?:\\n|$)`).test(inventory))&&parseArtAnalysis(inventory).episodes.some(e=>e.episode===number);
 return {inventory,items,mapping,warnings,complete};
}
export function applyArtReviewCandidate(record,episode,decoded,{rawOutput='',taskId='',dependencies={},requestRoster}={}){
 const next=clone(record||newArtReview(episode));
 if(next.sourceContent!==String(episode.content||'')){
  next.history.push({at:Date.now(),reason:'正文变更',sourceContent:next.sourceContent,inventory:next.inventory,scenes:clone(next.scenes)});
  next.sourceContent=String(episode.content||'');next.scenes=sourceReviewScenes(episode);
 }
 if(next.inventory||next.rawOutput)next.history.push({at:Date.now(),reason:'新候选',inventory:next.inventory,rawOutput:next.rawOutput});
 const excluded=new Set((next.excludedUnassigned||[]).map(reviewAssetKey)),assets=new Map(reviewRoster(next).map(i=>[reviewAssetKey(i),clone(i)])),warnings=[...decoded.warnings],used=new Set(),seenScenes=new Set();
 const editStamp=i=>JSON.stringify(i?[i.id,i.name,i.category,i.description,i.note,i.ready,i.manual,i.manualSceneIds]:null),requested=requestRoster?new Map(requestRoster.map(i=>[reviewAssetKey(i),i])):null;
 for(const item of decoded.items)if(!excluded.has(reviewAssetKey(item))){const key=reviewAssetKey(item),old=assets.get(key);if(requested&&old?.manual&&editStamp(old)!==editStamp(requested.get(key)))continue;assets.set(key,mergeCard(old,item));}
 next.roster=[...assets.values()];
 const mapping=new Map();
 for(const row of decoded.mapping){
  if(!row||typeof row!=='object'||Array.isArray(row)){warnings.push('对应表包含无效场景条目，已保留有效清单');continue;}
  const id=String(row.sceneId||row.id||'');
  if(!next.scenes.some(s=>s.id===id)||seenScenes.has(id)){warnings.push(`对应表中的场景 ${id||'未编号'} 不存在或重复，已保留原稿供核实`);continue;}
  seenScenes.add(id);mapping.set(id,row);
 }
 for(const s of next.scenes){
  const row=mapping.get(s.id),incoming=[];let validMapping=Boolean(row)&&Array.isArray(row.assets);
  for(const ref of Array.isArray(row?.assets)?row.assets:[]){
   if(typeof ref!=='string'&&(!ref||typeof ref!=='object'||typeof ref.name!=='string'||!ART_REVIEW_CATEGORIES[ref.category])){validMapping=false;warnings.push(`场景 ${s.id} 的资产引用格式无效，需补齐对应`);continue;}
   const key=typeof ref==='string'?[...assets.keys()].find(k=>k.endsWith('\u0000'+canonicalReviewName(ref))):`${ref.category}\u0000${canonicalReviewName(ref.name)}`;
   const item=assets.get(key);
   if(item&&!incoming.some(i=>reviewAssetKey(i)===key))incoming.push(clone(item));else if(!item&&!excluded.has(key)){validMapping=false;warnings.push(`场景 ${s.id} 引用了清单中不存在的条目 ${typeof ref==='string'?ref:ref.name||''}`);}
  }
  // Human approval and explicit deletions take priority over a later background candidate.
  const removedNames=new Set(s.removed.map(r=>reviewAssetKey(r.item))),oldApproval=isSceneVerified(s);
  if(!oldApproval){
   let items=incoming.filter(i=>!removedNames.has(reviewAssetKey(i))&&(!Array.isArray(i.manualSceneIds)||i.manualSceneIds.includes(s.id)));
   for(const pinned of s.items){
    const generated=items.find(i=>reviewAssetKey(i)===reviewAssetKey(pinned));
    items=items.filter(i=>i.id!==pinned.id&&reviewAssetKey(i)!==reviewAssetKey(pinned));
    items.push(mergeCard(pinned,generated||assets.get(reviewAssetKey(pinned))));
   }
   s.items=items;s.approval=null;
  }else{
   // Fill descriptions for existing approved names without adding/removing actors.
   s.items=s.items.map(i=>needsArtReviewDetails(i)?mergeCard(i,assets.get(reviewAssetKey(i))):i);
   s.approval={...s.approval,signature:reviewSceneSignature(s)};
  }
  s.mappingReady=validMapping||oldApproval||s.mappingReady;
  s.items.forEach(i=>used.add(reviewAssetKey(i)));
 }
 next.inventory=decoded.inventory||next.inventory;next.rawOutput=rawOutput;next.dependencies=dependencies;next.warnings=[...new Set(warnings)];refreshRoster(next);
 next.status=!decoded.complete?'inventory-pending':next.scenes.every(s=>s.mappingReady)?'generated':'mapping-pending';next.generatedAt=Date.now();next.taskId=taskId;delete next.failure;
 return next;
}
export function importLegacyArtReview(episode,{output='',assets=[],genre=''}={}){
 const next=newArtReview(episode,genre),items=inventoryItems(output,episode.episodeNumber,assets);
 const candidates=items.length?items:assets.filter(a=>(a.episodes||[]).map(Number).includes(episode.episodeNumber)).map(a=>({id:`${a.category}:${a.name}`,category:a.category,name:a.name,description:readAssetPrompt(a).content,firstEpisode:a.first_episode||episode.episodeNumber,ready:Boolean(readAssetPrompt(a).content),manual:false}));
 next.inventory=output;next.rawOutput=output;next.roster=candidates;next.unassigned=candidates;next.status=candidates.length?'legacy':'empty';
 if(candidates.length)next.warnings=['历史清单按集保存，需补齐逐场对应。已有卡片和图片继续保留。'];
 return next;
}
export function editArtReview(record,action,actor=''){
 const next=refreshRoster(clone(record));
 if(['roster-upsert','assign','roster-remove','roster-undo'].includes(action.type)){
  const old=next.roster.find(i=>i.id===action.itemId),before=clone(next.roster);
  if(action.type==='roster-upsert'){
   const item=action.item;if(!Object.keys(ART_REVIEW_CATEGORIES).includes(item?.category)||!reviewName(item.name).trim())throw Error('请填写资产名称与正确类别');
   const copy={...item,id:old?.id||identity(),name:canonicalReviewName(item.name),manual:true};
   if(action.sceneIds&&(action.sceneIds.length||Array.isArray(old?.manualSceneIds)||action.pinSceneSelection))copy.manualSceneIds=[...action.sceneIds];
   if(next.roster.some(i=>i.id!==old?.id&&reviewAssetKey(i)===reviewAssetKey(copy)))throw Error('本集名单已存在同名同状态条目，请直接关联场景');
   next.excludedUnassigned=(next.excludedUnassigned||[]).filter(i=>reviewAssetKey(i)!==reviewAssetKey(copy));next.rosterRemoved=(next.rosterRemoved||[]).filter(r=>reviewAssetKey(r.item)!==reviewAssetKey(copy));
   next.roster=next.roster.filter(i=>i.id!==old?.id);next.roster.push(copy);
   next.unassigned=next.unassigned.filter(i=>i.id!==old?.id);
   if(old&&reviewAssetKey(old)!==reviewAssetKey(copy))next.excludedUnassigned=[...(next.excludedUnassigned||[]),old];
   for(const scene of next.scenes)if(scene.items.some(i=>i.id===old?.id)){scene.items=scene.items.map(i=>i.id===old?.id?clone(copy):i);scene.approval=null;}
   if(action.sceneIds)assignRoster(next,copy,action.sceneIds);
  }else if(action.type==='assign'){if(!old)throw Error('名单条目已不存在');old.manualSceneIds=action.sceneIds||[];assignRoster(next,old,old.manualSceneIds);for(const s of next.scenes)s.items=s.items.map(i=>i.id===old.id?clone(old):i);}
  else if(action.type==='roster-remove'){
   if(!old)throw Error('名单条目已不存在');const sceneIds=next.scenes.filter(s=>s.items.some(i=>reviewAssetKey(i)===reviewAssetKey(old))).map(s=>s.id);
   next.rosterRemoved=[...(next.rosterRemoved||[]),{item:old,sceneIds}];next.roster=next.roster.filter(i=>reviewAssetKey(i)!==reviewAssetKey(old));next.unassigned=next.unassigned.filter(i=>reviewAssetKey(i)!==reviewAssetKey(old));next.excludedUnassigned=[...(next.excludedUnassigned||[]),old];
   for(const scene of next.scenes)if(sceneIds.includes(scene.id)){scene.items=scene.items.filter(i=>reviewAssetKey(i)!==reviewAssetKey(old));scene.approval=null;}
  }else{const removed=next.rosterRemoved?.pop();if(removed){next.excludedUnassigned=(next.excludedUnassigned||[]).filter(i=>reviewAssetKey(i)!==reviewAssetKey(removed.item));next.roster.push(removed.item);assignRoster(next,removed.item,removed.sceneIds);}}
  next.history.push({at:Date.now(),reason:action.type,previous:before});return refreshRoster(next);
 }
 const s=next.scenes.find(s=>s.id===action.sceneId);
 if(!s&&action.type!=='approve-episode')throw Error('该场景已不存在，请刷新核对');
 const before=s?clone(s):null;
 if(action.type==='remove'){
  const index=s.items.findIndex(i=>i.id===action.itemId);if(index<0)throw Error('条目已不存在');
  s.removed.push({item:s.items.splice(index,1)[0],index,at:Date.now()});s.approval=null;
 }else if(action.type==='undo'){
  const r=s.removed.pop();if(r&&!s.items.some(i=>reviewAssetKey(i)===reviewAssetKey(r.item)))s.items.splice(r.index,0,r.item);s.approval=null;
 }else if(action.type==='upsert'){
  const i=action.item;if(!Object.keys(ART_REVIEW_CATEGORIES).includes(i.category)||!reviewName(i.name).trim())throw Error('请填写资产名称与正确类别');
  const old=s.items.find(v=>v.id===action.itemId),copy={...i,id:old?.id||identity(),name:canonicalReviewName(i.name),manual:true};
  if(s.items.some(v=>v.id!==old?.id&&reviewAssetKey(v)===reviewAssetKey(copy)))throw Error('本场已存在同名条目');
  if(old){s.items.splice(s.items.indexOf(old),1,copy);if(reviewAssetKey(old)!==reviewAssetKey(copy))s.removed.push({item:old,index:s.items.length,at:Date.now(),replaced:true});}else s.items.push(copy);
  s.approval=null;next.roster=next.roster.filter(v=>reviewAssetKey(v)!==reviewAssetKey(copy));next.roster.push(clone(copy));next.unassigned=next.unassigned.filter(v=>reviewAssetKey(v)!==reviewAssetKey(copy));
 }else if(action.type==='add-existing'){
  if(!ART_REVIEW_CATEGORIES[action.category]||!Array.isArray(action.itemIds)||!action.itemIds.length)throw Error('请选择本集同类清单条目');
  const selected=[...new Set(action.itemIds)].map(id=>next.roster.find(i=>i.id===id));
  if(selected.some(i=>!i||i.category!==action.category))throw Error('条目已不存在或类别不符，请重新选择');
  for(const item of selected){
   const linked=next.scenes.filter(scene=>scene.items.some(i=>reviewAssetKey(i)===reviewAssetKey(item))).map(scene=>scene.id);
   if(linked.includes(s.id))continue;
   item.manualSceneIds=[...linked,s.id];assignRoster(next,item,item.manualSceneIds);
  }
 }else if(action.type==='approve'||action.type==='approve-episode'){
  const targets=action.type==='approve-episode'?next.scenes:[s];
  for(const target of targets){
   if(!target.mappingReady&&!target.items.length)throw Error(`场景 ${target.id} 尚未分析或对应表未完成，请先分析或手工补充条目`);
   target.mappingReady=true;target.approval={signature:reviewSceneSignature(target),at:Date.now(),actor};
  }
 }else if(action.type==='unapprove'){s.approval=null;}else throw Error('不支持的核实操作');
 next.history.push({at:Date.now(),reason:action.type,sceneId:s?.id,previous:before});return refreshRoster(next);
}
function assignRoster(record,item,sceneIds){
 if(!Array.isArray(sceneIds)||sceneIds.some(id=>!record.scenes.some(s=>s.id===id)))throw Error('请选择本集真实场景');
 for(const s of record.scenes){const exists=s.items.some(i=>reviewAssetKey(i)===reviewAssetKey(item)),wanted=sceneIds.includes(s.id);if(exists===wanted)continue;
  if(wanted){s.items.push(clone(item));s.removed=s.removed.filter(r=>reviewAssetKey(r.item)!==reviewAssetKey(item));s.mappingReady=true;}
  else{s.removed.push({item:s.items.find(i=>reviewAssetKey(i)===reviewAssetKey(item)),at:Date.now()});s.items=s.items.filter(i=>reviewAssetKey(i)!==reviewAssetKey(item));}s.approval=null;
 }
}
export function removeUnassignedArtReview(record,itemId){return editArtReview(record,{type:'roster-remove',itemId});}
export function decodeReviewJson(raw){
 let text=String(raw||'').trim();if(text.includes(ART_REVIEW_MAP_MARKER))text=text.split(ART_REVIEW_MAP_MARKER).at(-1).trim();text=text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 try{return JSON.parse(text);}catch{const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start>=0&&end>start)return JSON.parse(text.slice(start,end+1));throw Error('对应信息未完整返回，已保存原稿，请重试自动对应');}
}
export function applyArtReviewCard(record,requested,response){
 const next=refreshRoster(clone(record)),old=next.roster.find(i=>i.id===requested.id&&i.name===requested.name&&i.note===requested.note);
 if(!old)return next;const data=response.item||response;
 if(data.category!==old.category||canonicalReviewName(data.name)!==old.name||typeof data.description!=='string'||!data.description.trim())throw Error('信息卡名称、类别或详细描述未完整返回；手工条目已保留');
 const updated=mergeCard(old,{...old,description:data.description.trim(),ready:true,warning:''});delete updated.detailStatus;next.roster=next.roster.map(i=>i.id===old.id?updated:i);next.unassigned=next.unassigned.map(i=>i.id===old.id?updated:i);
 for(const s of next.scenes)if(s.items.some(i=>i.id===old.id)){const approved=isSceneVerified(s);s.items=s.items.map(i=>i.id===old.id?clone(updated):i);s.approval=approved?{...s.approval,signature:reviewSceneSignature(s)}:null;}
 if(!next.scenes.some(s=>s.items.some(i=>i.id===old.id))&&!Array.isArray(old.manualSceneIds)&&Array.isArray(response.sceneIds)){
  const ids=response.sceneIds.map(String);if(ids.some(id=>!next.scenes.some(s=>s.id===id)))throw Error('信息卡返回了不存在的场景；已保留手工条目，请重试');
  assignRoster(next,updated,ids);
 }
 next.history.push({at:Date.now(),reason:'补齐单条信息卡',item:requested,response});delete next.failure;return refreshRoster(next);
}
export function artReviewContext(records,episode,{allowUnverified=false}={}){
 const number=episode.episodeNumber,approved=[],unverified=[],dependencies={};
 for(const [n,record]of Object.entries(records).sort(([a],[b])=>Number(a)-Number(b))){
  if(Number(n)>=number)continue;
  const verified=record.scenes.filter(isSceneVerified).flatMap(s=>s.items);
  if(verified.length){approved.push(...verified.map(i=>({...i,episode:Number(n)})));dependencies[n]=reviewLedgerSignature(record);}
  if(allowUnverified)unverified.push(...record.scenes.filter(s=>!isSceneVerified(s)).flatMap(s=>s.items).map(i=>({...i,episode:Number(n)})),...(record.unassigned||[]).map(i=>({...i,episode:Number(n)})));
 }
 const compact=rows=>{const map=new Map();rows.forEach(i=>map.set(reviewAssetKey(i),i));return [...map.values()].map(i=>({id:i.id,category:i.category,name:i.name,firstEpisode:i.firstEpisode||i.episode,episode:i.episode,description:episode.content.includes(parseAssetName(i.name).base)?i.description:undefined}));};
 return {approved:compact(approved),unverified:compact(unverified),dependencies,available:[...approved,...(allowUnverified?unverified:[])]};
}
export function buildArtReviewInstruction(episode,record,{mappingOnly=false}={}){
 const locked=record.scenes.filter(s=>s.items.some(i=>i.manual)||isSceneVerified(s)||s.removed.length).map(s=>({sceneId:s.id,preserve:isSceneVerified(s)?s.items:s.items.filter(i=>i.manual),removed:s.removed.map(r=>({category:r.item.category,name:r.item.name})).filter(r=>!s.items.some(i=>reviewAssetKey(i)===reviewAssetKey(r)))}));
 return `【本次输出适配】\n${mappingOnly?'已保存本集完整美术清单，本次只补齐对应表，不重新写清单。':'先按完整 Skill 输出且只输出本集三类美术清单，名称与详细描述都保留。重新读取只补缺，不覆盖已有信息卡；同名同状态沿用第一次生成，补齐手工条目的详细描述。'}\n随后输出独立标记 ${ART_REVIEW_MAP_MARKER}，再输出一个 JSON 对象：{"scenes":[{"sceneId":"${episode.episodeNumber}-1","assets":[{"category":"character","name":"【角色-具体造型】"}]}]}。每个真实场景必须出现且只出现一次，空场景 assets=[]；name 必须逐字引用清单条目。同一资产可以关联多个场景，不复制名单条目。每场只列本场可见的人物具体服装造型、场景、道具；同集多套衣服不得全部挂到每场。仅声音/仅提及的实体保留审计提醒，不分配可见人物。保留原文场次编号，不新增或重编号。不要推理过程，不用代码围栏。\n人工已核实或手工改动具有优先级。锁定名称须逐字保留，删掉的条目不得放回对应场；新增造型补齐客观细节，并沿用正确人物基础形象。当前场服装优先于前集服装候选。\n${JSON.stringify({sceneIds:record.scenes.map(s=>s.id),savedRoster:reviewRoster(record),manualCorrections:locked,excludedUnassigned:(record.excludedUnassigned||[]).map(i=>({category:i.category,name:i.name})),...(mappingOnly?{savedInventory:record.inventory}:{}),untrustedData:{currentEpisode:episode.content}})}`;
}
export function projectPublishedReviewAssets(project,assets){
 const reviews=Object.entries(project.analysis_progress||{}).filter(([,r])=>r.review?.published&&Object.keys(r.review.published).length);
 if(!reviews.length)return assets;
 const reviewedSceneIds=reviews.flatMap(([,r])=>Object.keys(r.review.published));
 return assets.map(a=>{
  const sceneIds=reviews.flatMap(([,r])=>Object.values(r.review.published).filter(s=>s.items.some(i=>i.category===a.category&&i.name===a.name)).map(s=>s.id)),managed=sceneIds.length||reviews.some(([,r])=>r.review.managedAssetNames?.includes(a.name));
  if(!managed)return {...a,reviewedSceneIds};
  const legacyEpisodes=(a.episodes||[]).map(Number).filter(n=>!reviews.some(([ep])=>Number(ep)===n)),legacySceneIds=reviews.filter(([ep])=>(a.episodes||[]).map(Number).includes(Number(ep))).flatMap(([,r])=>r.review.scenes.filter(s=>!r.review.published[s.id]).map(s=>s.id));
  const versions=reviews.flatMap(([,r])=>reviewRoster(r.review).filter(i=>i.category===a.category&&i.name===a.name).flatMap(i=>[{description:i.description},...(i.alternatives||[])])),reviewPromptAlternatives=[...new Map(versions.filter(i=>i.description).map(i=>[i.description,i])).values()];
  return {...a,sceneIds:[...new Set(sceneIds)],legacyEpisodes,legacySceneIds,reviewedSceneIds,reviewPromptAlternatives:reviewPromptAlternatives.length>1?reviewPromptAlternatives:[]};
 });
}

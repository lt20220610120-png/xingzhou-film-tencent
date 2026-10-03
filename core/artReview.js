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
export function reviewSceneSignature(scene){return JSON.stringify([scene.id,scene.source,scene.items.map(i=>[i.id,i.category,i.name,i.description,i.ready])]);}
export const isSceneVerified=scene=>Boolean(scene.approval?.signature===reviewSceneSignature(scene)&&scene.items.every(i=>i.ready&&i.description?.trim()));
export const reviewLedgerSignature=record=>JSON.stringify((record?.scenes||[]).filter(isSceneVerified).map(s=>[s.id,s.items.map(i=>[i.category,i.name,i.description])]));
export const isReviewCurrent=(record,episode)=>record?.sourceContent===String(episode?.content||'');
export function sourceReviewScenes(episode){
 const scenes=parseDirectorScenesReadonly(episode.content,episode.episodeNumber);
 if(new Set(scenes.map(s=>s.label)).size!==scenes.length)throw Error('场次编号重复，请先核对剧本编号');
 return scenes.map(s=>({id:s.label,title:s.content.split('\n').find(line=>line.trim())||s.label,source:s.content,items:[],removed:[],approval:null}));
}
export function newArtReview(episode,genre=''){
 return {schema:1,episodeNumber:episode.episodeNumber,sourceContent:String(episode.content||''),genre,version:0,scenes:sourceReviewScenes(episode),unassigned:[],history:[],published:{},status:'empty',inventory:'',rawOutput:'',dependencies:{}};
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
export function applyArtReviewCandidate(record,episode,decoded,{rawOutput='',taskId='',dependencies={}}={}){
 const next=clone(record||newArtReview(episode));
 if(next.sourceContent!==String(episode.content||'')){
  next.history.push({at:Date.now(),reason:'正文变更',sourceContent:next.sourceContent,inventory:next.inventory,scenes:clone(next.scenes)});
  next.sourceContent=String(episode.content||'');next.scenes=sourceReviewScenes(episode);
 }
 if(next.inventory||next.rawOutput)next.history.push({at:Date.now(),reason:'新候选',inventory:next.inventory,rawOutput:next.rawOutput});
 const assets=new Map(decoded.items.map(i=>[reviewAssetKey(i),i])),warnings=[...decoded.warnings],used=new Set(),seenScenes=new Set();
 const mapping=new Map();
 for(const row of decoded.mapping){
  const id=String(row.sceneId||row.id||'');
  if(!next.scenes.some(s=>s.id===id)||seenScenes.has(id)){warnings.push(`对应表中的场景 ${id||'未编号'} 不存在或重复，已保留原稿供核实`);continue;}
  seenScenes.add(id);mapping.set(id,row);
 }
 for(const s of next.scenes){
  const row=mapping.get(s.id),incoming=[];
  for(const ref of row?.assets||[]){
   const key=typeof ref==='string'?[...assets.keys()].find(k=>k.endsWith('\u0000'+canonicalReviewName(ref))):`${ref.category}\u0000${canonicalReviewName(ref.name)}`;
   const item=assets.get(key);
   if(item&&!incoming.some(i=>reviewAssetKey(i)===key))incoming.push(clone(item));else if(!item)warnings.push(`场景 ${s.id} 引用了清单中不存在的条目 ${typeof ref==='string'?ref:ref.name||''}`);
  }
  // Human approval and explicit deletions take priority over a later background candidate.
  const removedNames=new Set(s.removed.map(r=>reviewAssetKey(r.item))),oldApproval=isSceneVerified(s);
  if(!oldApproval){
   let items=incoming.filter(i=>!removedNames.has(reviewAssetKey(i)));
   for(const pinned of s.items.filter(i=>i.manual)){
    const generated=items.find(i=>reviewAssetKey(i)===reviewAssetKey(pinned));
    items=items.filter(i=>i.id!==pinned.id&&reviewAssetKey(i)!==reviewAssetKey(pinned));
    items.push({...pinned,description:generated?.description||pinned.description,ready:generated?.ready||pinned.ready,warning:generated?.warning||pinned.warning});
   }
   s.items=items;s.approval=null;
  }
  s.mappingReady=Boolean(row)||oldApproval;
  s.items.forEach(i=>used.add(reviewAssetKey(i)));
 }
 const deleted=new Set([...next.scenes.flatMap(s=>s.removed.map(r=>reviewAssetKey(r.item))),...(next.excludedUnassigned||[]).map(reviewAssetKey)]);
 next.unassigned=decoded.items.filter(i=>!used.has(reviewAssetKey(i))&&!deleted.has(reviewAssetKey(i))).map(clone);
 next.inventory=decoded.inventory;next.rawOutput=rawOutput;next.dependencies=dependencies;next.warnings=[...new Set(warnings)];
 next.status=!decoded.complete?'inventory-pending':next.scenes.every(s=>s.mappingReady)?'generated':'mapping-pending';next.generatedAt=Date.now();next.taskId=taskId;delete next.failure;
 return next;
}
export function importLegacyArtReview(episode,{output='',assets=[],genre=''}={}){
 const next=newArtReview(episode,genre),items=inventoryItems(output,episode.episodeNumber,assets);
 const candidates=items.length?items:assets.filter(a=>(a.episodes||[]).map(Number).includes(episode.episodeNumber)).map(a=>({id:`${a.category}:${a.name}`,category:a.category,name:a.name,description:readAssetPrompt(a).content,firstEpisode:a.first_episode||episode.episodeNumber,ready:Boolean(readAssetPrompt(a).content),manual:false}));
 next.inventory=output;next.rawOutput=output;next.unassigned=candidates;next.status=candidates.length?'legacy':'empty';
 if(candidates.length)next.warnings=['历史清单按集保存，需补齐逐场对应。已有卡片和图片继续保留。'];
 return next;
}
export function editArtReview(record,action,actor=''){
 const next=clone(record),s=next.scenes.find(s=>s.id===action.sceneId);
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
  s.approval=null;next.unassigned=next.unassigned.filter(v=>reviewAssetKey(v)!==reviewAssetKey(copy));
 }else if(action.type==='approve'||action.type==='approve-episode'){
  const targets=action.type==='approve-episode'?next.scenes:[s];
  if(next.unassigned.length&&action.type==='approve-episode')throw Error('还有未定位条目，请先安排到场景或移除');
  for(const target of targets){
   if(!target.mappingReady&&!target.items.length)throw Error(`场景 ${target.id} 尚未分析或对应表未完成，请先分析或手工补充条目`);
   if(target.items.some(i=>!i.ready||!i.description?.trim()))throw Error(`场景 ${target.id} 有条目待补齐细节，请按修改重新生成本集`);
   target.mappingReady=true;target.approval={signature:reviewSceneSignature(target),at:Date.now(),actor};
  }
 }else if(action.type==='unapprove'){s.approval=null;}else throw Error('不支持的核实操作');
 next.history.push({at:Date.now(),reason:action.type,sceneId:s?.id,previous:before});return next;
}
export function removeUnassignedArtReview(record,itemId){const next=clone(record),item=next.unassigned.find(i=>i.id===itemId);if(!item)throw Error('条目已不存在');next.unassigned=next.unassigned.filter(i=>i.id!==itemId);next.excludedUnassigned=[...(next.excludedUnassigned||[]),item];next.history.push({at:Date.now(),reason:'移除未定位条目',item});return next;}
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
 return `【本次输出适配】\n${mappingOnly?'已保存本集完整美术清单，本次只补齐对应表，不重新写清单。':'先按完整 Skill 输出且只输出本集三类美术清单，名称与详细描述都保留。'}\n随后输出独立标记 ${ART_REVIEW_MAP_MARKER}，再输出一个 JSON 对象：{"scenes":[{"sceneId":"${episode.episodeNumber}-1","assets":[{"category":"character","name":"【角色-具体造型】"}]}]}。每个真实场景必须出现且只出现一次，空场景 assets=[]；name 必须逐字引用清单条目。每场只列本场可见的人物具体服装造型、场景、道具；同集多套衣服不得全部挂到每场。仅声音/仅提及的实体保留审计提醒，不分配可见人物。保留原文场次编号，不新增或重编号。不要推理过程，不用代码围栏。\n人工已核实或手工改动具有优先级。锁定名称须逐字保留，删掉的条目不得放回对应场；新增造型补齐客观细节，并沿用正确人物基础形象。当前场服装优先于前集服装候选。\n${JSON.stringify({sceneIds:record.scenes.map(s=>s.id),manualCorrections:locked,excludedUnassigned:(record.excludedUnassigned||[]).map(i=>({category:i.category,name:i.name})),...(mappingOnly?{savedInventory:record.inventory}:{}),untrustedData:{currentEpisode:episode.content}})}`;
}
export function projectPublishedReviewAssets(project,assets){
 const reviews=Object.entries(project.analysis_progress||{}).filter(([,r])=>r.review?.published&&Object.keys(r.review.published).length);
 if(!reviews.length)return assets;
 return assets.map(a=>{const sceneIds=reviews.flatMap(([,r])=>Object.values(r.review.published).filter(s=>s.items.some(i=>i.category===a.category&&i.name===a.name)).map(s=>s.id)),managed=sceneIds.length||reviews.some(([,r])=>r.review.managedAssetNames?.includes(a.name));if(!managed)return a;const legacyEpisodes=(a.episodes||[]).map(Number).filter(n=>!reviews.some(([ep])=>Number(ep)===n)),legacySceneIds=reviews.filter(([ep])=>(a.episodes||[]).map(Number).includes(Number(ep))).flatMap(([,r])=>r.review.scenes.filter(s=>!r.review.published[s.id]).map(s=>s.id));return {...a,sceneIds:[...new Set(sceneIds)],legacyEpisodes,legacySceneIds};});
}

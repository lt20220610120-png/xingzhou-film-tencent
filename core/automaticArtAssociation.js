import {sceneIdentities,isNonvisualFoundationText,reconcileSceneIdentities} from './sceneIdentityContext.js';
import {readPromptFoundation,readPromptFoundationBlock} from './promptFoundation.js';
import {currentEntryBinding,entryBindingSignature,saveDistribution} from './promptArtBinding.js';
import {reconcilePromptSpeakers} from './voiceBinding.js';
import {parseAssetName} from './collabStore.js';
import {applyArtReviewCandidate,reviewRoster,isReviewCurrent} from './artReview.js';
import {applySceneDistribution} from './scenePromptDistribution.js';
import {explicitDialogueLines} from './explicitDialogue.js';

export function automaticEntryAssociation(snapshot,entry,saved,{voiceEnabled=true}={}){
 const seed=currentEntryBinding(snapshot,entry,saved),matches=sceneIdentities(snapshot,entry),block=readPromptFoundationBlock(entry.prompt);
 const needs=seed.needs.filter(n=>n.locked);
 for(const [category,rows] of Object.entries(readPromptFoundation(entry.prompt)))for(const row of rows){
  if(isNonvisualFoundationText(row.text))continue;
  for(const token of row.names){
   const match=matches.find(m=>m.category===category&&m.token===token),card=match?.cardUid&&snapshot.cards.find(c=>c.uid===match.cardUid);
   const start=entry.prompt.indexOf(token,block.start);
   if(needs.some(n=>n.cardUid&&n.cardUid===card?.uid||n.locked&&!n.cardUid&&n.category===category&&n.text.startsWith(token)))continue;
   const prior=seed.needs.find(n=>n.cardUid&&n.cardUid===card?.uid);
   needs.push({id:'auto:'+category+':'+start,category,text:token,start,end:start+token.length,cardUid:card?.uid||null,visibility:'visible',imageId:card?.images.some(i=>i.id===prior?.imageId)?prior.imageId:card?.images.length===1?card.images[0].id:null,reason:card?'基础设定与本场唯一身份一致':match?.candidateUids.length?'存在多套造型，待核对':'本场清单缺少明确匹配，待补充'});
  }
 }
 const next=reconcileSceneIdentities(snapshot,entry,{...seed,signature:entryBindingSignature(snapshot,entry),needs,origin:'automatic',issue:block?'':'未找到基础设定或基础信息，请核对提示词格式',...(voiceEnabled?reconcilePromptSpeakers(snapshot,entry,seed.speakers):{speakers:[]})});
 return saveDistribution(snapshot,entry,next,{voiceEnabled});
}

export function calibratedEntryAssociation(snapshot,entry,seed,raw,sceneSource='',options={}){
 const data=typeof raw==='string'?JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'')):raw;
 if(!Array.isArray(data?.assignments)||!Array.isArray(data?.missing))throw Error('AI 未返回完整的场景清单分发');
 const assignments=[],missing=[],warnings=[],seen=new Set();
 for(const row of data.assignments){
  if(seen.has(row.cardUid)){warnings.push('已合并重复卡片');continue;}
  try{applySceneDistribution(snapshot,entry,seed,{assignments:[row],missing:[]},sceneSource,options);assignments.push(row);seen.add(row.cardUid);}
  catch(error){warnings.push(error.message);}
 }
 for(const row of data.missing){try{applySceneDistribution(snapshot,entry,seed,{assignments:[],missing:[row]},sceneSource,options);missing.push(row);}catch(error){warnings.push(error.message);}}
 const local=automaticEntryAssociation(snapshot,entry,seed,options),result=applySceneDistribution(snapshot,entry,seed,{...data,assignments,missing},sceneSource,options);
 // Keep explicit unresolved identities. An omitted model row does not mean the
 // missing character disappeared, or that an ambiguous costume is resolved.
 for(const need of local.needs.filter(n=>!n.cardUid&&n.visibility==='visible')){
  if(!seed.needs.some(n=>!n.cardUid&&n.category===need.category&&n.text===need.text)&&!sceneIdentities(snapshot,entry).some(m=>m.category===need.category&&m.token===need.text&&m.candidateUids.length>1))continue;
  if(!result.needs.some(n=>n.category===need.category&&n.visibility!=='excluded'&&(n.text.includes(need.text)||need.text.includes(n.text))))result.needs.push(need);
 }
 return {...result,calibrationWarnings:[...new Set(warnings)]};
}

const identity=text=>String(text||'').normalize('NFKC').replace(/[【】·\s]/g,'');
// Saved scene decisions and explicit removals stay authoritative. Only literal,
// unique identities from the episode inventory are added, never the whole list.
export function automaticSceneAssociation(record,episode){
 if(!isReviewCurrent(record,episode)||['empty','inventory-pending'].includes(record.status))return record;
 const roster=reviewRoster(record),mapping=[];
 for(const scene of record.scenes){
  if(scene.mappingReady)continue;
  const lines=String(scene.source||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean),heading=identity(lines[0]),speakers=explicitDialogueLines(scene.source).map(l=>identity(l.name));
  const action=lines.slice(1).filter(l=>!/^.{1,40}[：:]/.test(l)&&!/[『「“].*[』」”]/.test(l)),groups=new Map();
  for(const item of roster){const key=item.category+':'+identity(parseAssetName(item.name).base);const rows=groups.get(key)||[];rows.push(item);groups.set(key,rows);}
  const selected=[];let ambiguous=false;
  for(const rows of groups.values()){
   const first=rows[0],base=identity(parseAssetName(first.name).base);if(!base)continue;
   const evidence=first.category==='scene'?[heading]:action.map(identity).filter(l=>!/(?:没有|不见|未见|未出场|未入场|不在|不含|不带|没带|无需|提及|谈到|说起)/.test(l));
   const visible=first.category==='character'?speakers.includes(base)||evidence.some(l=>l.startsWith(base)):evidence.some(l=>l.includes(base));
   if(!visible)continue;
   const exact=rows.filter(i=>evidence.some(l=>l.includes(identity(i.name)))),match=exact.length===1?exact[0]:rows.length===1?first:null;
   if(!match)ambiguous=true;
   if(match)selected.push({category:match.category,name:match.name});
  }
  mapping.push({sceneId:scene.id,assets:selected,automaticPending:ambiguous||!selected.length});
 }
 if(!mapping.length)return record;
 const next=applyArtReviewCandidate(record,episode,{items:[],mapping,inventory:record.inventory,complete:true,warnings:[]},{rawOutput:record.rawOutput});
 for(const row of mapping)if(row.automaticPending)next.scenes.find(s=>s.id===row.sceneId).mappingReady=false;
 if(next.scenes.some(s=>!s.mappingReady))next.status='mapping-pending';
 next.history.push({reason:'程序按本集清单与逐场原文自动关联',at:Date.now()});return next;
}

import {parseAssetName} from './collabStore.js';
import {readPromptFoundation,readPromptFoundationBlock} from './promptFoundation.js';

const identity=text=>String(text||'').normalize('NFKC').replace(/[【】\[\]·\s]/g,'');
export const isNoReferenceText=text=>/^(?:无|没有|暂无|不需要|无需)[。.!！\s]*$/u.test(text)||/^(?:无|没有|暂无)(?:关键|其他|任何|手持|道具|人物|角色|场景|参考)/u.test(text)||/^(?:不需要|无需)(?:参考|道具|人物|场景)/u.test(text);
const absent=text=>isNoReferenceText(text)||/(?:未出镜|不入镜|无画面|仅声音|电话音|仅提及)/u.test(text);
const sameToken=(text,token)=>text===token||text.startsWith(token)&&/^[（(，,、；;\s]/u.test(text.slice(token.length));
export const lockedIdentityOmission=(needs,match)=>needs.some(n=>n.locked&&!n.cardUid&&n.visibility==='excluded'&&n.category===match.category&&sameToken(n.text,match.token));
// A role abbreviation may only select one actual identity in this scene. Never
// resolve one of several costumes or two assistants by ordering/model preference.
export function sceneIdentities(snapshot,entry){
 const cards=snapshot.cards.filter(c=>c.sceneIds.includes(entry.sceneId)),block=readPromptFoundationBlock(entry.prompt);
 return Object.entries(readPromptFoundation(entry.prompt)).flatMap(([category,rows])=>rows.flatMap(row=>row.names.flatMap(token=>{
  if(absent(row.text))return [];
  const key=identity(token),same=cards.filter(c=>c.category===category&&c.detailStatus!=='nonvisual');
  const exact=same.filter(c=>identity(parseAssetName(c.name).base)===key);
  const matches=exact.length?exact:category==='character'&&/^(?:助理|秘书|护士|医生|司机|保镖|管家|老师|警察)$/u.test(key)?same.filter(c=>identity(parseAssetName(c.name).base).endsWith(key)):[];
  const rowStart=block?entry.prompt.indexOf(row.text,block.start):-1,start=rowStart+row.text.indexOf(token);
  if(!block||rowStart<block.start||start<rowStart||start>=block.end)return [];
  return [{token,category,start,end:start+token.length,cardUid:matches.length===1?matches[0].uid:null,candidateUids:matches.map(c=>c.uid)}];
 })));
}
export function reconcileSceneIdentities(snapshot,entry,decision){
 let needs=[...decision.needs];
 for(const match of sceneIdentities(snapshot,entry)){
  if(!match.cardUid)continue;
  const prior=needs.find(n=>n.cardUid===match.cardUid);
  // Human inclusions/exclusions outrank the shared identity catalog.
  if(prior?.locked)continue;
  if(lockedIdentityOmission(needs,match)){
   needs=needs.map(n=>n.cardUid===match.cardUid?{...n,visibility:'excluded',imageId:null,reason:'本条已人工确认无需参考图'}:n);continue;
  }
  const matchingMissing=needs.filter(n=>!n.cardUid&&!n.locked&&n.category===match.category&&sameToken(n.text,match.token));
  if(prior?.visibility==='visible'&&!matchingMissing.length&&prior.text.includes(match.token)&&entry.prompt.slice(prior.start,prior.end)===prior.text)continue;
  const card=snapshot.cards.find(c=>c.uid===match.cardUid);
  needs=needs.filter(n=>n.cardUid!==match.cardUid&&!matchingMissing.includes(n));
  needs.push({id:'identity:'+match.cardUid,category:match.category,cardUid:match.cardUid,text:match.token,start:match.start,end:match.end,visibility:'visible',reason:'本条基础设定明确出现，按本场唯一身份关联',imageId:card.images.some(i=>i.id===prior?.imageId)?prior.imageId:card.images.length===1?card.images[0].id:null});
 }
 return {...decision,needs};
}

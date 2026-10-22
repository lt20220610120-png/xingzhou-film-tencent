import {importedSnapshot,importedDecision,inventoryMessages,applyInventoryAi,runBindingRepair,withBindingImages} from './importedArtBinding.js';
import {bindingHash,bindingProblems,compileEntryBinding,bindingAiMessages,applyBindingAi} from './promptArtBinding.js';

const parse=raw=>typeof raw==='string'?JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'')):raw;
export function returnToManual(book){
 return {...book,importedBinding:{...book.importedBinding,stage:'manual'}};
}
export function importedAutoSummary(book){
 const snapshot=importedSnapshot(book),rows=snapshot.entries.map(entry=>{
  const decision=book.importedBinding.decisions?.[entry.id];
  let issue='';
  try{compileEntryBinding(snapshot,entry,decision);}catch(error){issue=decision?.autoIssue||error.message;}
  return {id:entry.id,label:entry.label,ready:!issue,issue};
 });
 return {rows,ready:rows.filter(row=>row.ready).length,pending:rows.filter(row=>!row.ready).length};
}
export async function runImportedAuto({book,targetEntryId=null,call,save,readImages=async()=>[],isStopped=()=>false,onProgress=()=>{},checkedWithImages=false}){
 let current=structuredClone(book);
 const check=()=>{if(isStopped())throw Error('任务已停止，已完成的关联已保留');};
 const persist=async work=>{check();current={...current,importedBinding:work};await save(current);check();};
 let snapshot=importedSnapshot(current);
 const targets=entries=>targetEntryId===null?entries:entries.filter(entry=>entry.id===targetEntryId);
 if(!targets(snapshot.entries).length)throw Error('当前提示词不存在，请重新选择');
 const scenes=[...new Set(targets(snapshot.entries).map(entry=>entry.sceneId))],attempted=new Set();
 // Identity is resolved once per unique image. Final entry signatures are computed
 // only after identity processing, so shared images cannot stale earlier scenes.
 for(const sceneId of scenes){
  check();snapshot=importedSnapshot(current);
  const unknown=snapshot.cards.filter(card=>card.sceneIds.includes(sceneId)&&!card.identityConfirmed&&!attempted.has(card.uid));
  for(let offset=0;offset<unknown.length;offset+=24){
   const batch=unknown.slice(offset,offset+24),partial={...snapshot,entries:targets(snapshot.entries),cards:batch};
   batch.forEach(card=>attempted.add(card.uid));
   try{
    const images=await readImages(batch);check();
    const messages=inventoryMessages(partial,sceneId);
    messages[0].content+=' 额外为每张图片返回 certainty:"clear"或"uncertain"、sourceName:输入中该图片的原name。仅在文件名称/已知分类/提示词或实际图片提供充分依据且无冲突时用clear。不能靠所有者姓名判断主体；不能把一张图片虚构为其他身份。不确定须uncertain，不追求全部完成。';
    const metadata=await runBindingRepair({messages:images.length?withBindingImages(messages,images):messages,call,isStopped,
     onAttempt:attempt=>onProgress(`整理场景 ${sceneId} 的素材身份（${offset+1}–${offset+batch.length}，第 ${attempt} 次）`),
     validate:raw=>{
      const response=parse(raw),next=applyInventoryAi(partial,sceneId,current.importedBinding.metadata,response);
      for(const row of response.cards){
       if(!['clear','uncertain'].includes(row.certainty)||row.sourceName!==batch.find(card=>card.uid===row.uid)?.name)throw Error('素材身份缺少确定性或原名称依据');
       next[row.uid]={...next[row.uid],confirmed:row.certainty==='clear'&&row.category!=='unknown',certainty:row.certainty,sourceName:row.sourceName,confirmedBy:'ai',checkedWithImages};
      }
      return next;
     }});
    await persist({...current.importedBinding,metadata});
   }catch(error){check();onProgress(`场景 ${sceneId} 身份待处理：${error.message}`);}
  }
 }
 snapshot=importedSnapshot(current);
 const imageCache=new Map();
 for(const entry of targets(snapshot.entries)){
  check();
  const old=current.importedBinding.decisions?.[entry.id];
  try{compileEntryBinding(snapshot,entry,old);continue;}catch{}
  let decision=importedDecision(snapshot,entry,current.importedBinding.decisions);
  const cards=snapshot.cards.filter(card=>card.sceneIds.includes(entry.sceneId));
  if(!cards.length){
   await persist({...current.importedBinding,decisions:{...current.importedBinding.decisions,[entry.id]:{...decision,autoIssue:'本场没有导入图片，请补齐素材'}}});continue;
  }
  try{
   if(!imageCache.has(entry.sceneId))imageCache.set(entry.sceneId,await readImages(cards));
   check();
   const safe={...snapshot,cards:cards.map(({reference,images,...card})=>({...card,images:images.map(image=>({id:image.id}))}))};
   const messages=bindingAiMessages(safe,entry,decision),images=imageCache.get(entry.sceneId);
   messages[0].content+=' 额外返回顶层 certainty:"clear"或"uncertain"。完整检查本条所有入镜对象、妆造、道具所有者与动作；选择仍未确认身份的卡片、缺图、同名无法区分或原文不清晰时用uncertain。只有每个用途和图片选择都有充分依据时才用clear。人工锁定必须保留。不确定不要猜。';
   const next=await runBindingRepair({messages:images.length?withBindingImages(messages,images):messages,call,isStopped,
    onAttempt:attempt=>onProgress(`AI 关联 ${entry.label}（第 ${attempt} 次）`),
    validate:raw=>{
     const response=parse(raw);
     if(!['clear','uncertain'].includes(response.certainty))throw Error('AI 未说明本条是否确定');
     return {...applyBindingAi(snapshot,entry,decision,response),autoCertain:response.certainty==='clear'};
    }});
   decision={...next,aiSuggestedNeeds:structuredClone(next.needs),checkedWithImages,confirmed:false,confirmedBy:'ai',autoIssue:''};
   const problems=bindingProblems(snapshot,entry,decision,{requireConfirmed:false,requireImages:true});
   if(next.autoCertain&&!problems.length){
    decision={...decision,confirmed:true,confirmedAt:new Date().toISOString(),confirmedPromptHash:bindingHash(entry.prompt)};
    compileEntryBinding(snapshot,entry,decision);
   }else decision.autoIssue=problems.join('；')||'AI 对本条仍不确定，请核对有疑问的关联';
  }catch(error){check();decision={...decision,confirmed:false,autoIssue:error.message};}
  await persist({...current.importedBinding,decisions:{...current.importedBinding.decisions,[entry.id]:decision}});
 }
 return {...importedAutoSummary(current),book:current};
}

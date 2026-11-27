import {numberedReferences,isProjectGenerationReference,normalizeGenerationReferences} from './generationReferences.js';
import {generationReferenceKey,remapGenerationAliases} from './automaticReferences.js';
import {assetImageSlot} from './assetImageSlot.js';
import {findStoryboardAudioMedia} from './storyboardAudioReferences.js';
import {assetHasAdoptedImage} from './assetReferencePolicy.js';

export const storyboardAssetSlots = (references,projectId) => {
 const slots=(references||[]).map(ref=>assetImageSlot(ref,projectId));
 return references && slots.every((ref,index)=>ref===references[index])?references:slots;
};

// Canonicalize existing slots and recovery history without changing alias order.
export function cleanStoryboardReferenceValue(value,projectId) {
 const refs=value.references||[],mapped=storyboardAssetSlots(refs,projectId);
 const regularImages=new Set(refs.filter(ref=>ref.kind==='image'&&isProjectGenerationReference(ref,projectId)).map(ref=>ref.id));
 const references=mapped.filter((ref,index)=>isProjectGenerationReference(ref,projectId)
  && !(refs[index].kind==='asset-image'&&regularImages.has(ref.id)));
 const removed=value.storyboardRemovedReferences,baseline=value.storyboardReferenceBaseline;
 const removedSlots=removed&&storyboardAssetSlots(removed,projectId);
 const baselineSlots=baseline?.references&&storyboardAssetSlots(baseline.references,projectId);
 const recovery={...(removed!==removedSlots?{storyboardRemovedReferences:removedSlots}:{}),
  ...(baseline?.references!==baselineSlots?{storyboardReferenceBaseline:{...baseline,references:baselineSlots}}:{})};
 const orderChanged=references.length!==refs.length||refs.some((ref,index)=>ref.kind!==mapped[index].kind);
 if(!orderChanged)return mapped===refs&&removed===removedSlots&&baseline?.references===baselineSlots?value:{...value,references:mapped,...recovery};
 const order=items=>numberedReferences(items).map(ref=>({key:generationReferenceKey(ref),alias:ref.alias}));
 const keyChanges=new Map(refs.map((ref,index)=>[generationReferenceKey(ref),generationReferenceKey(mapped[index])]));
 const prior=value.autoReferenceOrder||order(mapped);
 const before=[...prior,...order(refs).filter(row=>!prior.some(existing=>existing.alias===row.alias))]
  .map(row=>({...row,key:keyChanges.get(row.key)||row.key}));
 const after=order(references);
 return {...value,...recovery,references,prompt:remapGenerationAliases(value.prompt,before,after),autoReferenceOrder:after,autoReferenceSignature:null};
}

export function storyboardReferencePreviews(references,assets,media,projectId) {
 const assetById=new Map((assets||[]).filter(asset=>(!asset.projectId||asset.projectId===projectId)&&(!asset.project_id||asset.project_id===projectId)).map(asset=>[asset.id,asset]));
 return normalizeGenerationReferences(storyboardAssetSlots(references,projectId)).map(ref=>{
  if(ref.assetImageSlot){
   const asset=assetById.get(ref.assetId);
   const adoptedImageReady=assetHasAdoptedImage(asset);
   return {...ref,displayName:asset?.displayName||ref.displayName,nameAliases:asset?.nameAliases||ref.nameAliases,adoptedImageReady,
    adoptedRevision:`${asset?.adoptedImageId||''}:${String(asset?.image_url||'').split('?')[0]}:${asset?.updated_at||''}`};
  }
  if(ref.kind==='audio'){
   const file=findStoryboardAudioMedia(ref,media||[],projectId);
   return file?{...ref,mediaId:file.id,objectKey:file.objectKey,url:file.url,filePath:file.filePath}:ref;
  }
  const file=media?.find(m=>m.id===ref.id);
  return file?{...ref,url:file.url}:ref;
 });
}

export const visibleStoryboardReference = ref => ref.assetImageSlot!==true || ref.adoptedImageReady!==false;

const referenceAlias='@(?:image|图片|图|audio|video)[1-9]\\d*(?![\\w])';
// Validate the start of the run so an email remains plain text, while adjacent
// references inside a valid run each retain their own identity.
const referenceAliasRun='(?<![\\w.+-])(?:'+referenceAlias+')+';
const normalizedImageAlias=alias=>alias.replace(/^@(?:图片|图)/,'@image');
const imageAliases=references=>numberedReferences(references).filter(ref=>ref.kind==='image');

// Canonical drafts keep every asset identity and its prompt anchor. Only the
// current view and the actual submission use the available image numbering.
export function projectStoryboardImageAliases(input,allReferences,activeReferences){
 const source=String(input||'');
 const aliases=new Map(imageAliases(allReferences).map(ref=>[ref.alias,generationReferenceKey(ref)]));
 const active=new Map(imageAliases(activeReferences).map(ref=>[generationReferenceKey(ref),ref.alias]));
 const show=token=>{
  const key=aliases.get(normalizedImageAlias(token));
  return key?active.get(key)||'':token;
 };
 const tokenPattern=new RegExp(referenceAlias,'g');
 const groupPattern=new RegExp('([（(][ \\t]*参考[ \\t]*)((?:'+referenceAlias+')(?:[ \\t]*'+referenceAlias+')*)([ \\t]*[）)])|'+referenceAliasRun,'g');
 const anchors=[];
 let prompt='',end=0;
 for(const match of source.matchAll(groupPattern)){
  prompt+=source.slice(end,match.index);
  end=match.index+match[0].length;
  if(!match[1]){
   for(const [token] of match[0].matchAll(tokenPattern)){
    const shown=show(token);
    if(shown)prompt+=shown;
    else anchors.push({offset:prompt.length,text:token});
   }
   continue;
  }
  const mapped=[...match[2].matchAll(tokenPattern)].map(([token])=>({token,shown:show(token)}));
  if(mapped.every(row=>row.shown===row.token)){
   prompt+=match[0];
   continue;
  }
  if(mapped.every(row=>!row.shown)){
   anchors.push({offset:prompt.length,text:match[0]});
   continue;
  }
  prompt+=match[1];
  let visible=false;
  for(const {token,shown} of mapped){
   if(!shown){anchors.push({offset:prompt.length,text:visible?' '+token:token+' '});continue;}
   if(visible)prompt+=' ';
   prompt+=shown;
   visible=true;
  }
  prompt+=match[3];
 }
 prompt+=source.slice(end);
 const fullAliasByKey=new Map([...aliases].map(([alias,key])=>[key,alias]));
 return {prompt,anchors,aliases,inverse:new Map([...active].map(([key,alias])=>[alias,fullAliasByKey.get(key)]))};
}

export function storyboardPromptEditRange(before,after){
 let start=0,end=before.length,nextEnd=after.length;
 while(start<end&&start<nextEnd&&before[start]===after[start])start++;
 while(end>start&&nextEnd>start&&before[end-1]===after[nextEnd-1]){end--;nextEnd--;}
 return {start,end,text:after.slice(start,nextEnd)};
}

function movedAnchor(offset,before,after,edit){
 if(offset<=edit.start)return offset;
 if(offset>=edit.end)return offset+edit.text.length-(edit.end-edit.start);
 // A paste or undo may change several separated parts in one event. Keep an
 // interior anchor only when its preceding text still has a unique match.
 for(const size of [32,16,8,4]){
  const context=before.slice(Math.max(0,offset-size),offset);
  if(context.length<4||before.indexOf(context)!==offset-context.length||before.lastIndexOf(context)!==offset-context.length)continue;
  const index=after.indexOf(context);
  if(index>=0&&index===after.lastIndexOf(context))return index+context.length;
 }
 return null;
}

export function editStoryboardImageAliases(canonical,projection,nextPrompt){
 if(nextPrompt===projection.prompt)return canonical;
 const tokenPattern=new RegExp(referenceAlias,'g'),runPattern=new RegExp(referenceAliasRun,'g');
 const restore=text=>text.replace(runPattern,run=>run.replace(tokenPattern,token=>{
  const alias=normalizedImageAlias(token);
  return projection.inverse.get(alias)??(projection.aliases.has(alias)?'':token);
 }));
 const edit=storyboardPromptEditRange(projection.prompt,nextPrompt);
 const anchors=projection.anchors.map(anchor=>({...anchor,offset:movedAnchor(anchor.offset,projection.prompt,nextPrompt,edit)}))
  .filter(anchor=>anchor.offset!==null).sort((a,b)=>a.offset-b.offset);
 let prompt='',end=0;
 for(const anchor of anchors){
  prompt+=restore(nextPrompt.slice(end,anchor.offset))+anchor.text;
  end=anchor.offset;
 }
 return prompt+restore(nextPrompt.slice(end));
}

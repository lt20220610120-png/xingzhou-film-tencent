import {linkedPromptBook,entryBindingSignature} from './promptArtBinding.js';
import {beginImportedBinding,importedSnapshot} from './importedArtBinding.js';

export function linkedDistributionBook(snapshot,decisions,accountId){
 const linked=linkedPromptBook(snapshot,decisions,accountId);
 if(Object.values(linked.drafts).every(draft=>draft.referenceBindingMode==='confirmed'))return linked;
 // Keep this distribution local to generation; its store cannot mutate collaboration's roster.
 const sceneMedia={},metadata={},imageRefs=new Map();
 for(const card of snapshot.cards){
  for(const image of card.images){
   if(!card.assetId)continue;
   const id=`${card.assetId}:${image.id}`,ref={id,assetId:card.assetId,imageId:image.id,projectId:snapshot.projectId,name:card.name,category:card.category,kind:'image',url:image.url};
   metadata[id]={category:card.category,name:card.name,description:card.description||'',confirmed:true,origin:'collaboration'};
   imageRefs.set(`${card.uid}:${image.id}`,id);
   for(const scene of card.publishedSceneIds)if(card.sceneIds.includes(scene)){const list=sceneMedia[scene]||=[];if(!list.some(row=>row.id===id))list.push(ref);}
  }
 }
 const {linkedProjectId,...base}=linked;
 let book=beginImportedBinding({...base,sourceLinkedProjectId:linkedProjectId,drafts:{},sceneMedia},accountId);
 book={...book,importedBinding:{...book.importedBinding,metadata}};
 const target=importedSnapshot(book),mapped={};
 for(const entry of linked.entries){
  const draft=linked.drafts[entry.id],original=decisions[entry.sourcePromptId];
  if(draft.referenceBindingMode!=='confirmed'||!original)continue;
  const current=target.entries.find(row=>row.id===entry.id);
  mapped[entry.id]={...original,signature:entryBindingSignature(target,current),needs:original.needs.map(need=>({...need,cardUid:imageRefs.get(`${need.cardUid}:${need.imageId}`)||null,imageId:imageRefs.get(`${need.cardUid}:${need.imageId}`)||null}))};
 }
 return {...book,importedBinding:{...book.importedBinding,decisions:mapped}};
}

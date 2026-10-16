import {numberedReferences,isProjectGenerationReference} from './generationReferences.js';
import {generationReferenceKey,remapGenerationAliases} from './automaticReferences.js';

// collab_media also stores internal asset-image rows. Those belong to the art
// library, not the separately uploaded image/audio/video reference collection.
export function cleanStoryboardReferenceValue(value,projectId) {
 const refs=value.references||[],references=refs.filter(ref=>isProjectGenerationReference(ref,projectId));
 if(references.length===refs.length)return value;
 const order=items=>numberedReferences(items).map(ref=>({key:generationReferenceKey(ref),alias:ref.alias}));
 const after=order(references);
 return {...value,references,prompt:remapGenerationAliases(value.prompt,value.autoReferenceOrder||order(refs),after),autoReferenceOrder:after,autoReferenceSignature:null};
}

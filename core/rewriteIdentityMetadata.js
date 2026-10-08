// Shared schema projection: never drop identity proofs during outline/story reads.
export function identityMetadata(node={}){
 return {...(Array.isArray(node.participantIds)?{participantIds:[...node.participantIds]}:{}),...(Array.isArray(node.sourceActorRefs)?{sourceActorRefs:node.sourceActorRefs.map(r=>({sourceId:r.sourceId,actorId:r.actorId}))}:{}),...(typeof node.identityRevision==='number'?{identityRevision:node.identityRevision}:{}),...(typeof node.identityFingerprint==='string'?{identityFingerprint:node.identityFingerprint}:{}),...(typeof node.identityState==='string'?{identityState:node.identityState}:{}),...(typeof node.locked==='boolean'?{locked:node.locked}:{})};
}
export function withoutIdentityProof(node){const {identityFingerprint,identityRevision,identityState,participantIds,sourceActorRefs,...rest}=node;return rest;}

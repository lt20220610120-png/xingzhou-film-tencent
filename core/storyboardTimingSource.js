// Kept in sync with the cloud copy (Node 18 loads CommonJS synchronously).
const aliasPattern='@(image|图片|图|audio|video)([1-9]\\d*)(?![\\w]|\\.[A-Za-z0-9])';
const groupPattern=new RegExp('[（(][ \\t]*参考[ \\t]*(?:@|(?:'+aliasPattern+'[ \\t]*)+)[）)]','g');
const aliasRunPattern=new RegExp('(?<![\\w.+-])(?:'+aliasPattern+')+','g');
const quotedText=/(“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』|"(?:[^"\\\n]|\\.)*")/;
const markerPattern=/\n【人工指定参考】\r?\n/;
const list=value=>Array.isArray(value)?value:[];

function referenceEvidence(config){
 const references=list(config?.references),types={image:0,audio:0,video:0},names=new Set();
 for(const refs of [references,list(config?.storyboardReferenceBaseline?.references),[...references,...list(config?.storyboardRemovedReferences)]]) {
  const counts={image:0,audio:0,video:0};
  for(const ref of refs){
   const kind=ref?.kind==='asset-image'?'image':ref?.kind;
   if(!Object.hasOwn(counts,kind))continue;
   counts[kind]++;
   if(ref.name)names.add(ref.name);
  }
  for(const kind of Object.keys(types))types[kind]=Math.max(types[kind],counts[kind]);
 }
 return {types,names,hasMaterial:Object.values(types).some(Boolean)};
}

function timingText(body,{types,names},trustedImages){
 const aliases=new RegExp(aliasPattern,'g');
 const known=(_token,kind,index)=>kind==='image'||kind==='图片'||kind==='图'?trustedImages||Number(index)<=types.image:Number(index)<=types[kind];
 const stripGroup=group=>[...group.matchAll(aliases)].every(match=>known(...match))?'':group;
 let text=body.replace(/\r\n?/g,'\n');
 const marker=markerPattern.exec(text);
 if(marker){
  const rows=text.slice(marker.index+marker[0].length).split('\n');
  const isReferenceList=rows.length&&rows.every(line=>{const name=line.replace(groupPattern,stripGroup).trim();return names.has(name);});
  if(isReferenceList)text=text.slice(0,marker.index);
 }
 return text.split(quotedText).map((part,index)=>index%2?part:part.replace(groupPattern,stripGroup)
  .replace(aliasRunPattern,tokens=>tokens.replace(aliases,(...match)=>known(...match)?'':match[0]))
  .replace(/[ \t]+(?=[，、。；：！？）]|$)/gm,'')).join('');
}

function sameStoryboardTimingText(before,previous,after,next){
 if(before===after)return true;
 if(typeof before!=='string'||typeof after!=='string')return false;
 const previousSource=previous?.bindingSourcePrompt??previous?.sceneVoiceSourcePrompt;
 const nextSource=next?.bindingSourcePrompt??next?.sceneVoiceSourcePrompt;
 const previousCompiled=before===previous?.bindingCompiledPrompt||before===previous?.sceneVoiceCompiledPrompt;
 const nextCompiled=after===next?.bindingCompiledPrompt||after===next?.sceneVoiceCompiledPrompt;
 if(previousCompiled&&nextCompiled&&previousSource&&nextSource&&previousSource!==nextSource)return false;
 const knownBefore=referenceEvidence(previous),knownAfter=referenceEvidence(next);
 const proven=Boolean(previousCompiled&&previousSource&&(previousSource===after||previousSource===nextSource)
   ||nextCompiled&&nextSource&&(nextSource===before||nextSource===previousSource));
 if(!proven&&!knownBefore.hasMaterial&&!knownAfter.hasMaterial)return false;
 const left=timingText(before,knownBefore,proven),right=timingText(after,knownAfter,proven);
 return left===right;
}

const estimateTime=timing=>Date.parse(timing?.durationEstimatedAt||'')||0;
const sourceIndex=new WeakMap();
function candidates(rows,id){
 if(!Array.isArray(rows))return [];
 let index=sourceIndex.get(rows);
 if(!index||index.size!==rows.length){
  const byId=new Map();
  for(const entry of rows){
   const key=String(entry?.id||'');
   if(!byId.has(key))byId.set(key,[]);
   byId.get(key).push(entry);
  }
  index={size:rows.length,byId};sourceIndex.set(rows,index);
 }
 return index.byId.get(id)||[];
}
function storyboardTimingIdentity(shot){
 const config=shot?.generationConfig;
 return {sourcePromptId:String(shot?.sourcePromptId||config?.bindingSourcePromptId||shot?.id||''),
  sourceContent:shot?.sourceContent??config?.bindingSourcePrompt??shot?.content??shot?.prompt};
}
function usingDirectorStoryboardTiming(shot,sourceContent){
 const content=shot?.content??shot?.prompt;
 return sameStoryboardTimingText(sourceContent,{bindingSourcePrompt:sourceContent},content,
  {...shot?.generationConfig,bindingSourcePrompt:shot?.generationConfig?.bindingSourcePrompt??sourceContent});
}

function selectStoryboardTiming(binding,shot,metadata,stale,episodeEntries){
 const identity=storyboardTimingIdentity(shot),{sourcePromptId,sourceContent}=identity;
 const direct=metadata(shot),authored=shot?.durationEstimateSource;
 const own=direct.durationEstimate||direct.recommendedDurationSeconds?{...direct,...identity,...(authored?{durationEstimateSource:authored}:{})}:null;
 if(!sourcePromptId||typeof sourceContent!=='string'||!sourceContent.trim())return own;
 const exact=entries=>candidates(entries,sourcePromptId).filter(entry=>String(entry.id)===sourcePromptId&&(entry.prompt??entry.content)===sourceContent).map(metadata);
 const current=[...exact(episodeEntries),...exact(binding?.currentSnapshot?.entries)];
 const historic=[...list(binding?.currentSnapshot?.promptEditions).flatMap(edition=>exact(edition.entries)),
  ...[binding?.snapshot,binding?.saved?.snapshot].filter(Boolean).flatMap(snapshot=>[...exact(snapshot.entries),...list(snapshot.promptEditions).flatMap(edition=>exact(edition.entries))])];
 const modern=current.filter(timing=>timing.durationEstimate);
 const precise=(modern.length?modern:historic.filter(timing=>timing.durationEstimate)).sort((a,b)=>estimateTime(b)-estimateTime(a)||
  Number(b.durationEstimate.status==='estimated')-Number(a.durationEstimate.status==='estimated'))[0];
 const matching=[...current,...historic];
 const legacy=matching.filter(timing=>timing.recommendedDurationSeconds);
 const legacyTiming=legacy.length&&new Set(legacy.map(timing=>timing.recommendedDurationSeconds)).size===1?legacy[0]:null;
 const storyboardEstimate=shot?.durationEstimateSource==='storyboard'&&own?.durationEstimate;
 if(!usingDirectorStoryboardTiming(shot,sourceContent)){
  if(storyboardEstimate)return own;
  const original=own||precise||legacyTiming;
  return original?{...stale(original),...identity}:null;
 }
 if(precise){
  const ownFresh=own?.durationEstimate?.status==='estimated'&&(estimateTime(own)>estimateTime(precise)
    ||storyboardEstimate&&(!estimateTime(own)||estimateTime(own)>=estimateTime(precise)));
  if(!ownFresh)return {...precise,...identity,...(storyboardEstimate?{durationEstimateSource:'director'}:{})};
 }
 return own||(legacyTiming?{...legacyTiming,...identity}:null);
}

export {sameStoryboardTimingText,storyboardTimingIdentity,usingDirectorStoryboardTiming,selectStoryboardTiming};

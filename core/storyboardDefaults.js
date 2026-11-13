export const storyboardSettingKeys=['profileId','model','ratio','duration','resolution','libtvMode','libtvParams','libtvSubmissionMode'];
const storageKey=scope=>'xz-storyboard-defaults:'+JSON.stringify([scope.accountId,scope.projectId,scope.editionId||'legacy']);
export function readStoryboardDefaults(scope,storage=globalThis.localStorage){try{const value=JSON.parse(storage.getItem(storageKey(scope))||'null');return value?.revision&&value.settings?value:null;}catch{return null;}}
export function saveStoryboardDefaults(scope,settings,storage=globalThis.localStorage){
 const value={revision:crypto.randomUUID(),settings:Object.fromEntries(storyboardSettingKeys.filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]))};
 if(!value.settings.profileId||!value.settings.model||!value.settings.ratio||!Number.isFinite(value.settings.duration)||value.settings.duration<=0||value.settings.duration>3600||!value.settings.resolution)throw Error('请补全默认生成设置');
 storage.setItem(storageKey(scope),JSON.stringify(value));return value;
}
export function applyStoryboardDefaults(value,defaults,shotId){
 if(!defaults||value.storyboardDefaultsRevision===defaults.revision)return value;
 const next={...value,libtvMode:'auto',libtvParams:{},...(value.libtvSubmissionMode?{libtvSubmissionMode:'auto'}:{}),...defaults.settings,durationMode:defaults.durationMode==='recommended'?'recommended':'uniform',storyboardDefaultsRevision:defaults.revision};
 if(next.durationMode==='recommended'){
  next.duration=value.duration;
  next.recommendedDurationSeconds=defaults.recommendedDurationSecondsByShot?.[shotId]??defaults.recommendedDurations?.[shotId]??null;
  if(Number.isFinite(defaults.recommendedDurations?.[shotId]))next.duration=defaults.recommendedDurations[shotId];
 }else delete next.recommendedDurationSeconds;
 return next;
}

// Rebase only the acknowledged default-setting delta; unrelated cloud edits
// must continue to trigger optimistic concurrency checks.
export function rebaseStoryboardDefaultsDraft(draft,shot,defaults){
 if(!draft?.base||!defaults||draft.base.content!==shot.content)return draft;
 const expected=applyStoryboardDefaults(draft.base.generationConfig||{},defaults,shot.id);
 const stable=value=>JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)?Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])):row);
 if(stable(expected)!==stable(shot.generationConfig||{}))return draft;
 return {...draft,base:{...draft.base,generationConfig:shot.generationConfig}};
}

export function rebaseLocalStoryboardDraft(draft,shot,project){
 if(project?.storageMode!=='local'||!draft?.base||draft.base.content!==shot.content)return draft;
 const transportKeys=new Set(['url','filePath','localPath','mediaId','objectKey','localUnavailable','previewDataUrl','expiresAt']);
 const canonical=value=>JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
  ?Object.fromEntries(Object.keys(row).sort().filter(k=>!transportKeys.has(k)).map(k=>[k,row[k]])):row);
 if(canonical(draft.base.generationConfig||{})!==canonical(shot.generationConfig||{}))return draft;
 return {...draft,base:{content:shot.content,generationConfig:shot.generationConfig}};
}

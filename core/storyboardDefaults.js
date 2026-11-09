export const storyboardSettingKeys=['profileId','model','ratio','duration','resolution'];
const storageKey=scope=>'xz-storyboard-defaults:'+JSON.stringify([scope.accountId,scope.projectId,scope.editionId||'legacy']);
export function readStoryboardDefaults(scope,storage=globalThis.localStorage){try{const value=JSON.parse(storage.getItem(storageKey(scope))||'null');return value?.revision&&value.settings?value:null;}catch{return null;}}
export function saveStoryboardDefaults(scope,settings,storage=globalThis.localStorage){
 const value={revision:crypto.randomUUID(),settings:Object.fromEntries(storyboardSettingKeys.map(k=>[k,settings[k]]))};
 if(!value.settings.profileId||!value.settings.model||!value.settings.ratio||!Number.isFinite(value.settings.duration)||value.settings.duration<=0||value.settings.duration>3600||!value.settings.resolution)throw Error('请补全默认生成设置');
 storage.setItem(storageKey(scope),JSON.stringify(value));return value;
}
export function applyStoryboardDefaults(value,defaults){
 if(!defaults||value.storyboardDefaultsRevision===defaults.revision)return value;
 return {...value,...defaults.settings,storyboardDefaultsRevision:defaults.revision,libtvMode:'auto',libtvParams:{}};
}

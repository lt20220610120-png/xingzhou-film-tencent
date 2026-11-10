export const MUSE_VIDEO_DURATIONS=Array.from({length:27},(_,i)=>i+4);
export function saveMuseProfiles(state,{endpoint,apiKey,models}){
 const profiles=[...(state.mediaProfiles||[])];
 for(const kind of ['image','video']){
  const model=models.find(m=>m.kind===kind);if(!model)continue;
  const capabilities={ratios:kind==='video'?['16:9','9:16']:['1:1','16:9','9:16','4:3','3:4'],...(kind==='video'?{durations:MUSE_VIDEO_DURATIONS,resolutions:['720p']}:{resolutions:[]}),maxImages:10,maxVideos:0,maxAudios:0};
  const index=profiles.findIndex(p=>p.provider==='museLocal'&&p.kind===kind),old=profiles[index];
  const profile={...old,id:old?.id||'muse-local-'+kind,provider:'museLocal',kind,name:'Muse · '+(kind==='image'?'图片':'视频'),endpoint,apiKey,model:model.id,videoProtocol:'auto',capabilities,modelCatalog:[{...model,...capabilities}]};
  if(index<0)profiles.push(profile);else profiles[index]=profile;
 }
 return {...state,mediaProfiles:profiles};
}

// Repair only this adapter's old duration whitelist; preserve IDs, keys, defaults and drafts.
export function upgradeMuseProfiles(state){
 let changed=false;
 const profiles=(state.mediaProfiles||[]).map(profile=>{
  if(profile.provider!=='museLocal'||profile.kind!=='video'||profile.model!=='muse-video')return profile;
  const match=values=>JSON.stringify(values)===JSON.stringify(MUSE_VIDEO_DURATIONS);
  const catalog=profile.modelCatalog||[];
  if(match(profile.capabilities?.durations)&&catalog.every(m=>m.id!=='muse-video'||match(m.durations)))return profile;
  changed=true;
  return {...profile,capabilities:{...profile.capabilities,durations:MUSE_VIDEO_DURATIONS},modelCatalog:catalog.map(m=>m.id==='muse-video'?{...m,durations:MUSE_VIDEO_DURATIONS}:m)};
 });
 return changed?{...state,mediaProfiles:profiles}:state;
}

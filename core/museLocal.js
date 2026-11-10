export function saveMuseProfiles(state,{endpoint,apiKey,models}){
 const profiles=[...(state.mediaProfiles||[])];
 for(const kind of ['image','video']){
  const model=models.find(m=>m.kind===kind);if(!model)continue;
  const capabilities={ratios:kind==='video'?['16:9','9:16']:['1:1','16:9','9:16','4:3','3:4'],...(kind==='video'?{durations:[5,6,8,10],resolutions:['720p']}:{resolutions:[]}),maxImages:10,maxVideos:0,maxAudios:0};
  const index=profiles.findIndex(p=>p.provider==='museLocal'&&p.kind===kind),old=profiles[index];
  const profile={...old,id:old?.id||'muse-local-'+kind,provider:'museLocal',kind,name:'Muse · '+(kind==='image'?'图片':'视频'),endpoint,apiKey,model:model.id,videoProtocol:'auto',capabilities,modelCatalog:[{...model,...capabilities}]};
  if(index<0)profiles.push(profile);else profiles[index]=profile;
 }
 return {...state,mediaProfiles:profiles};
}

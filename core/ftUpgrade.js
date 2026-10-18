export const FT_UPGRADE_GROUP='ft-upgrade-2850';
export const FT_CONNECTIONS=[
 ['video-compat','FT · 视频兼容接口','video','/v1'],
 ['video-native','FT · 原生视频接口','video','/api/open/v1'],
 ['video-official','FT · 官方渠道接口','video','/api/feituo/v1'],
 ['image-compat','FT · 图片兼容接口','image','/v1'],
 ['image-native','FT · 原生图片接口','image','/api/open/v1'],
].map(([key,name,kind,route])=>({id:FT_UPGRADE_GROUP+'-'+key,name,kind,endpoint:'https://fanke2026.xyz'+route,provider:'fnko',fnkoOwnerGroup:FT_UPGRADE_GROUP,apiKey:'',model:'',modelCatalog:[],capabilities:{},videoProtocol:'auto'}));
export function upgradeLegacyFtConnections(state){
 if(state.clientEdition==='clean-v1'||state.ftConnectionsVersion===1)return state;
 if(!['skills','directorProjects','apiProfiles','mediaProfiles','fruitProjects','scriptProjects'].some(k=>state[k]?.length))return state;
 const retired=new Set((state.mediaProfiles||[]).filter(p=>{try{return new URL(p.endpoint).hostname==='feituokuajing.com';}catch{return false;}}).map(p=>p.id));
 const profiles=(state.mediaProfiles||[]).map(p=>retired.has(p.id)?{...p,legacyTaskOnly:true,name:'FT旧站（仅查询原任务）'}:p);
 for(const template of FT_CONNECTIONS)if(!profiles.some(p=>p.id===template.id))profiles.push({...template,modelCatalog:[],capabilities:{}});
 return {...state,ftConnectionsVersion:1,mediaProfiles:profiles,...(retired.has(state.activeVideoApiId)?{activeVideoApiId:FT_CONNECTIONS[0].id}:{}),...(retired.has(state.activeImageApiId)?{activeImageApiId:FT_CONNECTIONS[3].id}:{})};
}

export const LIBTV_ENDPOINT='https://www.liblib.tv';
export const isLibTV=profile=>profile?.provider==='libtv';
const modesLabel={text2video:'文生视频',singleImage2video:'单图生视频',frames2video:'首尾帧',image2video:'图片参考',video2video:'视频参考',videoEdit2video:'视频编辑',audio2video:'音频驱动',mixed2video:'全能参考',text2image:'文生图',image2image:'参考图生图'};
export const libtvModeLabel=mode=>modesLabel[mode]||mode;
const list=value=>Array.isArray(value)?value:Array.isArray(value?.enum)?value.enum:[];
export const libtvEnum=property=>list(property).map(v=>typeof v==='object'?v.value:v).filter(v=>typeof v==='string'||typeof v==='number'||typeof v==='boolean');
const unsafe=new Set(['__proto__','prototype','constructor']);
export function libtvModel(raw,kind=raw.modality){
 const schema=raw.schema||{},p=schema.properties||{},items=p.modeType?.items||{};
 const durations=libtvEnum(p.duration).map(Number);
 if(!durations.length&&Number.isFinite(p.duration?.min)&&Number.isFinite(p.duration?.max)&&p.duration.max<=3600&&p.duration.max-p.duration.min<=3600)for(let n=p.duration.min;n<=p.duration.max;n+=p.duration.step||1)durations.push(n);
 const maxima=keys=>Math.max(0,...keys.map(k=>Number(items[k]?.[1]||0)));
 return {id:raw.modelKey||raw.id,name:raw.modelName||raw.name||raw.modelKey,kind,schema,
  ratios:libtvEnum(p.ratio),resolutions:libtvEnum(p.resolution),durations,
  maxImages:Math.max(maxima(['image2image','image2video','singleImage2video','frames2video']),Number(p.modeType?.mixed2videoConfig?.imageMax||0),Number(p.modeType?.videoEdit2videoConfig?.imageMaxWithVideo||0)),
  maxVideos:Math.max(maxima(['video2video','videoEdit2video']),Number(p.modeType?.mixed2videoConfig?.videoMax||0)),
  maxAudios:Math.max(maxima(['audio2video']),Number(p.modeType?.mixed2videoConfig?.audioMax||0)),
  ...(p.prompt?.maxLength?{maxPrompt:p.prompt.maxLength}:{})};
}
export function libtvParameters(model,mode){
 const {properties={},config={}}=model.schema||{};
 const keys=bucket=>Array.isArray(bucket)?bucket:bucket?.[mode]||[];
 return [...new Set([...keys(config.settings),...keys(config.advancedSettings)])]
  .filter(k=>!unsafe.has(k)&&properties[k]&&typeof properties[k]==='object')
  .map(key=>({...properties[key],key,label:properties[key].displayName||({quality:'图片清晰度',enableSound:'生成声音',search_enabled:'联网搜索'}[key])||key,options:libtvEnum(properties[key])}));
}
export function libtvMode(model,references=[],chosen){
 const items=model.schema?.properties?.modeType?.items||{};
 const counts={image:references.filter(r=>r.kind==='image').length,video:references.filter(r=>r.kind==='video').length,audio:references.filter(r=>r.kind==='audio').length};
 if(model.kind==='image'){if(counts.video||counts.audio)throw Error('图片模型不支持视频或音频参考');if(counts.image&&!items.image2image)throw Error('此模型不支持参考图');return counts.image?'image2image':'text2image';}
 if(chosen&&chosen!=='auto'){if(!Object.hasOwn(items,chosen))throw Error('此模型不支持选定生成模式');return chosen;}
 const options=counts.video||counts.audio?['mixed2video',...(counts.video&&!counts.audio?['video2video','videoEdit2video']:[]),...(counts.audio&&!counts.video?['audio2video']:[])]:counts.image>1?['image2video','frames2video','mixed2video']:counts.image?['singleImage2video','image2video','mixed2video','frames2video']:['text2video'];
 const found=options.find(k=>Object.hasOwn(items,k));if(!found)throw Error('此模型不支持当前参考组合，请选择其他模型或调整参考');return found;
}
export function libtvGenerationParams(model,input){
 const mode=libtvMode(model,input.references,input.libtvMode),props=model.schema?.properties||{},items=props.modeType?.items||{};
 const refs=input.references||[],count=k=>refs.filter(r=>r.kind===k).length;
 let n=mode==='mixed2video'?count('image')+count('video'):/audio/.test(mode)?count('audio'):/video2video|videoEdit/.test(mode)?count('video'):count('image');
 if(items[mode]&&(n<items[mode][0]||n>items[mode][1]))throw Error('当前模式的参考素材数量不符合模型要求');
 if(mode==='mixed2video')for(const kind of ['image','video','audio']){const max=props.modeType?.mixed2videoConfig?.[kind+'Max'];if(max!=null&&count(kind)>max)throw Error('当前模式的'+kind+'参考超出上限');}
 if(mode==='videoEdit2video'&&count('image')>Number(props.modeType?.videoEdit2videoConfig?.imageMaxWithVideo||0))throw Error('当前视频编辑模式的图片参考超出上限');
 if(mode!=='mixed2video'&&((mode==='text2video'&&refs.length)||(/image|frames/.test(mode)&&(count('video')||count('audio')))||(mode==='video2video'&&(count('image')||count('audio')))||(mode==='videoEdit2video'&&count('audio'))))throw Error('当前模式不支持这组参考素材');
 const custom=input.libtvParams||{};
 for(const k of Object.keys(custom))if(unsafe.has(k)||['model','prompt','count','modeType','imageList','videoList','audioList'].includes(k))throw Error('额外参数不能覆盖模型、提示词、模式或素材');
 const params={model:model.name,prompt:String(input.prompt||''),...(Object.keys(items).length&&(model.kind==='video'||refs.length)?{modeType:mode}:{}),...(props.count?{count:libtvEnum(props.count).includes(1)?1:libtvEnum(props.count)[0]}:{})};
 if(!params.prompt.trim())throw Error('请填写提示词');
 if(props.prompt?.maxLength&&params.prompt.length>props.prompt.maxLength)throw Error('提示词超出当前模型限制');
 const definitions=libtvParameters(model,mode);
 for(const key of Object.keys(custom))if(!definitions.some(p=>p.key===key))throw Error('当前模式未声明参数 '+key);
 for(const property of definitions){
  let value=custom[property.key]??input[property.key]??property.default;
  if(value==null||value==='')continue;
  if(property.options.length&&!property.options.includes(value))throw Error(property.key+' 不在模型允许值中');
  if(property.min!=null&&(Number(value)<property.min||Number(value)>property.max||!Number.isFinite(Number(value))))throw Error(property.key+' 超出模型范围');
  params[property.key]=value;
 }
 for(const rule of model.schema?.rules||[]){
  if(rule.forModeTypes?.length&&!rule.forModeTypes.includes(mode))continue;
  const conditions=(rule.require||[]).map(k=>k==='prompt'?!!params.prompt.trim():k==='media'?refs.length>0:count(k)>0);
  if(conditions.length&&!(rule.mode==='any'?conditions.some(Boolean):conditions.every(Boolean)))throw Error(rule.message||'当前模型需要补充提示词或参考素材');
 }
 return params;
}
export function saveLibTVProfiles(state,{ownerKey,imageModels=[],videoModels=[]}){
 const profiles=[...(state.mediaProfiles||[])];
 for(const [kind,models] of [['image',imageModels],['video',videoModels]]){
  if(!models.length)continue;
  const index=profiles.findIndex(p=>p.provider==='libtv'&&p.kind===kind&&p.libtvOwnerKey===ownerKey),old=profiles[index];
  const selected=models.find(m=>m.id===old?.model)||models[0];
  const item={...old,id:old?.id||`libtv-${kind}-${ownerKey}`,provider:'libtv',kind,name:'LibTV · '+(kind==='image'?'图片':'视频'),endpoint:LIBTV_ENDPOINT,apiKey:'',model:selected.id,capabilities:selected,modelCatalog:models,libtvOwnerKey:ownerKey};
  if(index<0)profiles.push(item);else profiles[index]=item;
 }
 return {...state,mediaProfiles:profiles,activeImageApiId:state.activeImageApiId||profiles.find(p=>p.provider==='libtv'&&p.kind==='image')?.id,activeVideoApiId:state.activeVideoApiId||profiles.find(p=>p.provider==='libtv'&&p.kind==='video')?.id};
}

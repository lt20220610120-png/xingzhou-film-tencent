export const AUTODL_WORKFLOWS=[
 {id:'minimax_h3_zm_u24',name:'H3 多图多音频 · 升级画质'},
 {id:'minimax_h3_zm_u08',name:'H3 多图多音频 · 高速版'},
];
export const autodlCapabilities=()=>({durations:Array.from({length:15},(_,i)=>i+1),resolutions:['768p','480p'],ratios:['9:16','16:9','1:1'],minImages:1,maxImages:9,maxAudios:3,maxVideos:0,maxPrompt:20000});
export const autodlWorkflowCatalog=()=>AUTODL_WORKFLOWS.map(row=>({...row,kind:'video',capabilities:autodlCapabilities()}));
export function autodlResolution(resolution='768p',ratio='9:16'){
 if(!['9:16','16:9','1:1'].includes(ratio))throw Error('AutoDL H3 支持竖屏9:16、横屏16:9和1:1画幅');
 const raw=String(resolution).toLowerCase();
 if(!['480p','768p'].includes(raw))throw Error('AutoDL H3 分辨率请选择480p或768p');
 return raw+({'9:16':'竖','16:9':'横','1:1':'(1:1)'}[ratio]);
}
export function validateAutoDLInput(input){
 if(!/^[a-zA-Z0-9_-]+$/.test(input.model||''))throw Error('AutoDL 工作流ID只能包含字母、数字、下划线和连字符');
 if(!Number.isInteger(Number(input.duration))||Number(input.duration)<1||Number(input.duration)>15)throw Error('AutoDL H3 时长必须是1–15秒整数');
 if(input.prompt.length>20000)throw Error('AutoDL H3 提示词不能超过20000字符');
 autodlResolution(input.resolution,input.ratio);
 if(input.seed!==undefined&&input.seed!==''&&!Number.isSafeInteger(Number(input.seed)))throw Error('随机种子必须是安全范围内的整数');
 const refs=input.references||[],images=refs.filter(r=>r.kind==='image'),audios=refs.filter(r=>r.kind==='audio');
 if(!images.length||images.length>9||audios.length>3||refs.some(r=>r.kind==='video'))throw Error('AutoDL H3 需要1–9张参考图片，最多3段参考音频，不接受参考视频');
 for(const ref of refs)if(ref.filePath){const ext=ref.filePath.split('.').at(-1).toLowerCase();if(!(ref.kind==='image'?['jpg','jpeg','png','webp']:['mp3','wav','mp4','flac']).includes(ext))throw Error('AutoDL H3 图片支持JPG/PNG/WebP，音频支持MP3/WAV/MP4/FLAC');}
}
export function autodlRequest(input,urls){
 const body={prompt:input.prompt,duration:Number(input.duration),resolution:autodlResolution(input.resolution,input.ratio)};
 if(input.seed!==undefined&&input.seed!=='')body.seed=Number(input.seed);
 for(const [kind,prefix] of [['image','ref_image_'],['audio','ref_audio_']])urls[kind].forEach((url,i)=>{body[prefix+i]=url;});
 return body;
}

import {normalizeCapabilities} from './modelCapabilities.js';

export const VIDEO_PROVIDER_PRESETS={
 maxforai:{name:'MaxForAI',endpoint:'https://maxforai.top/v1',videoProtocol:'maxforai'},
 niney:{name:'9Y 视频',endpoint:'https://9yapi.shop/v1',videoProtocol:'niney'},
};

const hostOf=value=>{try{return new URL(value).hostname.toLowerCase();}catch{return '';}};
export function knownVideoProvider(value){
 const host=hostOf(value);
 if(host==='maxforai.top'||host.endsWith('.maxforai.top'))return 'maxforai';
 if(host==='9yapi.shop'||host.endsWith('.9yapi.shop'))return 'niney';
 return '';
}

const commonRatios=['16:9','9:16','1:1','4:3','3:4'];
const everySecond=(start,end)=>Array.from({length:end-start+1},(_,i)=>start+i);
const niney={
 'sd-2.5v5':{durations:everySecond(5,30),resolutions:['720p'],ratios:commonRatios,maxImages:30,maxVideos:0,maxAudios:10,maxPrompt:10000},
 'JMVIP-2.5':{durations:everySecond(4,30),resolutions:['480p','720p'],ratios:commonRatios,maxImages:30,maxVideos:10,maxAudios:10,maxTotalRefs:50,maxPrompt:10000},
 'JM3-2.5-720p':{durations:everySecond(4,30),resolutions:['720p'],ratios:['16:9','9:16'],maxImages:30,maxVideos:10,maxAudios:10,maxPrompt:10000},
 'JM4-2.5-720p':{durations:everySecond(4,30),resolutions:['720p'],ratios:['16:9','9:16'],maxImages:30,maxVideos:10,maxAudios:10,maxPrompt:10000},
 'JM5-2.5-720p':{durations:everySecond(4,30),resolutions:['720p'],ratios:['16:9','9:16','1:1'],maxImages:30,maxVideos:10,maxAudios:10,maxPrompt:10000},
 'JM2-2.5-720p':{durations:everySecond(4,30),resolutions:['720p'],ratios:['16:9','9:16'],maxImages:30,maxVideos:10,maxAudios:10,maxPrompt:10000},
 'jm-2.5-720p':{durations:everySecond(4,30),resolutions:['720p'],ratios:['16:9','9:16'],maxImages:30,maxVideos:10,maxAudios:10,maxPrompt:10000},
 'sd-2.0 v1':{durations:everySecond(5,15),resolutions:['720p'],ratios:['16:9','9:16'],maxImages:9,maxVideos:0,maxAudios:3},
 'sd-2.5v1':{durations:[30],ratios:['16:9','9:16','1:1','4:3','3:4','21:9'],maxImages:9,maxVideos:0,maxAudios:0,maxPrompt:12000},
 'sd-2.5-v2':{durations:[30],resolutions:['720p'],ratios:['16:9','9:16','1:1'],maxImages:30,maxVideos:0,maxAudios:0,maxPrompt:10000},
 'sd-2.5v4':{durations:[30],resolutions:['720p'],ratios:['16:9','9:16','1:1'],maxImages:30,maxVideos:0,maxAudios:10},
 '【满血】SD-2.5-720p':{durations:everySecond(5,30),resolutions:['720p'],ratios:['16:9','9:16'],maxImages:30,maxVideos:10,maxAudios:10},
 '【满血】SD-2.0 720p':{durations:everySecond(4,15),resolutions:['720p'],ratios:['16:9','9:16','1:1'],maxImages:9,maxVideos:0,maxAudios:0},
 '【满血】SD-2.0 fast 720p':{durations:everySecond(4,15),resolutions:['720p'],ratios:['16:9','9:16','1:1'],maxImages:9,maxVideos:0,maxAudios:3},
 '【官转】sd2.0-mini':{durations:everySecond(4,15),resolutions:['480p','720p'],ratios:commonRatios,maxImages:9,maxVideos:3,maxAudios:3},
 '【官转】sd2.0-fast':{durations:everySecond(4,15),resolutions:['480p','720p'],ratios:[...commonRatios,'21:9','adaptive'],maxImages:9,maxVideos:3,maxAudios:3,audioRequiresVisual:true},
 '【官转】sd2.0-满血720':{durations:everySecond(4,15),resolutions:['720p'],ratios:commonRatios,maxImages:9,maxVideos:3,maxAudios:3},
 '【官转】sd-2.5-720p':{durations:everySecond(4,30),resolutions:['720p'],ratios:commonRatios,maxImages:30,maxVideos:10,maxAudios:10},
 '奥特曼h3-768p':{durations:everySecond(5,15),resolutions:['768p'],ratios:['16:9','9:16'],minImages:1,maxImages:1,maxVideos:0,maxAudios:0},
 '【官转】Minimax-H3':{durations:everySecond(4,15),resolutions:['720p','1080p','2K'],ratios:['16:9','9:16'],minImages:1,maxImages:1,maxVideos:0,maxAudios:0},
 'rh-minimaxh3-overseas':{durations:everySecond(4,15),resolutions:['720p'],ratios:['16:9','9:16'],minImages:1,maxImages:1,maxVideos:0,maxAudios:0},
 'wan3.0-特惠版1080p':{durations:everySecond(4,30),resolutions:['1080p'],ratios:commonRatios,maxImages:10,maxVideos:5,maxAudios:5},
 '官转wan3.0-标准版':{durations:everySecond(2,30),resolutions:['480p','720p','1080p'],ratios:commonRatios,maxImages:10,maxVideos:5,maxAudios:5},
 '官转wan3.0-高速版':{durations:everySecond(2,30),resolutions:['480p','720p','1080p'],ratios:commonRatios,maxImages:10,maxVideos:5,maxAudios:5},
 'grok-imagine-video-1.5（按次）':{durations:everySecond(4,15),ratios:['16:9','9:16','1:1'],maxImages:1,maxVideos:0,maxAudios:0},
};

const knownNineyIds=new Set(Object.keys(niney));
const nonVideoPattern=/(?:^gpt-|deepseek|claude|gemini|qwen|glm|kimi|moonshot|embedding|rerank|image|seedream|flux|dall|nano.?banana|tts|speech|audio|whisper)/i;
const videoPattern=/(?:video|视频|seedance|minimax.*h3|wan[\s._-]*3|(?:^|[^a-z])ft[\s._-]|dola|veo|sora|kling|可灵|海螺)/i;
export function providerModelKind(provider,item,purpose=''){
 const explicit=String(item.kind||item.type||item.mode||item.model_info?.mode||'').toLowerCase();
 if(/video/.test(explicit))return 'video';
 if(/image/.test(explicit))return 'image';
 if(/audio|speech|transcription/.test(explicit))return 'audio';
 if(/chat|text|completion|response/.test(explicit))return 'chat';
 const id=String(item.id||item.model_name||item.name||'');
 const modalities=[item.output_modalities,item.architecture?.output_modalities].flat().filter(Boolean).map(x=>String(x).toLowerCase());
 if(modalities.length){if(modalities.some(x=>x.includes('video')))return 'video';if(modalities.some(x=>x.includes('image')))return 'image';if(modalities.some(x=>/audio|speech/.test(x)))return 'audio';if(modalities.some(x=>/text|chat/.test(x)))return 'chat';}
 if(provider==='niney'&&knownNineyIds.has(id))return 'video';
 if(nonVideoPattern.test(id))return /image/i.test(id)?'image':/audio|tts|speech|whisper/i.test(id)?'audio':'chat';
 // Mixed directories need positive video evidence. Untyped models remain
 // available through explicit import or manual ID entry, without paid probing.
 if((provider==='maxforai'||provider==='niney')&&purpose==='video'&&videoPattern.test(id))return 'video';
 return '';
}

export function providerVideoCapabilities(provider,model){
 if(provider==='niney'&&niney[model])return normalizeCapabilities(niney[model]);
 if(provider==='maxforai')return normalizeCapabilities({durations:[5,10,15,30],resolutions:['480p','720p','1080p'],ratios:[...commonRatios,'21:9'],maxImages:30,maxVideos:10,maxAudios:10});
 if(provider==='niney')return normalizeCapabilities({durations:[5,10,15,30],resolutions:['720p'],ratios:commonRatios});
 return {};
}

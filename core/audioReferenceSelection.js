import {numberedReferences} from './generationReferences.js';
export function assertMinimumReferenceImages(references,caps={}){
 const minimum=caps.minImages||0;
 if(minimum&&references.filter(ref=>ref.kind==='image').length<minimum)throw Error(`当前模型至少需要 ${minimum} 张参考图片`);
}
export function selectAudioReferences(input,caps={}){
 const all=input.references||[],nonAudio=all.filter(r=>r.kind!=='audio');
 if(!all.some(r=>r.kind==='audio'))return input;
 const hasImage=nonAudio.some(ref=>ref.kind==='image');
 const hasVisual=hasImage||nonAudio.some(ref=>ref.kind==='video');
 const limit=caps.audioRequiresImage&&!hasImage||caps.audioRequiresVisual&&!hasVisual?0:
  Math.max(0,Math.min(Number.isFinite(caps.maxAudios)?caps.maxAudios:0,Number.isFinite(caps.maxTotalRefs)?caps.maxTotalRefs-nonAudio.length:Infinity));
 const ids=new Set(),references=all.filter(r=>{if(r.kind!=='audio')return true;if(ids.has(r.id)||ids.size>=limit)return false;ids.add(r.id);return true;});
 const aliases=new Map(numberedReferences(references).map(r=>[r.id,r.alias]));
 const mapping=new Map(numberedReferences(all).filter(r=>r.kind==='audio').map(r=>[r.alias,aliases.get(r.id)||'']));
 let prompt=String(input.prompt||'').replace(/@audio\d+\b/g,alias=>mapping.has(alias)?mapping.get(alias):alias);
 prompt=prompt.split('\n').filter(line=>!(/：使用\s*的音色；对白仍按本条剧本。/.test(line))).join('\n').replace(/[（(]参考\s*[）)]/g,'');
 return {...input,prompt,references,audioReferenceSelection:{selected:references.filter(r=>r.kind==='audio').map(r=>r.id),omitted:all.filter(r=>r.kind==='audio'&&!ids.has(r.id)).map(r=>r.id),limit}};
}

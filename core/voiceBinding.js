import {numberedReferences} from './generationReferences.js';
export const entryVoiceCards=(snapshot,entry)=>(snapshot.voiceCards||[]).filter(v=>v.sceneIds.includes(entry.sceneId)&&(!v.entryIds||v.entryIds.includes(entry.id)));
export const VOICE_BINDING_RULE='另行读取提示词全文的正常对白。图片入镜与讲话分别判断；不能因人物可见、被提及或出现姓名就附音频。排除旁白、画外音、电话画外声、心声/OS/VO。返回 speakers:[{"voiceUid":"本场音色uid","evidence":"含说话人及其正常对白的连续原文","kind":"dialogue"}]。只选实际说话且有对应音色的人物，不使用的音频不返回，无人讲话或没有对应音色为[]。文件名只是身份线索，不代表已听取音频；不确定不猜测。';
export function voiceBindingData(snapshot,entry){return {voiceCards:entryVoiceCards(snapshot,entry).map(v=>({uid:v.uid,name:v.name,description:v.description||''})),dialogueSource:entry.prompt};}
export function applyVoiceBinding(snapshot,entry,decision,speakers){
 const cards=entryVoiceCards(snapshot,entry);
 if(!cards.length&&!speakers?.length)return {...decision,speakers:[]};
 if(!Array.isArray(speakers))throw Error('AI 未判断本条讲话人物，请重新分发');
 const seen=new Set();const selected=speakers.map(s=>{
  const card=cards.find(c=>c.uid===s.voiceUid);if(!card||seen.has(s.voiceUid))throw Error('AI 音色不属于本场或重复');seen.add(s.voiceUid);
  if(typeof s.evidence!=='string'||!s.evidence.trim()||!entry.prompt.includes(s.evidence))throw Error('音色关联缺少逐字原文依据');
  if(s.kind!=='dialogue'||/(?:旁白|画外音|心声|内心独白|\bOS\b|\bVO\b)/i.test(s.evidence.split(/[：:]/)[0]))throw Error('音色关联只允许正常对白');
  return {voiceUid:s.voiceUid,evidence:s.evidence,kind:'dialogue'};
 });return {...decision,speakers:selected};
}
export function compileVoiceBinding(snapshot,entry,decision,compiled){
 const checked=applyVoiceBinding(snapshot,entry,decision,decision?.speakers),references=[...compiled.references];
 const selected=checked.speakers.map(s=>({...entryVoiceCards(snapshot,entry).find(c=>c.uid===s.voiceUid),evidence:s.evidence}));
 for(const c of selected)if(!references.some(r=>r.id===c.reference.id))references.push({...c.reference,kind:'audio',characterName:c.name});
 const aliases=new Map(numberedReferences(references).map(r=>[r.id,r.alias]));
 const text=selected.length?'\n【人物正常对白音色参考】\n'+selected.map(c=>`${c.name}：使用 ${aliases.get(c.reference.id)} 的音色；对白仍按本条剧本。`).join('\n'):'';
 return {...compiled,prompt:compiled.prompt+text,references};
}

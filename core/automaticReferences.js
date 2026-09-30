import {numberedReferences} from './generationReferences.js';

const ALIAS=/@(image|audio|video)\d+(?!\d)/g;
const FIELD_CATEGORY={人物:'character',场景:'scene',道具:'prop',音色:'audio'};
const TIME_OR_POSITION=/^(?:凌晨|清晨|黎明|早晨|上午|中午|午后|下午|黄昏|傍晚|白天|晚上|深夜|午夜|日|夜|晨|内|外)$/;
const normalizeName=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/q版的/g,'q版').replace(/的/g,'').replace(/[\s【】\[\]（）()·•]/g,'');
export const generationReferenceKey=ref=>`${ref.kind}:${ref.id||ref.filePath||ref.url||ref.name}`;

// Only the four subject fields inside 基础设定 participate. Descriptive commas
// belong to the current entry; semicolons/newlines outside parentheses begin another.
function basicSubjects(prompt) {
 const marker=/[【\[]基础设定[】\]]/.exec(prompt);
 if(!marker)return [];
 const start=marker.index+marker[0].length;
 const tail=prompt.slice(start),heading=/\n[ \t]*[【\[][^\r\n【】\[\]]+[】\]]/.exec(tail);
 const block=tail.slice(0,heading?.index??tail.length);
 const fields=[...block.matchAll(/(?:^|\n)[ \t]*(人物|场景|道具|音色)[ \t]*[：:]/g)];
 const subjects=[];
 fields.forEach((field,i)=>{
  const from=field.index+field[0].length,to=fields[i+1]?.index??block.length;
  let segmentStart=from,depth=0;
  const consume=end=>{
   const segment=block.slice(segmentStart,end);
   let offset=segment.search(/[^\s•·]/);
   if(offset<0)return;
   if(field[1]==='场景') {
    let rest=segment.slice(offset),skip;
    while((skip=/^([^，,、\s]+)[，,、\s]+/.exec(rest))&&TIME_OR_POSITION.test(skip[1])){offset+=skip[0].length;rest=segment.slice(offset);}
   }
   const head=segment.slice(offset).split(/[，,（(。.!！：:@]/)[0].trim();
   if(!head||/^(?:无|没有|暂无|无其他|限制|说明)/.test(head))return;
   const headStart=start+segmentStart+offset;
   subjects.push({field:field[1],name:head,start:headStart,end:headStart+head.length});
  };
  for(let p=from;p<to;p++) {
   const char=block[p];
   if(char==='（'||char==='(')depth++;
   else if(char==='）'||char===')')depth=Math.max(0,depth-1);
   else if(!depth&&/[；;\n\r]/.test(char)){consume(p);segmentStart=p+1;}
  }
  consume(to);
 });
 return subjects;
}

function mediaNames(ref) {
 return [...new Set([ref.name,ref.filename].filter(Boolean).flatMap(name=>{
  const clean=String(name).split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,5}$/i,'').replace(/^\s*\d+[\s._-]+/,'');
  const bracket=clean.match(/[【\[]([^】\]]+)[】\]]/)?.[1]||clean;
  return [bracket,bracket.split(/[-_]/)[0]].map(normalizeName).filter(Boolean);
 }))];
}

function matchScore(subject,ref) {
 const expected=FIELD_CATEGORY[subject.field];
 if(ref.kind!==(expected==='audio'?'audio':'image'))return 0;
 if(ref.category&&ref.category!==expected)return 0;
 const subjectName=normalizeName(subject.name);
 return Math.max(0,...mediaNames(ref).map(name=>{
  if(name===subjectName)return 1000+subjectName.length;
  if(subjectName.length>=2&&name.startsWith(subjectName)) {
   const suffix=name.slice(subjectName.length);
   const appearance=/^(?:(?:日常|居家|校园|夏季|冬季|春季|秋季|成年|少年|青年|中年|老年|古装|现代|战斗|受伤|重伤|轻伤|黑化|幼年|童年|正面|侧面|背面|三视图|全身|半身|特写|造型)|(?:(?:白色|黑色|蓝色|红色|绿色|灰色|深色|浅色)?(?:校服|制服|常服|便服|礼服|婚纱|便装|睡衣|西装|长袍|剑道服|战甲|铠甲|道袍|运动服|古装)))+$/;
   const location=/^(?:内|外|内景|外景|室内|室外|日|夜|白天|夜晚|清晨|黄昏|全景|远景|近景|特写)+$/;
   const count=/^(?:\d+|[一二两三四五六七八九十]+)(?:个|盒|把|只|件|张|瓶|辆)$/;
   if(expected==='character'?appearance.test(suffix):expected==='scene'?location.test(suffix):expected==='prop'?count.test(suffix):/^(?:音色|声音|配音|语音|声线|参考|男声|女声|低声|轻声|对白)+$/.test(suffix))return 500+subjectName.length;
  }
  // A location may end in 内/外 and a prop may carry a count. Do not treat
  // narrative continuations beginning with a person's name as another subject.
  if(name.length>=2&&subjectName.startsWith(name)&&/^(?:内|外|室内|室外|\d+个|[一二两三四五六七八九十]+(?:个|盒|把|只|件|张|瓶|辆)|玩偶)$/.test(subjectName.slice(name.length)))return 500+name.length;
  return 0;
 }));
}

function fingerprint(data) {
 const text=JSON.stringify(data);let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
 return `basic-v1:${text.length}:${a>>>0}:${b>>>0}`;
}
const visibleOrder=(references,allowedKinds)=>numberedReferences(references.filter(r=>allowedKinds.includes(r.kind))).map(r=>({key:generationReferenceKey(r),alias:r.alias}));

export function selectionAfterPromptEdit(selection,{start,end,text}) {
 const move=position=>position<start?position:position>=end?position+text.length-(end-start):start;
 return {...selection,start:move(selection.start),end:move(selection.end)};
}

function replacePromptRange(prompt,start,end,text,onPromptEdit) {
 if(prompt.slice(start,end)===text)return prompt;
 onPromptEdit?.({start,end,text});
 return prompt.slice(0,start)+text+prompt.slice(end);
}
function replacePromptMatches(prompt,pattern,replacement,onPromptEdit) {
 const matches=[...prompt.matchAll(pattern)];
 for(const match of matches.reverse())prompt=replacePromptRange(prompt,match.index,match.index+match[0].length,replacement(match),onPromptEdit);
 return prompt;
}

export function remapGenerationAliases(prompt,before,after,onPromptEdit) {
 const old=new Map(before.map(r=>[r.alias,r.key])),next=new Map(after.map(r=>[r.key,r.alias]));
 let text=replacePromptMatches(String(prompt||''),ALIAS,([alias])=>old.has(alias)?next.get(old.get(alias))||'':alias,onPromptEdit);
 text=replacePromptMatches(text,/[（(]参考[ \t]*[）)]/g,()=>'',onPromptEdit);
 return replacePromptMatches(text,/[（(](参考)[ \t]+(@[^）)]+)[）)]/g,match=>`（${match[1]}${match[2]}）`,onPromptEdit);
}

export function removeGenerationReference(value,key,{allowedKinds=['image','audio','video']}={}) {
 const references=(value.references||[]).filter(r=>generationReferenceKey(r)!==key);
 const before=value.autoReferenceOrder||visibleOrder(value.references||[],allowedKinds),after=visibleOrder(references,allowedKinds);
 return {...value,references,prompt:remapGenerationAliases(value.prompt,before,after),autoReferenceOrder:after,autoReferenceSignature:null,autoReferenceExclusions:[...new Set([...(value.autoReferenceExclusions||[]),key])]};
}

// Persist the signature and identities in each draft. A description edit or a
// manually erased tag is left alone; new names/media/models trigger a new match.
export function matchBasicReferences(value,candidates=value.references||[],{allowedKinds=['image','audio','video'],onPromptEdit}={}) {
 const originalPrompt=String(value.prompt||''),subjects=basicSubjects(originalPrompt);
 if(!subjects.length&&!value.autoReferenceOrder)return value;
 const references=[...(value.references||[])];
 const pool=[...new Map([...references,...candidates].map(r=>[generationReferenceKey(r),r])).values()];
 const excluded=new Set(value.autoReferenceExclusions||[]);
 const subjectNames=subjects.map(s=>[s.field,normalizeName(s.name)]);
 const signature=refs=>fingerprint([subjectNames,pool.map(r=>[generationReferenceKey(r),r.name,r.filename,r.category]),refs.map(generationReferenceKey),[...excluded].sort(),allowedKinds]);
 if(value.autoReferenceSignature===signature(references))return value;
 const matched=new Map(subjects.map(s=>[s,[]]));
 for(const ref of pool) {
  if(excluded.has(generationReferenceKey(ref))||!allowedKinds.includes(ref.kind))continue;
  const scores=subjects.map(s=>matchScore(s,ref)),best=Math.max(0,...scores);
  if(!best)continue;
  subjects.forEach((s,i)=>{if(scores[i]===best)matched.get(s).push(ref);});
  if(!references.some(r=>generationReferenceKey(r)===generationReferenceKey(ref)))references.push(ref);
 }
 const after=visibleOrder(references,allowedKinds);
 const before=value.autoReferenceOrder||visibleOrder(value.references||[],allowedKinds);
 let prompt=remapGenerationAliases(originalPrompt,before,after,onPromptEdit);
 // Re-read offsets because removing/remapping aliases can change their lengths.
 const updatedSubjects=basicSubjects(prompt),aliases=new Map(after.map(r=>[r.key,r.alias]));
 for(let i=updatedSubjects.length-1;i>=0;i--) {
  const subject=updatedSubjects[i],found=matched.get(subjects[i])||[];
  if(!found.length)continue;
  const rest=prompt.slice(subject.end);
  const group=/^[ \t]*[（(]参考[ \t]*((?:@(?:image|audio|video)\d+\s*)*|@)[）)]/.exec(rest);
  const direct=!group&&/^(?:[ \t]*@(?:image|audio|video)\d+)+/.exec(rest);
  const existing=(group?.[1]||direct?.[0]||'').match(ALIAS)||[];
  const all=[...new Set([...existing,...found.map(r=>aliases.get(generationReferenceKey(r))).filter(Boolean)])];
  const tag=`（参考${all.join(' ')}）`;
  prompt=replacePromptRange(prompt,subject.end,subject.end+(group?.[0].length||direct?.[0].length||0),tag,onPromptEdit);
 }
 return {...value,prompt,references,autoReferenceOrder:after,autoReferenceSignature:signature(references)};
}

export function projectReferenceCandidates(assets,media,projectId,episode) {
 const belongs=asset=>!asset.episodes?.length||asset.episodes.some(n=>Number(n)===Number(episode));
 return [
  ...(assets||[]).filter(belongs).flatMap(a=>(a.images?.length?a.images:(a.image_url?[{id:a.id,url:a.image_url}]:[])).filter(i=>i.url).map(i=>({id:i.id,imageId:i.id===a.id?'legacy':i.id,projectId,assetId:a.id,url:i.url,kind:'image',name:a.name,filename:i.filename,category:a.category}))),
  ...(media||[]).filter(m=>Number(m.episode)===Number(episode)).map(m=>({...m,name:m.filename||m.name||m.note||'参考素材'})),
 ];
}

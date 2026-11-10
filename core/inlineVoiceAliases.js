// Attach aliases in existing voice clauses; never append generated prose.
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function voiceSettingSlots(prompt,cards){
 const text=String(prompt||''),slots=[];const start=text.search(/【基础(?:设定|信息)】/);const next=start<0?-1:text.slice(start+1).search(/【[^】]+】/);const end=next<0?text.length:start+1+next;
 const matcher=/^(\s*音色[：:])([^\r\n]*)/gm;let line;
 while((line=matcher.exec(text))){if(start>=0&&(line.index<start||line.index>=end))continue;const contentStart=line.index+line[1].length;const segment=/[^；;]+/g;let match;
  while((match=segment.exec(line[2]))){const clause=match[0],trim=clause.trim();let candidates=cards.filter(card=>[card.name,card.characterName].filter(Boolean).some(name=>new RegExp('^(?:【)?'+escape(String(name).replace(/^【|】$/g,''))+'(?:】)?(?=[，,\\s（(:：。]|内心|心声|OS|VO|$)','i').test(trim)));
   if(candidates.length>1){const stages=candidates.filter(c=>c.ageStage&&c.ageStage!=='default'&&clause.includes(c.ageStage));if(stages.length===1)candidates=stages;}
   if(candidates.length===1)slots.push({start:contentStart+match.index,end:contentStart+match.index+clause.length,text:clause,card:candidates[0]});
  }
 }
 return slots;
}
export function inlineVoiceAliases(prompt,cards,{onPromptEdit}={}){
 let text=String(prompt||'');const slots=voiceSettingSlots(text,cards);
 for(const slot of [...slots].reverse()){
  const stripped=slot.text.replace(/[（(]参考\s*(?:(?:@audio\d+\s*)+|@)[）)]/g,'');const match=stripped.match(/([。.!！?？\s]*)$/);const suffix=match?.[0]||'';const body=stripped.slice(0,stripped.length-suffix.length);
  const replacement=body+'（参考'+slot.card.alias+'）'+suffix;
  if(replacement!==slot.text){let prefix=0,back=0;while(prefix<Math.min(replacement.length,slot.text.length)&&replacement[prefix]===slot.text[prefix])prefix++;while(back<Math.min(replacement.length,slot.text.length)-prefix&&replacement[replacement.length-1-back]===slot.text[slot.text.length-1-back])back++;onPromptEdit?.({start:slot.start+prefix,end:slot.end-back,text:replacement.slice(prefix,replacement.length-back)});}
  text=text.slice(0,slot.start)+replacement+text.slice(slot.end);
 }
 // Older prompts without a voice field: annotate the existing explicit dialogue speaker only.
 const matched=new Set(slots.map(s=>s.card.uid||s.card.id));
 for(const card of cards){if(matched.has(card.uid||card.id))continue;const name=String(card.characterName||card.name||'').replace(/^【|】$/g,'');if(!name)continue;const pattern=new RegExp('(^|[\\n。！？])('+escape(name)+')(?=[：:])','m');text=text.replace(pattern,(_,prefix,speaker)=>prefix+speaker+'（参考'+card.alias+'）');}
 return text;
}

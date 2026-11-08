// Read only explicit speech declarations; visual cast lists never imply speech.
export const nonDialogueVoiceLabel=/(?:旁白|画外[音声]|电话|心声|内心独白|独白旁述|(?:^|[^a-z])(?:OS|VO|V\s*\.\s*O\.?|O\s*\.\s*S\.?)(?=$|[^a-z]))/i;
export function explicitDialogueLines(text,{prompt=false}={}){
 const rows=[];let dialogueSection=!prompt;
 for(const line of String(text||'').split(/\r?\n/)){
  const heading=/^\s*[【\[]([^】\]]+)[】\]]/.exec(line);
  if(heading&&prompt){dialogueSection=/台词|对白/.test(heading[1]);continue;}
  const structured=/^\s*D\s*\d+\s*[｜|]\s*([^｜|]+)\s*[｜|]\s*(现场对白|正常对白|对白)\s*[｜|].+?[『「“]([^』」”]+)[』」”]/u.exec(line);
  if(structured){if(!nonDialogueVoiceLabel.test(structured[1]))rows.push({name:structured[1].trim(),quote:structured[3],evidence:line.trim()});continue;}
  if(!dialogueSection)continue;
  const labelled=/^\s*(?:[-•]\s*)?([^：:｜|]{1,40})\s*[：:]\s*(.+)\s*$/u.exec(line);if(!labelled||nonDialogueVoiceLabel.test(labelled[1]))continue;
  const name=labelled[1].replace(/[（(][^）)]*[）)]/g,'').trim();
  if(!name||/[，,。！？；;【】]/.test(name))continue;
  rows.push({name,quote:labelled[2].trim(),evidence:line.trim()});
 }
 return rows;
}
export function uniqueDialogueIdentity(cards,name){
 const exact=cards.filter(c=>(c.characterName||c.name)===name);
 const candidates=exact.length?exact:/^(助理|护士|医生|秘书|司机|保镖)$/u.test(name)?cards.filter(c=>(c.characterName||c.name).endsWith(name)):[];
 return candidates.length===1?candidates[0]:null;
}
export const voiceAssociationIdentity=c=>[c.uid,c.name,c.characterName||c.name,c.ageStage||'default'];

import {numberedReferences,referenceName} from './generationReferences.js';

export function activePromptMention(text,selectionStart,selectionEnd=selectionStart){
 if(selectionStart!==selectionEnd)return null;
 const before=String(text||'').slice(0,selectionStart);
 const start=before.lastIndexOf('@');
 if(start<0||/[a-z\d._+\-]/i.test(before[start-1]||''))return null;
 const query=before.slice(start+1);
 if(query.length>50||/[\s@，。；：,.!?()[\]{}（）<>]/u.test(query))return null;
 return {start,end:selectionStart,query};
}

export function insertPromptReference(text,selectionStart,selectionEnd,alias){
 const source=String(text||''),mention=activePromptMention(source,selectionStart,selectionEnd);
 const start=mention?.start??selectionStart,end=selectionEnd;
 const before=source.slice(0,start),after=source.slice(end);
 const prefix=mention||!before||/[\s([{（，。；：]/u.test(before.at(-1))?'':' ';
 const suffix=!after||/[\s)\]}）,.!?，。；：]/u.test(after[0])?'':' ';
 return {text:before+prefix+alias+suffix+after,caret:before.length+prefix.length+alias.length};
}

export function matchingPromptReferences(references,query){
 const needle=String(query||'').trim().toLocaleLowerCase();
 return numberedReferences(references||[]).filter(ref=>!needle||[ref.alias.slice(1),ref.name,referenceName(ref.name),{image:'图片',audio:'音频',video:'视频'}[ref.kind]].some(value=>String(value||'').toLocaleLowerCase().includes(needle)));
}

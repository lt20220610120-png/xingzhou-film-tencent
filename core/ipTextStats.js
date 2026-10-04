import { formatIPScriptText } from './ipScenes.js';

// Count what the textarea displays: heading syntax is hidden for scripts,
// a line break is one character, and astral characters are counted once.
export function countIPDisplayCharacters(text,{script=true}={}){
 const displayed=script?formatIPScriptText(text):String(text||'');
 return Array.from(displayed.replace(/\r\n|\r/g,'\n')).length;
}

export function ipEditorCharacterStats(content,sceneContent){
 return {total:countIPDisplayCharacters(content),scene:sceneContent===undefined?null:countIPDisplayCharacters(sceneContent)};
}

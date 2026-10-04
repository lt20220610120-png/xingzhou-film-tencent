// Unlike the director's display parser this editor must preserve every byte
// outside the edited scene, including the episode title and CRLF separators.
export function splitIPScenes(text) {
 const source=String(text||'');
 const matches=[...source.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(?:[【\[]?[ \t]*场景[ \t]*)?(\d+)[ \t]*[-—－][ \t]*(\d+)(?=[ \t:：.【\]】]|$)[^\r\n]*/gm)];
 return matches.map((m,i)=>({id:`${m[1]}-${m[2]}:${i}`,label:`${m[1]}-${m[2]}`,title:m[0].replace(/^[ \t]*#{1,6}[ \t]*/,''),start:m.index,end:matches[i+1]?.index??source.length,content:source.slice(m.index,matches[i+1]?.index??source.length)}));
}
export function replaceIPScene(text,sceneId,content) {
 const scene=splitIPScenes(text).find(s=>s.id===sceneId);
 if(!scene)throw new Error('场景已变化，请重新选择');
 const boundary=scene.end<text.length&&!/[\r\n]$/.test(content)?(text.slice(scene.start,scene.end).match(/(?:\r\n|\n|\r)+$/)?.[0]||'\n'):'';
 return text.slice(0,scene.start)+content+boundary+text.slice(scene.end);
}

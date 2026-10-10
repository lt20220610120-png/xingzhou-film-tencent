import * as Y from 'yjs';
export {Y};
const key = path => JSON.stringify(path);
// ID arrays are sets of independently editable records, ordered by their rank.
// Adding a prompt in one episode never replaces another member's prompt list.
export function flattenDocument(document) {
 const out=new Map();
 function walk(value,path){
  if(Array.isArray(value)&&value.every(v=>v&&typeof v==='object'&&typeof v.id==='string')){
   out.set(key([...path,'@kind']),{type:'value',value:'records'});
   const ids=new Set();value.forEach((v,i)=>{if(ids.has(v.id))throw Error('文档包含重复记录编号');ids.add(v.id);out.set(key([...path,'@rank',v.id]),{type:'value',value:i});walk(v,[...path,'@item',v.id]);});
  }else if(value&&typeof value==='object'&&!Array.isArray(value)){
   out.set(key([...path,'@kind']),{type:'value',value:'object'});
   for(const [name,v] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(name)||name.startsWith('@'))continue;if(v!==undefined)walk(v,[...path,name]);}
  }else out.set(key(path),{type:typeof value==='string'?'text':'value',value});
 }
 walk(document,[]);return out;
}
export function replaceText(text,next){
 const before=text.toString();if(before===next)return;
 let start=0,end=0;while(start<before.length&&start<next.length&&before[start]===next[start])start++;
 while(end<before.length-start&&end<next.length-start&&before[before.length-1-end]===next[next.length-1-end])end++;
 // Avoid splitting UTF-16 surrogate pairs at the edit boundary.
 if(start&&/[\uD800-\uDBFF]/.test(before[start-1]))start--;
 if(end&&/[\uDC00-\uDFFF]/.test(before[before.length-end]))end--;
 if(before.length-start-end)text.delete(start,before.length-start-end);
 if(next.length-start-end)text.insert(start,next.slice(start,next.length-end));
}
export function editDocument(doc,base,next,origin='local'){
 const previous=flattenDocument(base),desired=flattenDocument(next),fields=doc.getMap('fields');
 doc.transact(()=>{
  for(const [k,v] of desired){const old=previous.get(k);if(fields.has(k)&&old?.type===v.type&&JSON.stringify(old.value)===JSON.stringify(v.value))continue;
   if(v.type==='text'){if(!fields.get(k)?.text)fields.set(k,{text:true});replaceText(doc.getText('text:'+k),String(v.value));}
   else fields.set(k,v.value);
  }
  for(const k of previous.keys())if(!desired.has(k))fields.delete(k);
 },origin);
}
export function seedDocument(value){const doc=new Y.Doc();editDocument(doc,undefined,value,'seed');return doc;}
export function readDocument(doc){
 const fields=doc.getMap('fields'),nodes=new Map();
 function node(path){const k=key(path);if(nodes.has(k))return nodes.get(k);const value={children:new Map()};nodes.set(k,value);if(path.length)node(path.slice(0,-1)).children.set(path.at(-1),value);return value;}
 for(const [k,v] of fields){const path=JSON.parse(k);if(!Array.isArray(path)||path.length>30||path.some(s=>typeof s!=='string'||['__proto__','constructor','prototype'].includes(s)))throw Error('协作文档字段无效');node(path).value=v?.text===true?doc.getText('text:'+k).toString():v;}
 function materialize(n){const kind=n.children.get('@kind')?.value;
  if(kind==='records'){const ranks=n.children.get('@rank')?.children||new Map(),items=n.children.get('@item')?.children||new Map();return [...items].filter(([id])=>ranks.has(id)).sort(([a],[b])=>(ranks.get(a).value-ranks.get(b).value)||a.localeCompare(b)).map(([,v])=>materialize(v));}
  if(kind==='object'){const result={};for(const [k,v] of n.children)if(!k.startsWith('@'))result[k]=materialize(v);return result;}
  return n.value;
 }
 return materialize(node([]));
}
export const encode64=bytes=>typeof Buffer!=='undefined'?Buffer.from(bytes).toString('base64'):btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(''));
export const decode64=value=>typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(value,'base64')):Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export function projectDocument(project){return {name:project.name||'',script:project.masterScript??project.script??'',episodes:project.episodes||[],style:project.style||'',aspectRatio:project.aspectRatio||''};}

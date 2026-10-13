import * as Y from 'yjs';
export {Y};
const key = path => JSON.stringify(path);
export const LIVE_PROTOCOL=3;
export const documentEpoch=doc=>doc.getMap('fields').get(key(['@epoch']));
export const documentProtocol=doc=>doc.getMap('fields').get(key(['@protocol']))||0;
const editableText=path=>path.length===1&&path[0]==='script'||path[0]==='episodes'&&(path.includes('quickSceneEdits')||path.includes('sceneVisions')||['content','text','directorVision'].includes(path.at(-1))&&!path.includes('quickScenePlans'));
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
  }else out.set(key(path),{type:typeof value==='string'&&editableText(path)?'text':'value',value});
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
export function seedDocument(value){const doc=new Y.Doc();editDocument(doc,undefined,value,'seed');doc.transact(()=>{const fields=doc.getMap('fields');fields.set(key(['@protocol']),LIVE_PROTOCOL);fields.set(key(['@epoch']),globalThis.crypto?.randomUUID?.()||`${doc.clientID}-${Date.now()}-${Math.random()}`);},'seed');return doc;}
export function assertCompatibleUpdate(doc,update){
 const vector=Y.decodeStateVector(Y.encodeStateVector(doc));
 for(const item of Y.decodeUpdate(update).structs){
  if((vector.get(item.id.client)||0)>item.id.clock)continue;
  if(item.parent==='fields'&&['["@kind"]','["@protocol"]','["@epoch"]'].includes(item.parentSub))throw Error('协作增量来自不同初始化基准，已停止合入并保留本地草稿');
  if(item.parent==='fields'&&item.content?.getContent?.()[0]?.text===true){const p=JSON.parse(item.parentSub);if(!editableText(p))throw Error('协作结构字段不能作为逐字文本合并，请升级软件');}
 }
}
export function readDocument(doc){
 const fields=doc.getMap('fields'),nodes=new Map();
 function node(path){const k=key(path);if(nodes.has(k))return nodes.get(k);const value={children:new Map()};nodes.set(k,value);if(path.length)node(path.slice(0,-1)).children.set(path.at(-1),value);return value;}
 for(const [k,v] of fields){const path=JSON.parse(k);if(!Array.isArray(path)||path.length>30||path.some(s=>typeof s!=='string'||['__proto__','constructor','prototype'].includes(s)))throw Error('协作文档字段无效');node(path).value=v?.text===true?doc.getText('text:'+k).toString():v;}
 function materialize(n){const kind=n.children.get('@kind')?.value;
  if(kind==='records'){const ranks=n.children.get('@rank')?.children||new Map(),items=n.children.get('@item')?.children||new Map();return [...items].filter(([id])=>ranks.has(id)).sort(([a],[b])=>(ranks.get(a).value-ranks.get(b).value)||a.localeCompare(b)).map(([id,v])=>{const value=materialize(v);return documentProtocol(doc)===LIVE_PROTOCOL?{...value,id}:value;});}
  if(kind==='object'){const result={};for(const [k,v] of n.children)if(!k.startsWith('@'))result[k]=materialize(v);return result;}
  return n.value;
 }
 return materialize(node([]));
}
export const encode64=bytes=>typeof Buffer!=='undefined'?Buffer.from(bytes).toString('base64'):btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(''));
export const decode64=value=>typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(value,'base64')):Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export function projectDocument(project){return {name:project.name||'',script:project.masterScript??project.script??'',episodes:project.episodes||[],style:project.style||'',aspectRatio:project.aspectRatio||''};}

// Version-2 forensic recovery only. A repeated word is never evidence by itself:
// both live Y.Text blocks must originate from independent root initializations.
export function repairLegacyDocument(doc){
 const original=readDocument(doc),fields=doc.getMap('fields'),seeds=new Set();
 for(let item=fields._map.get(key(['@kind']));item;item=item.left)if(!item.origin&&!item.rightOrigin)seeds.add(item.id.client);
 const nodes=new Map(),repairs=[],conflicts=[],identityRepairs=new Map();let duplicateRecords=0;
 const node=p=>{const k=key(p);if(nodes.has(k))return nodes.get(k);const n={path:p,children:new Map()};nodes.set(k,n);if(p.length)node(p.slice(0,-1)).children.set(p.at(-1),n);return n;};
 for(const[k,v]of fields){const p=JSON.parse(k),n=node(p);n.raw=v?.text===true?doc.getText('text:'+k).toString():v;n.value=n.raw;
  if(v?.text===true&&seeds.size>1){const items=[];for(let item=doc.getText('text:'+k)._start;item;item=item.right)if(!item.deleted)items.push(item);
   if(items.length===2&&items.every(item=>seeds.has(item.id.client)&&!item.origin&&!item.rightOrigin&&typeof item.content.str==='string')&&items[0].id.client!==items[1].id.client&&items[0].content.str===items[1].content.str){n.value=items[0].content.str;repairs.push(k);if(p.at(-1)==='id'&&p.at(-3)==='@item'&&p.at(-2)===n.value)identityRepairs.set(n.raw,n.value);}
  }
 }
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function merge(a,b,ra,rb,p){
  if(same(ra,rb)&&!same(a,ra))return a;if(same(a,b))return a;if(a===undefined)return b;if(b===undefined)return a;
  if(Array.isArray(a)&&Array.isArray(b)&&[...a,...b].every(x=>x&&x.id)){const result=new Map(a.map(x=>[x.id,x]));for(const item of b){const prior=result.get(item.id);result.set(item.id,prior?merge(prior,item,ra?.find(x=>x.id===item.id),rb?.find(x=>x.id===item.id),p+'/'+item.id):item);}return [...result.values()];}
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const out={};for(const k of new Set([...Object.keys(a),...Object.keys(b)]))out[k]=merge(a[k],b[k],ra?.[k],rb?.[k],p+'/'+k);return out;}
  // Never guess which independently changed creative draft was intended.
  conflicts.push(p);return a;
 }
 function materialize(n,raw=false){
  const kind=n.children.get('@kind')?.value;
  if(kind==='object'){const out={};for(const[k,v]of n.children)if(!k.startsWith('@'))out[k]=materialize(v,raw);return out;}
  if(kind==='records'){
   const ranks=n.children.get('@rank')?.children||new Map(),items=n.children.get('@item')?.children||new Map();
   const rows=[...items].filter(([id])=>ranks.has(id)).sort(([a],[b])=>ranks.get(a).value-ranks.get(b).value||a.localeCompare(b));
   if(raw)return rows.map(([,v])=>materialize(v,true));
   const aliases=new Map();for(const[id,v]of rows){const identity=v.children.get('id');if(identity?.raw===id.repeat(2)&&identity.value===id&&items.has(id.repeat(2)))aliases.set(id.repeat(2),id);}
   const out=new Map();for(const[id,v]of rows){const canonical=aliases.get(id)||identityRepairs.get(id)||id,rawValue=materialize(v,true),value={...materialize(v),id:canonical};
    if(!out.has(canonical))out.set(canonical,{value,raw:rawValue});else{const prior=out.get(canonical);prior.value=merge(prior.value,value,prior.raw,rawValue,key(n.path)+'/'+canonical);duplicateRecords++;}
   }return [...out.values()].map(r=>r.value);
  }
  return raw?n.raw:n.value;
 }
 const document=materialize(node([]));return {needed:!same(document,original),document,conflicts:[...new Set(conflicts)],textRepairs:repairs.length,duplicateRecords};
}

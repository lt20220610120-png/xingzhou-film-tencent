export function sameJson(a,b){
 if(a===b)return true;
 if(a==null||b==null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b)){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
  for(let index=0;index<a.length;index++)if(!sameJson(a[index]??null,b[index]??null))return false;
  return true;
 }
 const keys=Object.keys(a).filter(key=>a[key]!==undefined),other=Object.keys(b).filter(key=>b[key]!==undefined);
 return keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&sameJson(a[key],b[key]));
}
const firstById=rows=>{const map=new Map();for(const row of rows)if(!map.has(row.id))map.set(row.id,row);return map;};
export function threeWayMerge(base,local,remote,location='文档',resolveConflict='') {
 if(sameJson(local,base))return remote;
 if(sameJson(remote,base)||sameJson(local,remote))return local;
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)&&[...base,...local,...remote].every(x=>x&&typeof x==='object'&&x.id)) {
  const before=firstById(base),ours=firstById(local),theirs=firstById(remote);
  const ids=new Set([...theirs.keys(),...ours.keys()]);
  return [...ids].map(id=>threeWayMerge(before.get(id),ours.get(id),theirs.get(id),`${location}/${id}`,resolveConflict)).filter(x=>x!==undefined);
 }
 if(base&&local&&remote&&!Array.isArray(local)&&typeof local==='object'&&typeof remote==='object') {
  const result={};for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   if(['updatedAt','updated_at','editedAt','edited_at'].includes(key)){result[key]=remote[key]||local[key];continue;}
   const value=threeWayMerge(base[key],local[key],remote[key],`${location}/${key}`,resolveConflict);if(value!==undefined)result[key]=value;
  }return result;
 }
 if(resolveConflict==='local')return local;
 if(resolveConflict==='remote')return remote;
 throw new Error(`${location} 同时被修改，本地草稿已保留，请核对云端版本`);
}

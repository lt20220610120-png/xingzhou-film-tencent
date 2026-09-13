const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function threeWayMerge(base,local,remote,location='文档',resolveConflict='') {
 if(same(local,base))return remote;
 if(same(remote,base)||same(local,remote))return local;
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)&&[...base,...local,...remote].every(x=>x&&typeof x==='object'&&x.id)) {
  const ids=[...new Set([...remote,...local].map(x=>x.id))];
  return ids.map(id=>threeWayMerge(base.find(x=>x.id===id),local.find(x=>x.id===id),remote.find(x=>x.id===id),`${location}/${id}`,resolveConflict)).filter(x=>x!==undefined);
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

module.exports={threeWayMerge};

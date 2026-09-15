// Only replaceable cloud snapshots expire. Asset drafts, paid analysis checkpoints
// and generated media live in separate stores and are never cleaned here.
export function createCloudCache(storage,accountId,now=()=>Date.now()){
 const prefix='xz-cloud-snapshot:',scope=prefix+encodeURIComponent(accountId||'local')+':',ttl=7*86400000;
 const expired=value=>!value||!Number.isFinite(value.savedAt)||now()-value.savedAt>ttl;
 try{for(const key of Object.keys(storage)){
   if(key.startsWith('xz-collab-cache-')){storage.removeItem(key);continue;}
   if(!key.startsWith(prefix))continue;
   try{if(expired(JSON.parse(storage.getItem(key))))storage.removeItem(key);}catch{storage.removeItem(key);}
 }}catch{}
 return {
  read(suffix){try{const row=JSON.parse(storage.getItem(scope+suffix));if(expired(row)){storage.removeItem(scope+suffix);return null;}return row.value;}catch{return null;}},
  write(suffix,value){try{storage.setItem(scope+suffix,JSON.stringify({savedAt:now(),value}));}catch{}},
 };
}

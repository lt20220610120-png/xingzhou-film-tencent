const source=r=>[r?.id,r?.objectKey,r?.object_path,r?.filePath,(()=>{try{const u=new URL(r?.url);return u.origin+decodeURIComponent(u.pathname);}catch{return null;}})()].filter(Boolean);
function assertReferenceUploadDelete({accountId,currentAccountId,media,ledger,jobs,batchUsesMedia}){
 if(!accountId||String(accountId)!==String(currentAccountId))throw Error('账号已切换，删除已停止');
 if(!media)throw Error('素材不存在，请刷新');const keys=new Set(source(media));
 const same=r=>source(r).some(k=>keys.has(k));
 if(Object.values(ledger?.voiceProfiles||{}).some(p=>p.confirmed&&same(p.confirmed)))throw Error('项目已采用的音色不能在此删除');
 if(batchUsesMedia||jobs.some(j=>j.projectId===media.projectId&&['submitting','submitted','downloading','uncertain'].includes(j.status)&&j.references?.some(same)))throw Error('素材仍被生成任务使用，请处理原任务后再删除');
}
module.exports={assertReferenceUploadDelete};

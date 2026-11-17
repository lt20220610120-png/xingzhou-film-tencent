const KEY='_sharedPromptBinding';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function sharedData(value,key=''){
 if(Array.isArray(value))return value.map(v=>sharedData(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/api.?key|token|secret|password|authorization/i.test(k)&&!['filePath','localPath','previewDataUrl','dataUrl'].includes(k)).map(([k,v])=>[k,sharedData(v,k)]));
 if(typeof value==='string'&&/^(?:url|originalUrl|thumbnail|previewUrl)$/i.test(key)&&!/^(?:https?:\/\/|$)/i.test(value))return '';
 return value;
}
function sharedBindingValue(old,data,meta){
 const reviewLedger={episodes:{}};
 for(const [n,record]of Object.entries(data.reviewLedger?.episodes||{})){
  const copy=structuredClone(record);for(const k of ['cloudReceipt','publishRequest','failedReceipts','syncError','uploadedWriteId','writeId','pending'])delete copy[k];
  reviewLedger.episodes[n]=copy;
 }
 return sharedData({schema:3,enabled:Boolean(data.enabled),snapshot:data.snapshot,decisions:data.decisions,versions:{...old?.versions,...data.versions},sceneDistributionAttempts:data.sceneDistributionAttempts||{},selectedVersionId:data.selectedVersionId||'',reviewLedger,...meta});
}
function bindingReceipt(projectId,saved){return {bindingReceipt:true,projectId,revision:saved.revision,lastWriteId:saved.lastWriteId,updatedBy:saved.updatedBy,updatedAt:saved.updatedAt};}
function nextPromptBinding(project,p,userId){
 const old=project.analysis_progress?.[KEY];
 if(typeof p.writeId!=='string'||!p.writeId||p.writeId.length>100)fail('缺少关联保存请求编号');
 if(old?.lastWriteId===p.writeId&&old.updatedBy===userId)return old;
 if(!Number.isInteger(p.baseRevision)||p.baseRevision!==(old?.revision||0))fail('关联记录已被另一位协作者更新，请重新读取',409);
 const data=p.data;
 const valid=s=>s?.projectId===project.id&&Array.isArray(s.cards)&&Array.isArray(s.entries);
 if(!data||!valid(data.snapshot)||!data.decisions||typeof data.decisions!=='object'||Array.isArray(data.decisions))fail('关联记录格式无效');
 const versions={...old?.versions,...data.versions};
 for(const [id,row]of Object.entries(versions))if(row?.id!==id||!valid(row.snapshot))fail('提示词版本记录无效');
 const attempts=data.sceneDistributionAttempts||{};
 if(typeof attempts!=='object'||Array.isArray(attempts)||Object.values(attempts).some(a=>!a||typeof a.stamp!=='string'||!['running','failed','done','calibration-failed'].includes(a.status)))fail('自动分发记录格式无效');
 const reviewLedger={episodes:{}};
 for(const [n,record]of Object.entries(data.reviewLedger?.episodes||{})){
  const episode=require('./collab-episodes.cjs').numberedEpisodes(project.episodes).find(e=>e.number===Number(n))?.episode;
  if(!episode)fail('核实清单分集不存在');
  require('./art-review-repository.cjs').validateReview(record,episode,Number(n));
  const copy=structuredClone(record);for(const k of ['cloudReceipt','publishRequest','failedReceipts','syncError','uploadedWriteId','writeId','pending'])delete copy[k];
  reviewLedger.episodes[n]=copy;
 }
 const next=sharedBindingValue(old,data,{revision:(old?.revision||0)+1,lastWriteId:p.writeId,updatedBy:userId,updatedAt:new Date().toISOString()});
 if(JSON.stringify(next).length>32*1024*1024)fail('关联记录过大，请分集核对');
 return next;
}
function promptBindingRepository(pool){return {async savePromptBinding(pid,p,uid){
 const client=await pool.connect();try{
  await client.query('BEGIN');await client.query("set local lock_timeout='3s'");
  const row=(await client.query('select * from collab_projects where id=$1 for update',[pid])).rows[0];
  if(!row||!uid||row.owner_id!==uid&&!(await client.query("select 1 from collab_members where project_id=$1 and user_id=$2 and role in ('producer','artist','artist_collaborator')",[pid,uid])).rows.length){await client.query('ROLLBACK');return null;}
  if(row.deleted_at||/\[RECYCLE_UNTIL:|\[PROJECT_LOCKED\]|\[DIRECTOR_PROJECT\]/.test(row.genre||''))fail('项目已锁定、删除或不支持此操作',403);
  const next=nextPromptBinding(row,p,uid);
  await client.query('update collab_projects set analysis_progress=$2,updated_at=now() where id=$1',[pid,JSON.stringify({...row.analysis_progress,[KEY]:next})]);
  await client.query('COMMIT');return next;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}};}
module.exports={KEY,nextPromptBinding,promptBindingRepository,sharedBindingValue,bindingReceipt};

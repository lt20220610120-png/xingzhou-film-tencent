const error=(status,message)=>Object.assign(new Error(message),{status});
const crypto=require('node:crypto');
const {directorRow}=require('./director-source.cjs');
const shared=import('../shared/directorSharedDocument.mjs');
const documentOf=row=>({name:row.name,script:row.script||'',episodes:row.episodes||[],style:row.style||'',aspectRatio:(row.episodes||[])[0]?.projectAspectRatio||''});
function directorLiveRepository(pool){
 const cache=new Map();
 const decode=value=>{if(typeof value!=='string'||value.length>12*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw error(400,'协作增量格式无效');return Buffer.from(value,'base64');};
 const validate=doc=>{if(!doc||typeof doc.name!=='string'||doc.name.length>500||typeof doc.script!=='string'||doc.script.length>8000000||!Array.isArray(doc.episodes)||doc.episodes.length>2000||doc.episodes.some(e=>!e||typeof e.id!=='string'||typeof e.content!=='string')||Buffer.byteLength(JSON.stringify(doc))>16*1024*1024)throw error(413,'协作文档超出允许范围');};
 function evict(id){const entry=cache.get(id);cache.delete(id);entry?.doc.destroy();}
 async function load(client,row,store){const {Y,seedDocument}=await shared;let entry=cache.get(row.id);
  if(!store){const d=seedDocument(documentOf(row)),state=Buffer.from(Y.encodeStateAsUpdate(d));store=(await client.query('insert into director_live_documents(project_id,state) values($1,$2) returning *',[row.id,state])).rows[0];entry={doc:d,revision:String(store.revision)};}
  if(!entry||entry.revision!==String(store.revision)){const r=store.state?store:(await client.query('select * from director_live_documents where project_id=$1',[row.id])).rows[0];evict(row.id);const d=new Y.Doc();Y.applyUpdate(d,new Uint8Array(r.state));entry={doc:d,revision:String(r.revision)};}
  cache.delete(row.id);cache.set(row.id,entry);if(cache.size>20)evict(cache.keys().next().value);return entry;
 }
 async function checkpoint(client,row,uid,name,document,status='accepted'){
  await client.query('insert into director_project_versions(project_id,author_id,author_name,submission_id,status,document) values($1,$2,$3,$4,$5,$6)',[row.id,String(uid),name||'',crypto.randomUUID(),status,JSON.stringify(document)]);
 }
 async function replace(client,row,entry,document){const {Y,seedDocument,flattenDocument}=await shared;validate(document);flattenDocument(document);const d=seedDocument(document);
  try{const result=(await client.query('update director_live_documents set state=$2,revision=revision+1,checkpoint_at=clock_timestamp() where project_id=$1 returning revision',[row.id,Buffer.from(Y.encodeStateAsUpdate(d))])).rows[0];
   await client.query('update collab_projects set name=$2,script=$3,episodes=$4,style=$5,updated_at=clock_timestamp() where id=$1',[row.id,document.name,document.script,JSON.stringify(document.episodes),document.style||'']);
   entry.doc.destroy();entry.doc=d;entry.revision=String(result.revision);delete entry.inspection;
  }catch(e){d.destroy();throw e;}
 }
 return {
  async syncDirectorLive(pid,p,uid,name){const {Y,readDocument,documentProtocol,documentEpoch,LIVE_PROTOCOL,repairLegacyDocument,assertCompatibleUpdate,flattenDocument}=await shared;const client=await pool.connect();
   try{await client.query('BEGIN');
    // Membership and lock checks precede every migration, repair and write.
    const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
    if(!directorRow(row))throw error(403,'项目已删除或不可访问');
    const owner=String(row.owner_id)===String(uid);
    if(!owner&&!(await client.query('select 1 as ok from collab_members where project_id=$1 and user_id=$2',[pid,uid])).rows.length)throw error(403,'您已不在协作项目中，本地修改仍保留');
    const locked=String(row.genre||'').includes('[PROJECT_LOCKED]'),role={locked,myRole:owner?'producer':'collaborator'};
    if(p.protocol!==LIVE_PROTOCOL)throw error(426,'多人协作协议已升级，请所有成员更新至 2.8.35 或以上；本地创作仍保留');
    if((p.update||p.repair==='apply')&&locked)throw error(423,'制片已锁定项目，本地修改仍保留');
    let store=(await client.query('select project_id,revision,checkpoint_at from director_live_documents where project_id=$1',[pid])).rows[0];
    const initialized=!store,entry=await load(client,row,store);store=store||(await client.query('select project_id,revision,checkpoint_at from director_live_documents where project_id=$1',[pid])).rows[0];
    if(initialized)await checkpoint(client,row,row.owner_id,row.owner_name,documentOf(row),'baseline');
    if(documentProtocol(entry.doc)!==LIVE_PROTOCOL){
     const inspection=entry.inspection||(entry.inspection=repairLegacyDocument(entry.doc));
     if(inspection.needed){
      const fingerprint=crypto.createHash('sha256').update(Y.encodeStateAsUpdate(entry.doc)).digest('hex');
      const summary={textRepairs:inspection.textRepairs,duplicateRecords:inspection.duplicateRecords,episodes:inspection.document.episodes?.length||0,prompts:(inspection.document.episodes||[]).reduce((n,e)=>n+(e.prompts||[]).length,0),conflicts:inspection.conflicts,revision:entry.revision,fingerprint};
      if(p.repair){if(!owner)throw error(403,'只有项目制片可预览或采用协作修复');if(!['preview','apply'].includes(p.repair))throw error(400,'修复操作无效');}
      if(p.repair==='apply'){
       if(String(p.expectedRevision)!==entry.revision||p.fingerprint!==fingerprint)throw error(409,'协作内容已变化，请重新预览修复结果');
       if(inspection.conflicts.length)throw error(409,'存在独立创作差异，请在协作版本中选择内容，不能自动合并');
       await checkpoint(client,row,uid,name,readDocument(entry.doc),'baseline');
       await replace(client,row,entry,inspection.document);await checkpoint(client,row,uid,name,inspection.document,'restore');
      }else{await client.query('COMMIT');return {...role,repairRequired:true,summary,...(p.repair==='preview'?{document:inspection.document}:{})};}
     }else{
      if(locked){await client.query('COMMIT');return {...role,migrationRequired:true};}
      const document=readDocument(entry.doc);await checkpoint(client,row,uid,name,document,'baseline');await replace(client,row,entry,document);
     }
    }
    const currentEpoch=documentEpoch(entry.doc),reset=p.epoch!==currentEpoch;
    // A reset is a new CRDT baseline. Never replay deltas from an older one.
    if(p.update&&!reset){
     if(!/^[a-f0-9-]{36}$/i.test(p.updateId||''))throw error(400,'协作增量缺少编号');
     const previous=(await client.query('select update_id from director_live_updates where project_id=$1 and update_id=$2',[pid,p.updateId])).rows.length;
     if(!previous){const delta=decode(p.update),candidate=new Y.Doc();Y.applyUpdate(candidate,Y.encodeStateAsUpdate(entry.doc));
      try{try{assertCompatibleUpdate(entry.doc,new Uint8Array(delta));}catch(e){throw error(409,e.message);}Y.applyUpdate(candidate,new Uint8Array(delta));
       if([...candidate.share.keys()].some(k=>k!=='fields'&&!k.startsWith('text:['))||documentEpoch(candidate)!==currentEpoch||documentProtocol(candidate)!==LIVE_PROTOCOL)throw error(400,'协作结构或初始化基准无效');
       const doc=readDocument(candidate);validate(doc);flattenDocument(doc);
       await client.query('insert into director_live_updates(project_id,update_id,author_id,author_name,delta) values($1,$2,$3,$4,$5)',[pid,p.updateId,String(uid),name||'',delta]);
       const result=(await client.query('update director_live_documents set state=$2,revision=revision+1 where project_id=$1 returning revision',[pid,Buffer.from(Y.encodeStateAsUpdate(candidate))])).rows[0];
       await client.query('update collab_projects set name=$2,script=$3,episodes=$4,style=$5,updated_at=clock_timestamp() where id=$1',[pid,doc.name,doc.script,JSON.stringify(doc.episodes),doc.style||'']);
       if(p.checkpoint||Date.now()-Date.parse(store.checkpoint_at)>300000){await checkpoint(client,row,uid,name,doc);await client.query('update director_live_documents set checkpoint_at=clock_timestamp() where project_id=$1',[pid]);}
       entry.doc.destroy();entry.doc=candidate;entry.revision=String(result.revision);
      }catch(e){candidate.destroy();throw e;}
     }
    }else if(p.checkpoint&&!locked&&!reset){await checkpoint(client,row,uid,name,readDocument(entry.doc));}
    let reply;try{const vector=!reset&&p.vector?decode(p.vector):undefined;reply={...role,protocol:LIVE_PROTOCOL,epoch:currentEpoch,reset,update:Buffer.from(Y.encodeStateAsUpdate(entry.doc,vector)).toString('base64'),vector:Buffer.from(Y.encodeStateVector(entry.doc)).toString('base64'),revision:entry.revision,ack:!reset&&p.update?p.updateId:null};}catch(e){throw e.status?e:error(400,'协作状态向量无效');}
    await client.query('COMMIT');return reply;
   }catch(e){await client.query('ROLLBACK');evict(pid);throw e;}finally{client.release();}
  },
  async resetDirectorLive(client,row,document){const {Y,seedDocument,readDocument,flattenDocument}=await shared;const store=(await client.query('select * from director_live_documents where project_id=$1',[row.id])).rows[0];if(!store)return;
   const old=new Y.Doc();Y.applyUpdate(old,new Uint8Array(store.state));let d;
   try{const chosen={...readDocument(old),...document};validate(chosen);flattenDocument(chosen);d=seedDocument(chosen);
    await client.query('update director_live_documents set state=$2,revision=revision+1,checkpoint_at=clock_timestamp() where project_id=$1',[row.id,Buffer.from(Y.encodeStateAsUpdate(d))]);evict(row.id);
   }finally{old.destroy();d?.destroy();}
  }
 };
}
module.exports={directorLiveRepository};

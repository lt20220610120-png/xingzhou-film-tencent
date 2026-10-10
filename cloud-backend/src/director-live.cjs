const error=(status,message)=>Object.assign(new Error(message),{status});
const crypto=require('node:crypto');
const {directorRow}=require('./director-source.cjs');
const shared=import('../shared/directorSharedDocument.mjs');
const documentOf=row=>({name:row.name,script:row.script||'',episodes:row.episodes||[],style:row.style||'',aspectRatio:(row.episodes||[])[0]?.projectAspectRatio||''});
function directorLiveRepository(pool){
 const cache=new Map();
 const decode=value=>{if(typeof value!=='string'||value.length>12*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw error(400,'协作增量格式无效');return Buffer.from(value,'base64');};
 const validate=doc=>{if(!doc||typeof doc.name!=='string'||doc.name.length>500||typeof doc.script!=='string'||doc.script.length>8000000||!Array.isArray(doc.episodes)||doc.episodes.length>2000||doc.episodes.some(e=>!e||typeof e.id!=='string'||typeof e.content!=='string')||Buffer.byteLength(JSON.stringify(doc))>16*1024*1024)throw error(413,'协作文档超出允许范围');};
 async function load(client,row,store){const {Y,seedDocument}=await shared;let entry=cache.get(row.id);
  if(!store){const d=seedDocument(documentOf(row)),state=Buffer.from(Y.encodeStateAsUpdate(d));store=(await client.query('insert into director_live_documents(project_id,state) values($1,$2) returning *',[row.id,state])).rows[0];entry={doc:d,revision:String(store.revision)};}
  if(!entry||entry.revision!==String(store.revision)){const r=store.state?store:(await client.query('select * from director_live_documents where project_id=$1',[row.id])).rows[0];const d=new Y.Doc();Y.applyUpdate(d,new Uint8Array(r.state));entry={doc:d,revision:String(r.revision)};}
  cache.delete(row.id);cache.set(row.id,entry);if(cache.size>20){const [id,old]=cache.entries().next().value;cache.delete(id);old.doc.destroy();}return entry;
 }
 async function checkpoint(client,row,uid,name,document,status='accepted'){
  const normalized={name:document.name,script:document.script,episodes:document.episodes};
  await client.query('insert into director_project_versions(project_id,author_id,author_name,submission_id,status,document) values($1,$2,$3,$4,$5,$6)',[row.id,String(uid),name||'',crypto.randomUUID(),status,JSON.stringify(normalized)]);
 }
 return {
  async syncDirectorLive(pid,p,uid,name){const {Y,readDocument}=await shared;const client=await pool.connect();let changed=false;
   try{await client.query('BEGIN');
    // Serialize with legacy uploads/restores too; permissions are checked again
    // inside this transaction, including for read-only polls.
    const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
    if(!directorRow(row))throw error(403,'项目已删除或不可访问');
    const owner=String(row.owner_id)===String(uid);
    if(!owner&&!(await client.query('select 1 as ok from collab_members where project_id=$1 and user_id=$2',[pid,uid])).rows.length)throw error(403,'您已不在协作项目中，本地修改仍保留');
    const locked=String(row.genre||'').includes('[PROJECT_LOCKED]');
    let store=(await client.query('select project_id,revision,checkpoint_at from director_live_documents where project_id=$1',[pid])).rows[0];
    const initialized=!store,entry=await load(client,row,store);store=store||(await client.query('select project_id,revision,checkpoint_at from director_live_documents where project_id=$1',[pid])).rows[0];
    if(initialized)await checkpoint(client,row,row.owner_id,row.owner_name,documentOf(row),'baseline');
    if(p.update){
     if(locked)throw error(423,'制片已锁定项目，本地修改仍保留');
     if(!/^[a-f0-9-]{36}$/i.test(p.updateId||''))throw error(400,'协作增量缺少编号');
     const previous=(await client.query('select update_id from director_live_updates where project_id=$1 and update_id=$2',[pid,p.updateId])).rows.length;
     if(!previous){const delta=decode(p.update);const candidate=new Y.Doc();Y.applyUpdate(candidate,Y.encodeStateAsUpdate(entry.doc));
      try{Y.applyUpdate(candidate,new Uint8Array(delta));if([...candidate.share.keys()].some(k=>k!=='fields'&&!k.startsWith('text:[')))throw error(400,'协作字段无效');const doc=readDocument(candidate);validate(doc);
       await client.query('insert into director_live_updates(project_id,update_id,author_id,author_name,delta) values($1,$2,$3,$4,$5)',[pid,p.updateId,String(uid),name||'',delta]);
       const result=(await client.query('update director_live_documents set state=$2,revision=revision+1 where project_id=$1 returning revision',[pid,Buffer.from(Y.encodeStateAsUpdate(candidate))])).rows[0];
       await client.query('update collab_projects set name=$2,script=$3,episodes=$4,style=$5,updated_at=clock_timestamp() where id=$1',[pid,doc.name,doc.script,JSON.stringify(doc.episodes),doc.style||'']);
       if(p.checkpoint||Date.now()-Date.parse(store.checkpoint_at)>300000){await checkpoint(client,row,uid,name,doc);await client.query('update director_live_documents set checkpoint_at=clock_timestamp() where project_id=$1',[pid]);}
       entry.doc.destroy();entry.doc=candidate;entry.revision=String(result.revision);changed=true;
      }catch(e){candidate.destroy();throw e;}
     }
    }else if(p.checkpoint&&!locked){await checkpoint(client,row,uid,name,readDocument(entry.doc));}
    let vector;try{vector=p.vector?decode(p.vector):undefined;const delta=Y.encodeStateAsUpdate(entry.doc,vector);const reply={update:Buffer.from(delta).toString('base64'),vector:Buffer.from(Y.encodeStateVector(entry.doc)).toString('base64'),revision:entry.revision,locked,myRole:owner?'producer':'collaborator',ack:p.updateId||null};
     await client.query('COMMIT');return reply;
    }catch(e){throw e.status?e:error(400,'协作状态向量无效');}
   }catch(e){await client.query('ROLLBACK');cache.delete(pid);throw e;}finally{client.release();}
  },
  async resetDirectorLive(client,row,document,uid,name){const {Y,editDocument,readDocument}=await shared;const store=(await client.query('select * from director_live_documents where project_id=$1',[row.id])).rows[0];if(!store)return;
   const d=new Y.Doc();Y.applyUpdate(d,new Uint8Array(store.state));const before=Y.encodeStateVector(d);editDocument(d,readDocument(d),{...readDocument(d),...document},'restore');
   await client.query('insert into director_live_updates(project_id,update_id,author_id,author_name,delta) values($1,$2,$3,$4,$5)',[row.id,crypto.randomUUID(),String(uid),name||'',Buffer.from(Y.encodeStateAsUpdate(d,before))]);
   await client.query('update director_live_documents set state=$2,revision=revision+1 where project_id=$1',[row.id,Buffer.from(Y.encodeStateAsUpdate(d))]);cache.delete(row.id);d.destroy();
  }
 };
}
module.exports={directorLiveRepository};

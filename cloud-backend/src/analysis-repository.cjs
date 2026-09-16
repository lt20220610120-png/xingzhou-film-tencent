const {appendArtEpisodeSnapshot, numberedEpisodes, ensureCollabDomain} = require('./collab-episodes.cjs');
const {parsePublicationOutput,validatePublicationAssets,publicationFirstEpisode,mergePublicationOutput} = require('./analysis-publication.cjs');
async function lockAuthorizedArtProject(client,pid,uid){
 if(!uid)return null;
 const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
 if(!row||row.owner_id===uid)return row||null;
 const auth=(await client.query("select 1 as ok from collab_members where project_id=$1 and user_id=$2 and role in ('producer','artist','artist_collaborator') limit 1",[pid,uid])).rows[0];
 return auth?row:null;
}
function analysisRepository(pool){return {
 async appendArtEpisode(pid,p,uid){
  const client=await pool.connect();
  try {
   await client.query('BEGIN');await client.query("set local lock_timeout='3s'");
   let row=await lockAuthorizedArtProject(client,pid,uid);
   row=uid?await ensureCollabDomain(client,row,uid):null;
   if(!row){await client.query('ROLLBACK');return null;}
   if(String(row.genre||'').includes('[PROJECT_LOCKED]'))throw Object.assign(new Error('项目已锁定，暂不可编辑'),{status:423});
   if(row.deleted_at || String(row.genre||'').includes('[RECYCLE_UNTIL:'))throw Object.assign(new Error('项目已删除，请先恢复'),{status:410});
   const next=appendArtEpisodeSnapshot(row,p);
   if(next===row){await client.query('COMMIT');return row;}
   const saved=(await client.query('update collab_projects set script=$2,episodes=$3,updated_at=now() where id=$1 returning *',[pid,next.script,JSON.stringify(next.episodes)])).rows[0];
   await client.query('COMMIT');return saved;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 },
 async publishAnalysis(pid,p,uid){
  const client=await pool.connect();
  const fail=message=>{throw Object.assign(new Error(message),{status:409});};
  try{
   await client.query('BEGIN');await client.query("set local lock_timeout='3s'");
   let row=await lockAuthorizedArtProject(client,pid,uid);
   row=uid?await ensureCollabDomain(client,row,uid):null;
   if(!row){await client.query('ROLLBACK');return null;}
   if(String(row.genre).includes('[PROJECT_LOCKED]'))throw Object.assign(new Error('项目已锁定，暂不可编辑'),{status:423});
   if(row.deleted_at || String(row.genre||'').includes('[RECYCLE_UNTIL:'))throw Object.assign(new Error('项目已删除，请先恢复'),{status:410});
   const n=Number(p.episodeNumber),matches=numberedEpisodes(row.episodes).filter(entry=>entry.number===n);
   if(!Number.isInteger(n)||n<1||matches.length!==1||String(matches[0].episode.content||'')!==p.sourceContent)fail('本集原文已修改，分析结果已保存在本机，请同步最新剧本后继续');
   const parsed=parsePublicationOutput(p.output,n);
   const checked=validatePublicationAssets(p.assets,parsed,n);
   const existing=(await client.query('select * from collab_assets where project_id=$1',[pid])).rows;
   const assets=checked.map(item=>({...item,first_episode:publicationFirstEpisode(item,existing,n)}));
   const progress={...(row.analysis_progress||{})},old=progress[n];
   if(old?.output===p.output&&old.fingerprint===p.fingerprint){await client.query('COMMIT');return row;}
   if((old?.output||'')!==(p.baseOutput||''))fail('本集已有其他分析结果，已保留你的本地进度，请刷新核对');
   progress[n]={fingerprint:p.fingerprint,output:p.output,updatedAt:new Date().toISOString()};
   // Add missing assets and merge episode membership. Preserve all manual edits,
   // IDs and image relationships, including assets from previous analyses.
   for(const item of assets){
    const first=Number(item.first_episode);
    const written=await client.query(`insert into collab_assets(project_id,category,name,description,first_episode,episodes,image_url) values($1,$2,$3,$4,$5,$6,'')
     on conflict(project_id,name) do update set first_episode=least(collab_assets.first_episode,excluded.first_episode),category=case when collab_assets.category='character' and excluded.category='prop' then 'prop' else collab_assets.category end,episodes=(select array_agg(distinct e order by e) from unnest(collab_assets.episodes || excluded.episodes) e),description=case when coalesce(collab_assets.description,'')='' then excluded.description else collab_assets.description end
     where collab_assets.category=excluded.category or (collab_assets.category='character' and excluded.category='prop') returning id,category`,[pid,item.category,item.name,item.description||'',Number.isInteger(first)&&first>0&&first<=n?first:n,[n]]);
    if(!written.rows[0])fail(`资产 ${item.name} 已被并发写入为其他类别，请刷新后重试`);
   }
   const analysisOutput=mergePublicationOutput(row.analysis_output,p.output,n);
   const saved=(await client.query('update collab_projects set analysis_progress=$2,analysis_output=$3,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(progress),analysisOutput])).rows[0];
   await client.query('COMMIT');return saved;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
};}
module.exports={analysisRepository};

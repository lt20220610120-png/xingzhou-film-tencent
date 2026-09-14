function analysisRepository(pool){return {
 async publishAnalysis(pid,p,uid){
  const client=await pool.connect();
  const fail=message=>{throw Object.assign(new Error(message),{status:409});};
  try{
   await client.query('BEGIN');await client.query("set local lock_timeout='3s'");
   const row=(await client.query('select * from collab_projects where id=$1 and owner_id=$2 for update',[pid,uid])).rows[0];
   if(!row){await client.query('ROLLBACK');return null;}
   if(String(row.genre).includes('[PROJECT_LOCKED]'))fail('项目已锁定');
   const n=Number(p.episodeNumber),episodes=(row.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传');
   if(!Number.isInteger(n)||n<1||!episodes[n-1]||String(episodes[n-1].content||'')!==p.sourceContent)fail('本集原文已修改，分析结果已保存在本机，请同步最新剧本后继续');
   const progress=row.analysis_progress||{},old=progress[n];
   if(old?.output===p.output&&old.fingerprint===p.fingerprint){await client.query('COMMIT');return row;}
   if((old?.output||'')!==(p.baseOutput||''))fail('本集已有其他分析结果，已保留你的本地进度，请刷新核对');
   if(!p.output||p.output.length>500000||!Array.isArray(p.assets))throw Object.assign(new Error('分析结果格式不正确'),{status:400});
   progress[n]={fingerprint:p.fingerprint,output:p.output,updatedAt:new Date().toISOString()};
   // Add missing assets and merge episode membership. Preserve all manual edits,
   // IDs and image relationships, including assets from previous analyses.
   for(const item of p.assets){
    if(!['character','scene','prop'].includes(item.category)||!item.name)continue;
    await client.query(`insert into collab_assets(project_id,category,name,description,first_episode,episodes,image_url) values($1,$2,$3,$4,$5,$6,'')
     on conflict(project_id,name) do update set episodes=(select array_agg(distinct e order by e) from unnest(collab_assets.episodes || excluded.episodes) e),description=case when coalesce(collab_assets.description,'')='' then excluded.description else collab_assets.description end`,[pid,item.category,item.name,item.description||'',n,[n]]);
   }
   const sections=String(row.analysis_output||'').split(/(?=^#{1,6}\s*第\s*\d+\s*集)/m).filter(s=>s.trim()&&!new RegExp('^#{1,6}\\s*第\\s*'+n+'\\s*集').test(s));
   sections.push(p.output);
   const saved=(await client.query('update collab_projects set analysis_progress=$2,analysis_output=$3,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(progress),sections.join('\n\n')])).rows[0];
   await client.query('COMMIT');return saved;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
};}
module.exports={analysisRepository};

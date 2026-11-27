const {assetImageObject,objectFromLink}=require('./project-media-policy.cjs');

async function enqueueAssetImageCleanup(client,projectId,values) {
  const candidates=[...new Set(values.filter(value=>typeof value==='string'&&value.length>0&&value.length<=2048))];
  if (!candidates.length) return;
  await client.query(`insert into collab_asset_image_cleanup(project_id,candidate)
    select $1,candidate from unnest($2::text[]) candidate on conflict do nothing`,[projectId,candidates]);
}

async function processAssetImageCleanup({query,transaction,signer,fetchFn=fetch}) {
  const {rows}=await query(`select project_id,candidate from collab_asset_image_cleanup
    where next_attempt_at<=now() order by next_attempt_at limit 25`);
  for (const {project_id:projectId,candidate} of rows) {
    await transaction(async client=>{
      await client.query("set local lock_timeout='2s'");
      // Asset and media writes take this same project lock before changing references.
      await client.query('select id from collab_projects where id=$1 for update',[projectId]);
      const args=[projectId,candidate];
      const job=(await client.query(`select attempts from collab_asset_image_cleanup
        where project_id=$1 and candidate=$2 and next_attempt_at<=now() for update skip locked`,args)).rows[0];
      if (!job) return;
      const key=objectFromLink(candidate,signer);
      if (assetImageObject(key,projectId)) {
        // Retain shared pointers, including legacy URL fields and references inside
        // published scene snapshots. Object filenames are generated server-side.
        const reference=(await client.query(`select 1 from collab_media where object_path=$2
          or (project_id=$1 and (url=$2 or right(split_part(url,'?',1),length($2)+1)='/'||$2))
          union all select 1 from collab_assets where project_id=$1 and (image_url=$2 or right(split_part(image_url,'?',1),length($2)+1)='/'||$2)
          union all select 1 from collab_messages where project_id=$1 and (image_url=$2 or right(split_part(image_url,'?',1),length($2)+1)='/'||$2)
          union all select 1 from collab_projects where id=$1 and (
            strpos(episodes::text,$2)>0 or strpos(analysis_progress::text,$2)>0)
          limit 1`,[projectId,key])).rows[0];
        if (reference) {
          await client.query("update collab_asset_image_cleanup set next_attempt_at=now()+interval '1 day' where project_id=$1 and candidate=$2",args);
          return;
        }
        try {
          const signed=signer.signDelete({objectKey:key});
          const response=await fetchFn(signed.url,{
            method:signed.method,headers:{authorization:signed.authorization},
            redirect:'error',signal:AbortSignal.timeout(5000),
          });
          await response.body?.cancel();
          if (!response.ok&&response.status!==404) throw new Error('COS delete failed');
        } catch {
          const minutes=Math.min(24*60,5*2**Math.min(job.attempts,9));
          await client.query(`update collab_asset_image_cleanup set attempts=attempts+1,
            next_attempt_at=now()+$3::int*interval '1 minute' where project_id=$1 and candidate=$2`,[...args,minutes]);
          return;
        }
      }
      await client.query('delete from collab_asset_image_cleanup where project_id=$1 and candidate=$2',args);
    }).catch(error=>{if(error.code!=='55P03')throw error;});
  }
}

module.exports={enqueueAssetImageCleanup,processAssetImageCleanup};

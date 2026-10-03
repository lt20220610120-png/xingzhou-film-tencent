const {numberedEpisodes,ensureCollabDomain}=require('./collab-episodes.cjs');
const {mergePublicationOutput}=require('./analysis-publication.cjs');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const signature=s=>JSON.stringify([s.id,s.source,s.items.map(i=>[i.id,i.category,i.name,i.description,i.ready,...(i.detailStatus?[i.detailStatus]:[])])]);
const verified=s=>Boolean(s.approval?.signature===signature(s));
const ledgerSignature=record=>JSON.stringify((record?.scenes||[]).filter(verified).map(s=>[s.id,s.items.map(i=>[i.category,i.name,i.description])]));
function sourceScenes(content,number){
 const source=String(content||'').replace(/\r\n?/g,'\n').trim(),lines=source.split('\n'),starts=[];
 if(!source)return [];
 lines.forEach((line,index)=>{const match=line.match(/^\s*(?:场景\s*)?(\d+)\s*[-—－]\s*(\d+)\s*[：:]?\s*(.*)$/);if(match)starts.push({index,id:`${Number(match[1])}-${Number(match[2])}`});});
 if(!starts.length)return [{id:`${number}-1`,source}];
 const preface=lines.slice(0,starts[0].index).join('\n').trim();
 return starts.map((s,i)=>({id:s.id,source:(i===0&&preface?preface+'\n\n':'')+lines.slice(s.index,starts[i+1]?.index??lines.length).join('\n').trim()}));
}
function validateReview(data,episode,number){
 if(!data||data.schema!==1||data.episodeNumber!==number||data.sourceContent!==String(episode.content||''))fail('本集正文已改变，本地核实稿保留，请刷新后重新生成');
 if(JSON.stringify(data).length>4000000)fail('本集清单过大，请分场整理后同步',400);
 const scenes=sourceScenes(episode.content,number),ids=new Set(),allowed=['character','scene','prop'];
 if(data.dependencies&&(typeof data.dependencies!=='object'||Array.isArray(data.dependencies)||Object.entries(data.dependencies).some(([n,v])=>!/^\d+$/.test(n)||Number(n)<1||Number(n)>=number||typeof v!=='string')))fail('前集核实版本格式不正确',400);
 if(!Array.isArray(data.scenes)||data.scenes.length!==scenes.length||!Array.isArray(data.unassigned))fail('核实清单必须保留本集全部真实场次',400);
 const checkItems=items=>{
  if(!Array.isArray(items)||items.length>5000)fail('资产清单格式不正确',400);
  const seen=new Set();
  for(const i of items){
   if(!i||typeof i.id!=='string'||!i.id||!allowed.includes(i.category)||typeof i.name!=='string'||!/^【[^】\n]+】$/.test(i.name)||i.name.length>300||seen.has(i.category+'\0'+i.name)||typeof i.description!=='string'||i.description.length>200000||typeof i.ready!=='boolean')fail('资产名称、类别或描述格式不正确',400);
   seen.add(i.category+'\0'+i.name);
  }
 };
 for(const s of data.scenes){const origin=scenes.find(v=>v.id===s.id);if(!origin||ids.has(s.id)||s.source!==origin.source)fail('场次编号或原文已改变，请刷新核对',400);ids.add(s.id);checkItems(s.items);if(s.approval&&!verified(s))fail(`场景 ${s.id} 的核实版本与当前条目不同，请重新核实`,400);}
 checkItems(data.unassigned);
 if(data.roster!==undefined){checkItems(data.roster);const names=new Set(data.roster.map(i=>i.category+'\0'+i.name));if([...data.scenes.flatMap(s=>s.items),...data.unassigned].some(i=>!names.has(i.category+'\0'+i.name)))fail('场景条目必须属于本集资产名单',400);}
 return data;
}
async function lockProject(client,pid,uid){
 if(!uid)return null;
 let row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
 if(!row)return null;
 if(row.owner_id!==uid&&!(await client.query("select 1 as ok from collab_members where project_id=$1 and user_id=$2 and role in ('producer','artist','artist_collaborator') limit 1",[pid,uid])).rows[0])return null;
 return ensureCollabDomain(client,row,uid);
}
const getEpisode=(row,number)=>{const match=numberedEpisodes(row.episodes).find(e=>e.number===number);if(!match)fail('本集不存在，请刷新核对');return match.episode;};
const reviewedOutput=(record,number)=>{
 const entries=new Map();Object.values(record.published||{}).forEach(s=>s.items.filter(i=>i.detailStatus!=='nonvisual').forEach(i=>entries.set(i.category+'\0'+i.name,i)));
 return `### 第${number}集\n`+Object.entries({character:'人物',scene:'场景',prop:'道具'}).map(([key,title])=>`${title}：\n${[...entries.values()].filter(i=>i.category===key).map(i=>`- ${i.name} ${i.description}`).join('\n')||'- 无'}`).join('\n');
};
function artReviewRepository(pool){
 async function transaction(pid,p,uid,action){
  const client=await pool.connect();try{
   await client.query('BEGIN');await client.query("set local lock_timeout='3s'");const row=await lockProject(client,pid,uid);
   if(!row){await client.query('ROLLBACK');return null;}
   const number=Number(p.episodeNumber);if(!Number.isInteger(number)||number<1)fail('分集编号无效',400);
   const episode=getEpisode(row,number),progress={...(row.analysis_progress||{})},previous=progress[number]||{},old=previous.review;
   if(typeof p.writeId!=='string'||!p.writeId||p.writeId.length>100)fail('缺少保存请求编号',400);
   if(old?.lastWriteId===p.writeId){await client.query('COMMIT');return old;}
   if(Number(p.baseVersion)!==Number(old?.version||0))fail('本集已有其他核实修改，本地版本保留，请刷新并核对云端版本');
   let next;
   if(action==='save'){
    validateReview(p.data,episode,number);next={...p.data,published:old?.published||{},managedAssetNames:old?.managedAssetNames||[],version:Number(old?.version||0)+1,lastWriteId:p.writeId,updatedBy:uid,updatedAt:Date.now()};delete next.pending;delete next.syncError;delete next.writeId;
   }else{
    if(!old)fail('请先保存并核实本集清单');validateReview(old,episode,number);
    for(const [n,stamp]of Object.entries(old.dependencies||{}))if(ledgerSignature(progress[n]?.review)!==stamp||progress[n]?.review?.sourceContent!==String(getEpisode(row,Number(n)).content||''))fail(`第 ${n} 集核实清单或正文已变化，请重新生成本集并复核`);
    if(!Array.isArray(p.sceneIds)||!p.sceneIds.length||new Set(p.sceneIds).size!==p.sceneIds.length)fail('请选择已核实场景',400);
    next=structuredClone(old);next.published||={};const previousNames=new Set(Object.values(old.published||{}).flatMap(s=>s.items.map(i=>i.name)));
    for(const id of p.sceneIds){const s=next.scenes.find(s=>s.id===id);if(!s||!verified(s))fail(`场景 ${id} 尚未核实或细节待补齐`,400);next.published[id]={id:s.id,source:s.source,items:structuredClone(s.items),signature:signature(s),at:Date.now(),actor:uid};}
    const full=next.scenes.every(s=>next.published[s.id]?.signature===signature(s));
    if(full){const ids=new Set(next.scenes.map(s=>s.id));for(const id of Object.keys(next.published))if(!ids.has(id))delete next.published[id];}
    const entries=new Map();Object.values(next.published).forEach(s=>s.items.filter(i=>i.detailStatus!=='nonvisual').forEach(i=>{if(entries.has(i.name)&&entries.get(i.name).category!==i.category)fail(`资产 ${i.name} 类别相互矛盾`,400);entries.set(i.name,i);}));
    for(const item of entries.values()){
     const existing=(await client.query('select * from collab_assets where project_id=$1 and name=$2',[pid,item.name])).rows[0];
     if(existing&&existing.category!==item.category)fail(`资产 ${item.name} 已存在于其他类别，请先改名核对`,400);
     // Never overwrite an existing prompt, reference settings, ID or images.
     await client.query(`insert into collab_assets(project_id,category,name,description,first_episode,episodes,image_url) values($1,$2,$3,$4,$5,$6,'') on conflict(project_id,name) do update set episodes=(select array_agg(distinct e order by e) from unnest(collab_assets.episodes || excluded.episodes) e),description=case when coalesce(collab_assets.description,'')='' then excluded.description else collab_assets.description end`,[pid,item.category,item.name,item.description,Math.min(number,Math.max(1,Number(item.firstEpisode)||number)),[number]]);
    }
    for(const name of previousNames)if(!entries.has(name))await client.query('update collab_assets set episodes=array_remove(episodes,$3) where project_id=$1 and name=$2',[pid,name,number]);
    // Legacy episode associations are replaced only after every scene is published.
    next.managedAssetNames=[...new Set([...(old.managedAssetNames||[]),...previousNames,...entries.keys()])];
    if(full){
     const legacyNames=[...(previous.output||'').matchAll(/^[-*•]\s*(【[^】]+】)/gm)].map(m=>m[1]);
     next.managedAssetNames=[...new Set([...next.managedAssetNames,...legacyNames])];
     for(const name of legacyNames)if(!entries.has(name))await client.query('update collab_assets set episodes=array_remove(episodes,$3) where project_id=$1 and name=$2',[pid,name,number]);
    }
    next.version=old.version+1;next.lastWriteId=p.writeId;next.updatedAt=Date.now();next.updatedBy=uid;
    previous.output=reviewedOutput(next,number);previous.fingerprint=`art-review-${next.version}`;
    row.analysis_output=mergePublicationOutput(row.analysis_output,previous.output,number);
   }
   progress[number]={...previous,review:next};
   await client.query('update collab_projects set analysis_progress=$2,analysis_output=$3,updated_at=now() where id=$1',[pid,JSON.stringify(progress),row.analysis_output||'']);
   await client.query('COMMIT');return next;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 return {saveArtReview:(pid,p,uid)=>transaction(pid,p,uid,'save'),publishArtReview:(pid,p,uid)=>transaction(pid,p,uid,'publish')};
}
module.exports={artReviewRepository,validateReview,signature,verified,sourceScenes};

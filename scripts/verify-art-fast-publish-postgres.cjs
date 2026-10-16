// Run on the server. All publication writes use connection-local TEMP tables.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('/opt/xingzhou-cloud-backend/node_modules/pg');
const source=path.resolve(process.argv[2]||'/opt/xingzhou-cloud-backend/src');
const {artReviewRepository,sourceScenes,signature}=require(path.join(source,'art-review-repository.cjs'));
const {numberedEpisodes}=require(path.join(source,'collab-episodes.cjs'));
(async()=>{
 const line=fs.readFileSync('/opt/xingzhou-cloud-backend/.env','utf8').split('\n').find(s=>s.startsWith('DATABASE_URL='));
 const client=new Client({connectionString:line.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g,'')});await client.connect();
 try{
  let episodes=Array.from({length:40},(_,i)=>({title:`第${i+1}集 / Episode ${i+1}`,content:`第${i+1}集\nEpisode ${i+1}\n${i+1}-1 工会 日 内\nActivate the Dissolution circle.`}));
  if(process.argv[3]){const row=(await client.query('select episodes from public.collab_projects where id=$1 and deleted_at is null',[process.argv[3]])).rows[0];assert.ok(row);episodes=row.episodes;}
  const indexed=numberedEpisodes(episodes),original=JSON.stringify(episodes);assert.equal(indexed.length,40);
  await client.query('create temp table collab_projects(id text primary key,owner_id text,genre text,episodes jsonb,analysis_progress jsonb,analysis_output text,updated_at timestamptz,deleted_at timestamptz)');
  await client.query('create temp table collab_members(project_id text,user_id text,role text)');
  await client.query("create temp table collab_assets(id text default md5(random()::text),project_id text,category text,name text,description text,first_episode int,episodes int[],image_url text,images jsonb default '[]',unique(project_id,name))");
  await client.query("insert into collab_projects values('qa','owner','[COLLAB_PROJECT]',$1,'{}','',now(),null)",[JSON.stringify(episodes)]);
  const repo=artReviewRepository({connect:async()=>({query:(...args)=>client.query(...args),release(){}})});let count=0;
  for(const {episode,number}of indexed){
   const card={id:'hero',category:'character',name:'【人物-常服】',description:'',ready:false,firstEpisode:1};
   const scenes=sourceScenes(episode.content,number).map(s=>({...s,items:[card],mappingReady:true}));scenes.forEach(s=>s.approval={signature:signature(s),actor:'owner'});
   const data={schema:1,episodeNumber:number,sourceContent:episode.content,scenes,roster:[card],unassigned:[],dependencies:{},published:{},status:'generated'};
   const saved=await repo.saveArtReview('qa',{episodeNumber:number,data,baseVersion:0,writeId:`save-${number}`},'owner');
   const published=await repo.publishArtReview('qa',{episodeNumber:number,baseVersion:saved.version,sceneIds:scenes.map(s=>s.id),writeId:`publish-${number}`},'owner');assert.equal(Object.keys(published.published).length,scenes.length);count+=scenes.length;
  }
  const assets=(await client.query('select * from collab_assets')).rows;assert.equal(assets.length,1);assert.equal(assets[0].episodes.length,40);
  const row=(await client.query("select * from collab_projects where id='qa'")).rows[0];assert.equal(JSON.stringify(row.episodes),original);assert.equal(Object.keys(row.analysis_progress).length,40);
  console.log(JSON.stringify({fastPublishPostgres:'PASS',episodes:40,scenes:count,temporaryTablesOnly:true,realSourceReadOnly:Boolean(process.argv[3])}));
 }finally{await client.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});

const crypto=require('node:crypto');
const test=require('node:test'),assert=require('node:assert/strict');
const {artReviewRepository,validateReview,signature,sourceScenes}=require('../src/art-review-repository.cjs');
const {handleAction}=require('../src/collab.cjs');
const episode={title:'第1集',episodeNumber:1,content:'1-1 卧室 夜 内\n林清雪穿睡衣。\n\n1-2 学校 日 外\n林清雪穿校服。'};
const item=name=>({id:name,category:'character',name,description:'完整脸型和对应服装',ready:true,firstEpisode:1});
function record(){const scenes=sourceScenes(episode.content,1).map((s,i)=>({...s,items:[item(i?'【林清雪-校服】':'【林清雪-睡衣】')],removed:[],mappingReady:true}));scenes.forEach(s=>s.approval={signature:signature(s),actor:'owner'});return {schema:1,episodeNumber:1,sourceContent:episode.content,version:0,scenes,unassigned:[],history:[],published:{},dependencies:{},status:'generated'};}
function fixture(){
 const row={id:'p',owner_id:'owner',genre:'青春\n[COLLAB_PROJECT]',episodes:[episode],analysis_progress:{},analysis_output:'',assets:[]},queries=[];let backup;
 const client={release(){},async query(sql,args=[]){queries.push({sql,args});if(sql==='BEGIN'){backup=structuredClone(row);return {rows:[]};}if(sql==='ROLLBACK'){Object.assign(row,backup);return {rows:[]};}if(sql==='COMMIT'||sql.startsWith('set local'))return {rows:[]};
  if(sql.startsWith('select p.*'))return {rows:[structuredClone(row)]};if(sql.startsWith('select 1 as ok'))return {rows:args[1]==='artist'?[{ok:1}]:[]};
  if(sql.startsWith('select * from collab_assets'))return {rows:row.assets.filter(a=>a.name===args[1])};
  if(sql.startsWith('insert into collab_assets')){let asset=row.assets.find(a=>a.name===args[2]);if(asset){asset.episodes=[...new Set([...asset.episodes,...args[5]])];asset.description||=args[3];}else row.assets.push({id:'id-'+row.assets.length,category:args[1],name:args[2],description:args[3],first_episode:args[4],episodes:args[5],images:[]});return {rows:[]};}
  if(sql.startsWith('update collab_assets')){const asset=row.assets.find(a=>a.name===args[1]);if(asset)asset.episodes=asset.episodes.filter(n=>n!==args[2]);return {rows:[]};}
  if(sql.startsWith('update collab_projects set analysis_progress')){row.analysis_progress=JSON.parse(args[1]);row.analysis_output=args[2];return {rows:[row]};}throw Error('Unexpected SQL '+sql);
 }};const repo=artReviewRepository({connect:async()=>client});return {row,queries,repo};
}
const save=(f,data=record(),uid='owner',baseVersion=0)=>f.repo.saveArtReview('p',{episodeNumber:1,data,baseVersion,writeId:crypto.randomUUID()},uid);
test('roster cards must be valid and scene memberships must refer to the same saved card',()=>{
 const r=record();r.roster=r.scenes.flatMap(s=>s.items);assert.equal(validateReview(r,episode,1),r);
 assert.throws(()=>validateReview({...r,roster:[{...r.roster[0],category:'invalid'}]},episode,1),/资产/);
 assert.throws(()=>validateReview({...r,roster:[r.roster[0]]},episode,1),/名单/);
});
test('candidate save creates no cards; publish creates exact approved scene memberships and keeps existing images/edits',async()=>{
 const f=fixture();f.row.assets.push({id:'old',name:'【林清雪-睡衣】',category:'character',description:'人工定稿',images:[{url:'old.png'}],episodes:[2],first_episode:1});
 const saved=await save(f);assert.equal(f.row.assets.length,1);const writeId=crypto.randomUUID(),published=await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:saved.version,sceneIds:['1-1','1-2'],writeId},'owner');
 assert.equal(f.row.assets.length,2);const old=f.row.assets.find(a=>a.id==='old');assert.deepEqual(old.images,[{url:'old.png'}]);assert.equal(old.description,'人工定稿');assert.deepEqual(old.episodes,[2,1]);assert.deepEqual(published.published['1-1'].items.map(i=>i.name),['【林清雪-睡衣】']);assert.deepEqual(published.published['1-2'].items.map(i=>i.name),['【林清雪-校服】']);
 const replay=await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:1,sceneIds:['1-1','1-2'],writeId},'owner');assert.equal(replay.version,published.version);assert.equal(f.row.assets.length,2);
});
test('editing an unverified candidate never changes published cards; replacement detaches membership without deleting old image rows',async()=>{
 const f=fixture();let saved=await save(f);saved=await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:1,sceneIds:['1-1','1-2'],writeId:crypto.randomUUID()},'owner');const old=f.row.assets.find(a=>a.name==='【林清雪-睡衣】');old.images=[{url:'precious.png'}];
 let changed=structuredClone(saved);changed.scenes[0].items=[item('【林清雪-受伤睡衣】')];changed.scenes[0].approval=null;changed=await save(f,changed,'owner',saved.version);assert.deepEqual(old.episodes,[1]);assert.equal(f.row.assets.length,2);
 changed.scenes[0].approval={signature:signature(changed.scenes[0])};changed=await save(f,changed,'owner',changed.version);await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:changed.version,sceneIds:['1-1'],writeId:crypto.randomUUID()},'owner');assert.equal(f.row.assets.length,3);assert.deepEqual(f.row.assets.find(a=>a.name===old.name).episodes,[]);assert.deepEqual(f.row.assets.find(a=>a.name===old.name).images,[{url:'precious.png'}]);
});
test('whole-episode replacement removes obsolete scene bindings after script numbering changes',async()=>{
 const f=fixture();let r=await save(f);r=await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:r.version,sceneIds:['1-1','1-2'],writeId:crypto.randomUUID()},'owner');f.row.episodes=[{title:'第1集',episodeNumber:1,content:'1-5 新场景\n新剧情'}];r.sourceContent=f.row.episodes[0].content;r.scenes=[{id:'1-5',source:r.sourceContent,items:[item('【新角色-常服】')]}];r.scenes[0].approval={signature:signature(r.scenes[0])};r=await save(f,r,'owner',r.version);r=await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:r.version,sceneIds:['1-5'],writeId:crypto.randomUUID()},'owner');assert.deepEqual(Object.keys(r.published),['1-5']);assert.equal(f.row.assets.filter(a=>a.episodes.includes(1)).length,1);
});
test('stale source, stale approval, missing detail, duplicate names and version conflicts cannot publish; transactions roll back',async()=>{
 const f=fixture(),r=record();await save(f,r);await assert.rejects(save(f,r),/其他核实修改/);
 const tampered=record();tampered.sourceContent+='changed';assert.throws(()=>validateReview(tampered,episode,1),/正文已改变/);tampered.sourceContent=episode.content;tampered.scenes[0].items[0].name='【改名】';assert.throws(()=>validateReview(tampered,episode,1),/核实版本/);
 const incomplete=record();incomplete.scenes[0].items[0].ready=false;incomplete.scenes[0].approval=null;await save(f,incomplete,'owner',1);await assert.rejects(f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:2,sceneIds:['1-1'],writeId:crypto.randomUUID()},'owner'),/尚未核实/);assert.equal(f.row.assets.length,0);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
 const duplicates=record();duplicates.scenes[0].approval=null;duplicates.scenes[0].items.push(duplicates.scenes[0].items[0]);assert.throws(()=>validateReview(duplicates,episode,1),/格式/);
});
test('direct repository calls enforce membership, project locks, deletion and director/collab isolation',async()=>{
 const f=fixture();assert.equal(await save(f,record(),'stranger'),null);assert.ok(await save(f,record(),'artist'));
 f.row.genre+='\n[PROJECT_LOCKED]';await assert.rejects(save(f,record(),'owner',1),e=>e.status===423);f.row.genre='[COLLAB_PROJECT]\n[RECYCLE_UNTIL:2099-01-01]';await assert.rejects(save(f,record(),'owner',1),e=>e.status===410);f.row.genre='[DIRECTOR_PROJECT]';assert.equal(await save(f,record(),'owner',1),null);
});

test('confirmed list with missing detail can publish; completed detail fills the placeholder without changing its ID',async()=>{
 const f=fixture(),r=record();r.scenes[0].items[0].description='';r.scenes[0].items[0].ready=false;r.scenes[0].approval={signature:signature(r.scenes[0])};
 let saved=await save(f,r);saved=await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:saved.version,sceneIds:['1-1'],writeId:crypto.randomUUID()},'owner');
 assert.equal(f.row.assets.length,1);const id=f.row.assets[0].id;assert.equal(f.row.assets[0].description,'');
 saved.scenes[0].items[0].description='正确的完整基础外貌与睡衣造型';saved.scenes[0].items[0].ready=true;saved.scenes[0].approval={signature:signature(saved.scenes[0])};
 saved=await save(f,saved,'owner',saved.version);await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:saved.version,sceneIds:['1-1'],writeId:crypto.randomUUID()},'owner');
 assert.equal(f.row.assets[0].id,id);assert.equal(f.row.assets[0].description,'正确的完整基础外貌与睡衣造型');
});
test('explicit voice-only explanation remains in review without creating a fictitious visual card',async()=>{
 const f=fixture(),r=record();r.scenes[0].items[0]={...r.scenes[0].items[0],ready:false,description:'',detailStatus:'nonvisual'};r.scenes[0].approval={signature:signature(r.scenes[0])};
 const saved=await save(f,r);const published=await f.repo.publishArtReview('p',{episodeNumber:1,baseVersion:saved.version,sceneIds:['1-1','1-2'],writeId:crypto.randomUUID()},'owner');
 assert.equal(f.row.assets.length,1);assert.equal(f.row.assets[0].name,'【林清雪-校服】');assert.equal(published.published['1-1'].items[0].detailStatus,'nonvisual');
});
test('gateway blocks non-art members and fails closed while lock state is unknown',async()=>{
 for(const action of ['art-review-save','art-review-publish']){
  let calls=0;const repo={getProject:async()=>({id:'p',owner_id:'owner',genre:'[COLLAB_PROJECT]'}),isProjectLocked:async()=>false,findMembership:async()=>({role:'collaborator'}),saveArtReview:async()=>{calls++},publishArtReview:async()=>{calls++}};
  assert.equal((await handleAction(action,{projectId:'p'},{id:'other'},repo)).status,403);repo.isProjectLocked=async()=>undefined;assert.equal((await handleAction(action,{projectId:'p'},{id:'owner'},repo)).status,503);assert.equal(calls,0);
 }
});
test('earlier reference changes do not block selected episode publication; malformed provenance is rejected',async()=>{
 const f=fixture(),r=record();r.dependencies={0:'bad'};assert.throws(()=>validateReview({...r,dependencies:{2:'future'}},episode,1),/前集/);
 f.row.episodes=[{...episode,title:'第2集',episodeNumber:2,content:episode.content.replaceAll('1-','2-')},episode];const second=record();second.episodeNumber=2;second.sourceContent=f.row.episodes[0].content;second.scenes=sourceScenes(second.sourceContent,2).map((s,i)=>({...s,items:[item('【角色-'+i+'】')]}));second.scenes.forEach(s=>s.approval={signature:signature(s)});second.dependencies={1:'old approved ledger'};
 await f.repo.saveArtReview('p',{episodeNumber:2,data:second,baseVersion:0,writeId:crypto.randomUUID()},'owner');await f.repo.publishArtReview('p',{episodeNumber:2,baseVersion:1,sceneIds:['2-1'],writeId:crypto.randomUUID()},'owner');assert.equal(f.row.assets.length,1);
});

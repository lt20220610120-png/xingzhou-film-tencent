const test = require('node:test');
const assert = require('node:assert/strict');
const {handleAction} = require('../src/collab.cjs');
const {appendArtEpisodeSnapshot, episodeNumber, composeDirectorScript} = require('../src/collab-episodes.cjs');
const {parsePublicationOutput, validatePublicationAssets} = require('../src/analysis-publication.cjs');
const {extendRepository} = require('../src/repository-extras.cjs');
const {analysisRepository} = require('../src/analysis-repository.cjs');

const output = (n, person = '- 无') => `### 第${n}集\n人物：\n${person}\n场景：\n- 无\n道具：\n- 无`;
const episode = {id:'e19',title:'第19集',content:'19-1 家 日 内'};
const collab = (extra = {}) => ({id:'copy',owner_id:'owner',genre:'[COLLAB_PROJECT]',episodes:[episode],script:'原协作稿',...extra});
const director = (extra = {}) => ({id:'source',owner_id:'owner',genre:'[DIRECTOR_PROJECT]',analysis_output:'local-source',episodes:[episode],script:'第19集\n19-1 家 日 内',...extra});

test('reverse domain: director handlers cannot read, edit, lock or hard-delete ordinary/locked collaborations', async () => {
 for(const genre of ['[COLLAB_PROJECT]','[COLLAB_PROJECT]\n[PROJECT_LOCKED]']) {
  const calls=[];
  const repo={getProject:async()=>collab({genre}),getDirectorProject:async()=>{calls.push('get');return collab({genre});},updateDirectorProject:async()=>{calls.push('update');return collab({genre});},deleteDirectorProject:async()=>{calls.push('delete');return {id:'copy'};},setProjectLocked:async()=>{calls.push('lock');return {id:'copy'};}};
  for(const action of ['director-project-get','director-project-update','director-project-delete','director-project-lock']) {
   const r=await handleAction(action,{projectId:'copy'},{id:'owner'},repo);
   assert.ok([403,404].includes(r.status),action);
  }
  assert.deepEqual(calls,[]);
 }
});

test('reverse domain: repository get/update/delete require exact director type and delete guards lock and live source links in one transaction', async () => {
 for(const row of [collab(),collab({genre:'[COLLAB_PROJECT]\n[PROJECT_LOCKED]'}),director({genre:'[DIRECTORXPROJECT]'})]) {
  const sql=[];const client={query:async(q)=>{sql.push(q);if(/^select /i.test(q))return {rows:[structuredClone(row)]};return {rows:[],rowCount:0};},release(){}};
  const repo=extendRepository({query:client.query,connect:async()=>client});
  assert.equal(await repo.getDirectorProject(row.id,'owner'),null);
  assert.equal(await repo.updateDirectorProject(row.id,{updates:{}},'owner'),null);
  assert.equal(await repo.deleteDirectorProject(row.id,'owner'),null);
  assert.equal(sql.some(q=>/^delete from collab_projects/i.test(q)),false);
 }
 for(const kind of ['locked','linked']) {
  const row=director(kind==='locked'?{genre:'[DIRECTOR_PROJECT]\n[PROJECT_LOCKED]'}:{});
  const queries=[];const client={query:async(q)=>{queries.push(q);if(/from collab_projects p where p.id=\$1/i.test(q))return {rows:[row]};if(/from collab_projects where id=\$1/i.test(q))return {rows:[row]};if(/from collab_projects c/i.test(q))return {rows:kind==='linked'?[{ok:1}]:[]};return {rows:[],rowCount:0};},release(){}};
  const repo=extendRepository({query:client.query,connect:async()=>client});
  await assert.rejects(repo.deleteDirectorProject('source','owner'),e=>e.status===423||e.status===409);
  assert.ok(queries.some(q=>/for update/i.test(q)),kind);
  assert.equal(queries.some(q=>/^delete from collab_projects/i.test(q)),false);
  assert.equal(queries.at(-1),'ROLLBACK');
 }
});

test('append refuses all contradictory unit evidence, Markdown heading variants and unparseable Roman units',()=>{
 const cases=[
  ['第20集兼第二十一章','20-1 家 日 内'],
  ['第20集','20-1 家 日 内\n第二十一章\n另一集'],
  ['第20集','20-1 家 日 内\n第21幕\n另一集'],
  ['第20集','20-1 家 日 内\n第21部\n另一集'],
  ['第20集','20-1 家 日 内\n第21集\n另一集'],
  ['第20集','20-1 家 日 内\n- 第21集\n另一集'],
  ['第20集','20-1 家 日 内\n> 第21集\n另一集'],
  ['第20集','20-1 家 日 内\n1.第21集\n另一集'],
  ['第20集','20-1 家 日 内\nChapter XXI\n另一集'],
  ['第20集','第20集\n20-1 家 日 内\n第二十章\n另一集'],
 ];
 for(const [title,content] of cases) {
  assert.equal(episodeNumber({episodeNumber:20,title,content}),0,content);
  assert.throws(()=>appendArtEpisodeSnapshot(collab(),{episodeNumber:20,title,content}),e=>e.status===400,content);
 }
 assert.ok(appendArtEpisodeSnapshot(collab(),{episodeNumber:20,title:'第20集',content:'20-1 家 日 内\n韩川：第二十一章的故事还没讲。'}));
});

test('publication rejects later 第21部 and prefixed cross-episode units before any asset whitelisting',()=>{
 for(const tail of ['第21部','- 第21集','> 第21章','1.第21幕','Part XXI','Episode 21']) {
  const raw=output(20,'- 【本集角色】实际出镜；服装：西装。') .replace('场景：',`${tail}\n- 【跨集角色】实际出镜；服装：风衣。\n场景：`);
  assert.throws(()=>parsePublicationOutput(raw,20),e=>e.status===400,tail);
 }
 const good=output(20,'- 【本集角色】实际出镜；服装：西装。');
 assert.equal(validatePublicationAssets([{name:'【本集角色】',category:'character'}],parsePublicationOutput(good,20),20).length,1);
});

test('refresh and storyboard lock target with current member authorization; revoked membership returns no target',async()=>{
 for(const operation of ['refreshDirectorPrompts','patchStoryboard']) {
  const sql=[];const row=collab({genre:'[COLLAB_PROJECT]\n[COLLAB_SOURCE:local-source]'});
  const client={query:async(q)=>{sql.push(q);if(/^select .*collab_projects/i.test(q))return {rows:[row]};if(/select 1 as ok from collab_members/i.test(q))return {rows:[]};return {rows:[]};},release(){}};
  const repo=extendRepository({query:client.query,connect:async()=>client});
  const result=operation==='refreshDirectorPrompts'?await repo[operation]('copy','former') : await repo[operation]('copy',{episodeId:'e19',operation:'create',scene:'19-1',shotId:'new'},'former');
  assert.equal(result,null);
  const lockIndex=sql.findIndex(q=>/from collab_projects/i.test(q)&&/for update/i.test(q));
  const authIndex=sql.findIndex(q=>/select 1 as ok from collab_members/i.test(q));
  assert.ok(lockIndex>=0&&authIndex>lockIndex,operation);
  assert.equal(sql.some(q=>/from collab_projects p where \(p.id::text|^update /i.test(q)),false);
 }
});

test('member removal and role downgrade share the project row lock used by protected writes',async()=>{
 for(const operation of ['removeDirectorMember','updateMemberRole']){
  const sql=[];const row=collab();
  const client={query:async(q)=>{sql.push(q);if(/select p\.\* from collab_projects/i.test(q))return {rows:[row]};if(/^delete from collab_members|^update collab_members/i.test(q))return {rows:[{user_id:'member'}]};return {rows:[]};},release(){}};
  const repo=extendRepository({query:client.query,connect:async()=>client});
  const result=operation==='removeDirectorMember'?await repo[operation]('copy','member','owner','collab'):await repo[operation]('copy',{userId:'member',role:'artist'},'owner');
  assert.ok(result,operation);
  assert.ok(sql.findIndex(q=>/select p\.\* from collab_projects/i.test(q)&&/for update/i.test(q))>=0,operation);
  assert.equal(sql.at(-1),'COMMIT');
 }
});

test('append and publish recheck the current role after locking instead of using a stale lock-wait snapshot',async()=>{
 for(const operation of ['appendArtEpisode','publishAnalysis']){
  const sql=[];const row=collab();
  const client={query:async(q)=>{sql.push(q);if(/select p\.\* from collab_projects/i.test(q))return {rows:[row]};if(/select 1 as ok from collab_members/i.test(q))return {rows:[]};return {rows:[]};},release(){}};
  const repo=analysisRepository({connect:async()=>client});
  const payload=operation==='appendArtEpisode'?{episodeNumber:20,title:'第20集',content:'20-1 家 日 内'}:{episodeNumber:19,sourceContent:episode.content,output:output(19),assets:[],fingerprint:'f',baseOutput:''};
  assert.equal(await repo[operation]('copy',payload,'former'),null);
  const lockIndex=sql.findIndex(q=>/from collab_projects/i.test(q)&&/for update/i.test(q));
  const authIndex=sql.findIndex(q=>/select 1 as ok from collab_members/i.test(q));
  assert.ok(lockIndex>=0&&authIndex>lockIndex,operation);
  assert.equal(sql.some(q=>/^update collab_projects|^insert into collab_assets/i.test(q)),false);
 }
});

test('message send fails closed in the repository and handler when current membership is gone',async()=>{
 const {createRepository}=require('../src/postgres-repository.cjs');
 let statement='';const repository=createRepository('',{pool:{query:async(q)=>{statement=q;return {rows:[]};},end:async()=>{}}});
 assert.equal(await repository.sendMessage('copy',{content:'x'},'former'),null);
 assert.match(statement,/insert into collab_messages[\s\S]*select/i);
 assert.match(statement,/exists\s*\(select 1 from collab_members/i);
 assert.match(statement,/deleted_at is null/i);
 assert.match(statement,/PROJECT_LOCKED/i);
 const repo={getProject:async()=>collab(),findMembership:async()=>({role:'artist'}),isProjectLocked:async()=>false,sendMessage:async()=>null};
 assert.equal((await handleAction('message-send',{projectId:'copy',content:'x'},{id:'former'},repo)).status,403);
});

test('source collision with a mixed/undecodable unit heading fails without changing either manuscript',()=>{
 const local=[episode,{id:'local20',number:20,title:'第20集',content:'20-1 本地 日 内',collabOnly:true}];
 const incoming=[episode,{id:'source20',number:20,title:'第20集',content:'20-1 源 日 内'},{id:'source21',number:21,title:'第21集',content:'21-1 源 夜 内'}];
 for(const script of [
  '前言\n第19集\n19-1 家 日 内\n第20集兼第21集\n20-1 源 日 内\n第21集\n21-1 源 夜 内',
  '前言\n第19集\n19-1 家 日 内\nEpisode XIX\n第20集\n20-1 源 日 内\n第21集\n21-1 源 夜 内',
 ]) {
  const original=script;
  assert.throws(()=>composeDirectorScript(script,local,incoming),e=>e.status===409);
  assert.equal(script,original);
 }
});

test('paired real renderer/parser/whitelist classify single-field human, later voice, later anthropomorphism and brief phone alike',async()=>{
 const {parseArtAnalysis,buildAssetRows}=await import('../../core/collabStore.js');
 const cases=[
  ['【韩川手机】','服装：西装；外观：高大；屏幕：亮起。','prop'],
  ['【韩川-商务装（电梯内手机状态）】','服装：西装；脸型：方脸；屏幕：手持手机亮起。','character'],
  ['【系统VO】','开场提示。\n仅声音出场；无实体形象。',null],
  ['【拟人手机】','外观：黑色智能手机；屏幕：发亮。\n画面中出现拟人化角色；服装：西装。','character'],
  ['【拼单手机】','黑色直板智能手机，用于拼单外卖界面。配饰随身物属性，非人物资产。','prop'],
 ];
 for(const [name,description,expected] of cases) {
  const raw=output(20,`- ${name}${description}`);
  const front=buildAssetRows(parseArtAnalysis(raw));
  const back=parsePublicationOutput(raw,20).filter(e=>e.generatable!==false);
  assert.deepEqual(front.map(e=>[e.name,e.category]),expected?[[name,expected]]:[],name+' renderer');
  assert.deepEqual(back.map(e=>[e.name,e.category]),front.map(e=>[e.name,e.category]),name+' backend');
  assert.equal(validatePublicationAssets(front,parsePublicationOutput(raw,20),20).length,front.length);
 }
});

test('publish checks actual concurrent name/category conflict at UPSERT and rolls back all assets/progress',async()=>{
 const row=collab(), assets=[];let snapshot,inserted=false,release=0;const sql=[];
 const query=async(q,values=[])=>{
  sql.push(q);
  if(q==='BEGIN')snapshot={row:structuredClone(row),assets:structuredClone(assets)};
  if(q==='ROLLBACK'){Object.assign(row,snapshot.row);assets.splice(0,assets.length,...snapshot.assets);}
  if(/^select p\.\* from collab_projects/i.test(q))return {rows:[structuredClone(row)]};
  if(/^select \* from collab_assets/i.test(q))return {rows:structuredClone(assets)};
  if(/^insert into collab_assets/i.test(q)){
   const [pid,category,name,description,first,episodes]=values;
   if(!inserted){assets.push({id:'external',project_id:pid,category:'scene',name:'【冲突手机】',episodes:[1],first_episode:1,image_url:'external.png'});inserted=true;}
   const old=assets.find(a=>a.name===name);
   if(old&&old.category!==category && !(old.category==='character'&&category==='prop'))return {rows:[],rowCount:0};
   if(old)old.episodes=[...new Set([...old.episodes,...episodes])];else assets.push({id:'created',project_id:pid,category,name,description,first_episode:first,episodes,image_url:''});
   return {rows:[{id:old?.id||'created'}],rowCount:1};
  }
  if(/^update collab_projects/i.test(q)){row.analysis_progress=JSON.parse(values[1]);return {rows:[structuredClone(row)]};}
  return {rows:[],rowCount:0};
 };
 const pool={connect:async()=>({query,release(){release++;}})};
 const raw=output(19).replace('道具：\n- 无','道具：\n- 【先写资产】黑色智能手机\n- 【冲突手机】黑色智能手机');
 await assert.rejects(analysisRepository(pool).publishAnalysis('copy',{episodeNumber:19,sourceContent:episode.content,output:raw,assets:[{name:'【先写资产】',category:'prop'},{name:'【冲突手机】',category:'prop'}],fingerprint:'f',baseOutput:''},'owner'),e=>e.status===409);
 assert.ok(sql.some(q=>/on conflict\(project_id,name\)/i.test(q)&&/returning/i.test(q)&&/where/i.test(q)));
 assert.equal(assets.some(a=>a.name==='【先写资产】'),false);
 assert.deepEqual(row.analysis_progress,undefined);
 assert.equal(release,1);
});

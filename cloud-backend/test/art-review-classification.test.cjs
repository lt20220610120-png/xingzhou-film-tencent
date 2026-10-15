const test=require('node:test'),assert=require('node:assert/strict');
const {artReviewRepository,signature}=require('../src/art-review-repository.cjs');

// The repository runs against a transaction-aware SQL boundary. Asset rows model
// the persisted identity and media references, not a replacement repository.
function fixture(assets=[]){
 const content='3-1 山洞 夜 内\n三首龙出现。\n\n3-2 山路 日 外\n众人离开。';
 const row={id:'p',owner_id:'owner',genre:'[COLLAB_PROJECT]',episodes:[{episodeNumber:3,title:'第3集',content}],analysis_progress:{},analysis_output:''};
 let stored=structuredClone(assets),backup;
 const client={release(){},async query(sql,a=[]){
  if(sql==='BEGIN'){backup={row:structuredClone(row),assets:structuredClone(stored)};return {rows:[]};}
  if(sql==='ROLLBACK'){Object.assign(row,backup.row);stored=backup.assets;return {rows:[]};}
  if(sql==='COMMIT'||sql.startsWith('set local'))return {rows:[]};
  if(sql.startsWith('select p.*'))return {rows:[structuredClone(row)]};
  if(sql.startsWith('select 1 as ok'))return {rows:[]};
  if(sql.startsWith('select * from collab_assets'))return {rows:structuredClone(stored.filter(v=>v.project_id===a[0]&&v.name===a[1]))};
  if(sql.startsWith('update collab_assets set category=')){
   const asset=stored.find(v=>v.project_id===a[0]&&v.name===a[1]);
   if(asset)asset.category=a[2];return {rows:asset?[structuredClone(asset)]:[],rowCount:asset?1:0};
  }
  if(sql.startsWith('insert into collab_assets')){
   let asset=stored.find(v=>v.project_id===a[0]&&v.name===a[2]);
   if(asset){asset.episodes=[...new Set([...asset.episodes,...a[5]])].sort((x,y)=>x-y);asset.description||=a[3];}
   else{asset={id:'created-'+stored.length,project_id:a[0],category:a[1],name:a[2],description:a[3],first_episode:a[4],episodes:a[5],image_url:''};stored.push(asset);}
   return {rows:[structuredClone(asset)],rowCount:1};
  }
  if(sql.startsWith('update collab_assets set episodes=')){
   const asset=stored.find(v=>v.project_id===a[0]&&v.name===a[1]);if(asset)asset.episodes=asset.episodes.filter(n=>n!==a[2]);return {rows:[]};
  }
  if(sql.startsWith('update collab_projects set analysis_progress')){row.analysis_progress=JSON.parse(a[1]);row.analysis_output=a[2];return {rows:[structuredClone(row)]};}
  throw Error('Unexpected SQL '+sql);
 }};
 const repo=artReviewRepository({connect:async()=>client});
 return {row,repo,assets:()=>stored};
}
const dragon='【兹梅伊·戈雷尼奇-三首龙】';
const item=(name,category)=>({id:name+'-'+category,name,category,description:'本集人工核实描述',ready:true});
function review(f,first,second=[]){
 const sources=f.row.episodes[0].content.split('\n\n');
 const scenes=[first,second].map((items,n)=>({id:'3-'+(n+1),source:sources[n],items}));
 for(const scene of scenes)scene.approval={signature:signature(scene),actor:'owner'};
 return {schema:1,episodeNumber:3,sourceContent:f.row.episodes[0].content,scenes,unassigned:[],published:{}};
}
const save=(f,data,baseVersion=0,writeId='save-'+baseVersion)=>f.repo.saveArtReview('p',{episodeNumber:3,data,baseVersion,writeId},'owner');
const publish=(f,version,sceneIds=['3-1','3-2'],writeId='publish-'+version)=>f.repo.publishArtReview('p',{episodeNumber:3,baseVersion:version,sceneIds,writeId},'owner');
const existing=category=>({id:'dragon-id',project_id:'p',name:dragon,category,description:'人工定稿及手动提示词',first_episode:2,episodes:[2,8],image_url:'cos://main',images:[{id:'image-id',url:'cos://history'}],reference_image_url:'cos://reference',custom_prompt:'保留手工prompt'});

test('verified classification correction preserves asset identity, media and edits while publishing other cards once',async()=>{
 const original=existing('prop'),f=fixture([original]);
 const saved=await save(f,review(f,[item(dragon,'character'),item('【山洞】','scene')]));
 const result=await publish(f,saved.version);
 assert.deepEqual(f.assets().find(a=>a.id==='dragon-id'),{...original,category:'character',episodes:[2,3,8]});
 assert.equal(f.assets().find(a=>a.name==='【山洞】').category,'scene');
 assert.equal(result.published['3-1'].items[0].category,'character');
 assert.equal(result.classificationCorrections.length,1);
 const correction=result.classificationCorrections[0];
 assert.deepEqual({...correction,at:0},{name:dragon,assetId:'dragon-id',from:'prop',to:'character',actor:'owner',at:0});
 assert.ok(Number.isFinite(correction.at));
 const replay=await publish(f,saved.version,['3-1','3-2']);
 assert.deepEqual(replay,result);assert.equal(f.assets().length,2);
 const next=await save(f,{...result,classificationCorrections:[]},result.version);
 assert.deepEqual(next.classificationCorrections,result.classificationCorrections);
});

test('conflicting verified classifications warn without dropping original confirmations or other cards',async()=>{
 for(const category of ['prop','scene',null]){
  const f=fixture(category?[existing(category)]:[]);
  const saved=await save(f,review(f,[item(dragon,'character'),item('【山洞】','scene')],[item(dragon,'prop')]));
  const result=await publish(f,saved.version),chosen=category==='prop'?'prop':'character';
  assert.equal(f.assets().find(a=>a.name===dragon).category,chosen);
  assert.equal(f.assets().find(a=>a.name==='【山洞】').category,'scene');
  assert.equal(result.published['3-1'].items[0].category,'character');
  assert.equal(result.published['3-2'].items[0].category,'prop');
  assert.equal(result.publicationWarnings.length,1);
  assert.equal(result.publicationWarnings[0].name,dragon);
  assert.deepEqual(result.publicationWarnings[0].categories,['character','prop']);
  assert.equal(result.publicationWarnings[0].category,chosen);
  assert.match(result.publicationWarnings[0].message,/分类待核对/);
  assert.equal(f.row.analysis_output.split(dragon).length-1,1);
  assert.ok(f.row.analysis_output.includes((chosen==='prop'?'道具：':'人物：')+'\n- '+dragon));
 }
});

test('a newly verified single classification corrects a prior scene without rewriting its published snapshot',async()=>{
 const f=fixture([existing('prop')]);let draft=review(f,[item(dragon,'prop')],[item(dragon,'prop')]);
 let saved=await save(f,draft);let result=await publish(f,saved.version);
 draft=structuredClone(result);draft.scenes[1].items=[item(dragon,'character')];draft.scenes[1].approval={signature:signature(draft.scenes[1])};
 saved=await save(f,draft,result.version);result=await publish(f,saved.version,['3-2']);
 assert.equal(f.assets()[0].category,'character');
 assert.equal(result.published['3-1'].items[0].category,'prop');
 assert.equal(result.publicationWarnings.length,0);
 assert.equal(f.row.analysis_output.split(dragon).length-1,1);
 assert.ok(f.row.analysis_output.includes('人物：\n- '+dragon));
});

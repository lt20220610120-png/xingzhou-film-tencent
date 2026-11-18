const test=require('node:test'),assert=require('node:assert/strict'),{handleAction}=require('../src/collab.cjs'),{promptBindingRepository}=require('../src/prompt-binding.cjs');
const payload={projectId:'p',baseRevision:0,writeId:'one',data:{enabled:true,snapshot:{projectId:'p',cards:[],entries:[]},decisions:{}}};
test('shared binding action requires project membership, art permission and unlocked project',async()=>{
 for(const [role,locked,exists,status]of [['artist',false,true,200],['artist_collaborator',false,true,200],['producer',false,true,200],['collaborator',false,true,403],['artist',true,true,423],['artist',false,false,403]]){
  let writes=0;const repo={getProject:async()=>exists?{id:'p',owner_id:'owner',genre:'[COLLAB_PROJECT]'}:null,isProjectLocked:async()=>locked,findMembership:async()=>({role}),listMembers:async()=>[{user_id:'guest',role}],savePromptBinding:async()=>{writes++;return{revision:1}}};
  const result=await handleAction('prompt-binding-save',payload,{id:'guest'},repo);assert.equal(result.status,status);assert.equal(writes,status===200?1:0);
 }
});
test('repository checks membership inside transaction and serializes revisions',async()=>{
 const row={id:'p',owner_id:'owner',genre:'[COLLAB_PROJECT]',analysis_progress:{}};let commits=0,rollbacks=0,writes=0;
 const client={release(){},async query(sql,args){if(sql==='BEGIN'||sql.startsWith('set local'))return{rows:[]};if(sql==='COMMIT'){commits++;return{rows:[]}}if(sql==='ROLLBACK'){rollbacks++;return{rows:[]}}if(sql.startsWith('select *'))return{rows:[structuredClone(row)]};if(sql.startsWith('select 1'))return{rows:args[1]==='artist'?[{}]:[]};if(sql.startsWith('update collab_projects')){writes++;row.analysis_progress=JSON.parse(args[1]);return{rows:[]}}throw Error(sql)}};
 const repo=promptBindingRepository({connect:async()=>client});assert.equal(await repo.savePromptBinding('p',payload,'outsider'),null);
 const saved=await repo.savePromptBinding('p',payload,'artist');assert.equal(saved.revision,1);
 assert.equal((await repo.savePromptBinding('p',payload,'artist')).revision,1);assert.equal(writes,1);
 await assert.rejects(repo.savePromptBinding('p',{...payload,writeId:'stale'},'owner'),e=>e.status===409);
 row.genre+='[PROJECT_LOCKED]';await assert.rejects(repo.savePromptBinding('p',{...payload,baseRevision:1,writeId:'locked'},'artist'),/锁定/);assert.equal(commits,2);assert.equal(rollbacks,3);
});

test('a failed recalibration can close its cloud claim while keeping the confirmed association',()=>{
 const {nextPromptBinding}=require('../src/prompt-binding.cjs');
 const data={...payload.data,decisions:{shot:{confirmed:true}},sceneDistributionAttempts:{shot:{stamp:'same',status:'calibration-failed'}}};
 const saved=nextPromptBinding({id:'p'},{...payload,data},'owner');
 assert.equal(saved.decisions.shot.confirmed,true);assert.equal(saved.sceneDistributionAttempts.shot.status,'calibration-failed');
});

test('multi-episode binding validates each review and detaches shared content from the request',()=>{
 const {nextPromptBinding}=require('../src/prompt-binding.cjs');
 const episodes=[1,2].map(episodeNumber=>({episodeNumber,content:'scene '+episodeNumber}));
 const reviews=Object.fromEntries(episodes.map(({episodeNumber,content})=>[episodeNumber,{
  schema:1,episodeNumber,sourceContent:content,scenes:[{id:episodeNumber+'-1',source:content,items:[]}],
  unassigned:[],pending:true,cloudReceipt:{version:5},writeId:'local',metadata:{token:'private',description:'keep'}
 }]));
 const request={...payload,data:{...payload.data,reviewLedger:{episodes:reviews}}};
 const saved=nextPromptBinding({id:'p',episodes},request,'owner');
 for(const review of Object.values(saved.reviewLedger.episodes)){
  assert.deepEqual(review.metadata,{description:'keep'});
  assert(!('pending' in review));assert(!('cloudReceipt' in review));assert(!('writeId' in review));
  review.scenes[0].items.push('changed');
  assert.deepEqual(reviews[review.episodeNumber].scenes[0].items,[]);
 }
 assert.equal(reviews[2].cloudReceipt.version,5);
 reviews[2].sourceContent='stale';
 assert.throws(()=>nextPromptBinding({id:'p',episodes},request,'owner'),/正文/);
});

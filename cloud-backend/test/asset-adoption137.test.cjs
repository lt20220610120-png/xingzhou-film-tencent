const test=require('node:test'),assert=require('node:assert/strict');
const {handleAction}=require('../src/collab.cjs');const {extendRepository}=require('../src/repository-extras.cjs');
const image='11111111-1111-4111-8111-111111111111';
function repo(role='artist'){return {getProject:async()=>({id:'p',owner_id:role==='producer'?'u':'owner'}),findMembership:async()=>({role}),isProjectLocked:async()=>false,selectAssetImage:async(pid,aid,iid,uid)=>pid==='p'&&aid==='a'&&iid===image&&uid==='u'?{id:aid,image_url:'projects/p/adopted.png'}:null};}
test('adoption accepts only an editable project and an image in the same asset',async()=>{
 const input={projectId:'p',assetId:'a',updates:{adoptedImageId:image}};
 for(const role of ['producer','artist','artist_collaborator'])assert.equal((await handleAction('asset-update',input,{id:'u'},repo(role))).status,200);
 assert.equal((await handleAction('asset-update',input,{id:'u'},repo('collaborator'))).status,403);
 assert.equal((await handleAction('asset-update',{...input,assetId:'other'},{id:'u'},repo())).status,404);
 assert.equal((await handleAction('asset-update',{...input,updates:{adoptedImageId:'bad'}},{id:'u'},repo())).status,400);
 const locked=repo();locked.isProjectLocked=async()=>true;assert.equal((await handleAction('asset-update',input,{id:'u'},locked)).status,423);
});
test('adoption SQL binds project, asset, image, editable membership and lock; deletion promotes only a surviving same-card image',async()=>{
 const queries=[],pool={query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('select 1'))return {rows:[{ok:1}]};if(sql.startsWith('delete'))return {rows:[{asset_id:'a',object_path:'old',url:''}]};return {rows:[{id:'a'}]};}};
 const store=extendRepository(pool);await store.selectAssetImage('p','a',image,'u');assert.deepEqual(queries[0].args,['p','a',image,'u']);for(const text of ['m.asset_id=a.id','m.project_id=a.project_id',"m.kind='asset-image'",'p.deleted_at is null','PROJECT_LOCKED','artist_collaborator'])assert(queries[0].sql.includes(text));
 await store.deleteAssetImage('p',{imageId:image},'u');const update=queries.at(-1);assert.match(update.sql,/m\.asset_id=a\.id/);assert.match(update.sql,/a\.image_url=coalesce/);assert.deepEqual(update.args,['p','a','old','']);
});

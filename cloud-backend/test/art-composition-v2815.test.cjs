const test=require('node:test'),assert=require('node:assert/strict');const{handleAction}=require('../src/collab.cjs');const{extendRepository}=require('../src/repository-extras.cjs');
const row={id:'p',owner_id:'owner',genre:'[COLLAB_PROJECT]'};
function fixture(role){const writes=[];return{writes,repo:{getProject:async()=>row,isProjectLocked:async()=>false,findMembership:async()=>({role}),updateProjectFields:async(...args)=>{writes.push(args);return row;}}};}
test('art image settings scope permits art editors only and whitelists composition, never script/name/style',async()=>{
 for(const role of ['producer','artist','artist_collaborator','collaborator']){const{repo,writes}=fixture(role);const r=await handleAction('project-update',{projectId:'p',scope:'art-image-settings',updates:{image_composition:'portrait-five',script:'forged',name:'forged',style:'AI真人'}},{id:role==='producer'?'owner':'invited'},repo);assert.equal(r.status,role==='collaborator'?403:200);if(role!=='collaborator')assert.deepEqual(writes[0][1],{image_composition:'portrait-five'});else assert.equal(writes.length,0);}
});
test('invalid layouts and locked/deleted projects reject settings without writes',async()=>{
 for(const value of ['other','',null,{},'portrait-five;drop table']){const{repo,writes}=fixture('artist');const r=await handleAction('project-update',{projectId:'p',scope:'art-image-settings',updates:{image_composition:value}},{id:'invited'},repo);assert.equal(r.status,400);assert.equal(writes.length,0);}
 for(const state of ['locked','deleted']){const{repo,writes}=fixture('artist');if(state==='locked')repo.isProjectLocked=async()=>true;else repo.getProject=async()=>({...row,deleted_at:'2026-01-01'});assert.equal((await handleAction('project-update',{projectId:'p',scope:'art-image-settings',updates:{image_composition:'portrait-five'}},{id:'invited'},repo)).status,state==='locked'?423:410);assert.equal(writes.length,0);}
});
test('repository rechecks editor role under lock and writes only validated composition',async()=>{
 for(const role of ['artist','artist_collaborator','collaborator']){const writes=[];const client={release(){},query:async(sql,args)=>{if(/select p\.\*.*for update/i.test(sql))return{rows:[row]};if(/select 1 as ok from collab_members/.test(sql))return{rows:args.slice(2).includes(role)?[{ok:1}]:[]};if(/^update collab_projects/.test(sql)){writes.push({sql,args});return{rows:[{...row,image_composition:'portrait-five'}]};}return{rows:[]};}};
  const repo=extendRepository({query:client.query,connect:async()=>client});const saved=await repo.updateProjectFields('p',{image_composition:'portrait-five',script:'forged'},'invited','art-image-settings');if(role==='collaborator'){assert.equal(saved,null);assert.equal(writes.length,0);}else{assert.equal(saved.image_composition,'portrait-five');assert.ok(writes[0].sql.includes('image_composition=$2'));assert.ok(!writes[0].sql.includes('script='));}
 }
});

// Exercise the existing JSONB storage using a throwaway pg_virtualenv cluster.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {Pool} = require('pg');
const {createRepository} = require('../src/postgres-repository.cjs');
const {handleAction} = require('../src/collab.cjs');

async function run() {
  assert.match(process.env.PGPORT || '', /^\d+$/);
  assert.notEqual(process.env.PGPORT, '5432');
  assert.match(process.env.PG_CLUSTER_CONF_ROOT || '', /[\\/]pg_virtualenv\./, 'Use a throwaway pg_virtualenv cluster');
  const pool = new Pool();
  const repo = createRepository('', {pool});
  try {
    await pool.query(await fs.readFile(path.join(__dirname,'../schema.sql'),'utf8'));
    const owner={id:randomUUID()}, collaborator={id:randomUUID()}, artist={id:randomUUID()}, outsider={id:randomUUID()};
    const projectId=randomUUID(), episodeId='episode', storyId='shot';
    const references=[{id:'picture-fixture',assetId:'asset-fixture',assetImageSlot:true,kind:'image'}];
    const original={id:storyId,label:'1-1-1',content:'原稿',recommendedDurationSeconds:17,
      generationConfig:{duration:12,durationManuallyAdjusted:true,references}};
    const episodes=[{id:episodeId,episodeNumber:1,content:'1-1 房间',prompts:[original],storyboardPrompts:[original]}];
    await pool.query('insert into collab_projects(id,name,owner_id,episodes) values($1,$2,$3,$4)',[projectId,'隔离测试',owner.id,JSON.stringify(episodes)]);
    await pool.query("insert into collab_members(project_id,user_id,username,role) values($1,$2,'editor_fixture','collaborator'),($1,$3,'art_fixture','artist')",[projectId,collaborator.id,artist.id]);
    const timing={version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:17,recommendedSeconds:17,needsResegment:false,capacityStatus:'正常',
      breakdown:{speechSeconds:7,nonparallelActionSeconds:8.8,pauseBufferSeconds:0.9},reason:'台词先发声，动作与气口接续。'};
    const patch=(user,payload)=>handleAction('storyboard-patch',{projectId,...payload},user,repo);
    const read=user=>handleAction('project-get',{projectId},user,repo);
    const target={episodeId,shotId:storyId,editPolicy:'direct',ackOnly:true};
    const write={...target,base:{content:'原稿'},updates:{durationEstimate:timing}};
    assert.equal((await patch(artist,write)).status,403);
    assert.equal((await patch(outsider,write)).status,403);
    const receipt=await patch(collaborator,write);
    assert.equal(receipt.status,200);
    assert.deepEqual(receipt.body.storyboardReceipt.shot.durationEstimate,timing);
    const settings={operation:'settings',scope:'episode',episodeId,revision:'recommended',durationMode:'recommended',supportedDurations:[5,10,20,30],
      settings:{profileId:'fixture',model:'mock',ratio:'16:9',resolution:'720p'}};
    const protectedRow=(await patch(owner,settings)).body.episodes[0].storyboardPrompts[0];
    assert.equal(protectedRow.generationConfig.duration,12);
    assert.equal(protectedRow.generationConfig.durationManuallyAdjusted,true);
    const reset=await patch(owner,{...settings,revision:'reset',includeManualDuration:true});
    assert.equal(reset.body.episodes[0].storyboardPrompts[0].generationConfig.duration,20);
    const edited=await patch(collaborator,{...target,updates:{content:'人工改稿'}});
    assert.equal(edited.body.storyboardReceipt.shot.durationEstimate.status,'needs-review');
    assert.equal((await patch(owner,write)).status,409);
    assert.equal((await patch(owner,{...settings,revision:'blocked',recommendedDurations:{[storyId]:20}})).status,409);
    const stored=(await read(owner)).body.episodes[0];
    assert.equal(stored.prompts[0].content,'原稿');
    assert.equal(stored.storyboardPrompts[0].content,'人工改稿');
    assert.equal(stored.storyboardPrompts[0].durationEstimate.status,'needs-review');
    assert.deepEqual(stored.storyboardPrompts[0].generationConfig.references,references);
    assert.equal(stored.storyboardDefaultSettings.global.revision,'reset');
    console.log(JSON.stringify({jsonbRoundTrip:true,oldPromptPreserved:true,referenceSeatsPreserved:true,collaboratorReceipt:true,
      unauthorizedWritesDenied:true,manualProtection:true,alignedReset:true,staleProofRejected:true,paidRequests:0}));
  } finally { await pool.end(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

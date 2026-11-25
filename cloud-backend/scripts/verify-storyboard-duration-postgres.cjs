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
    const timing={version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:17,recommendedSeconds:17,needsResegment:false,capacityStatus:'正常',
      breakdown:{speechSeconds:7,nonparallelActionSeconds:8.8,pauseBufferSeconds:0.9},reason:'台词先发声，动作与气口接续。'};
    const original={id:storyId,label:'1-1-1',content:'原稿',recommendedDurationSeconds:17,
      generationConfig:{duration:12,durationMode:'uniform',durationManuallyAdjusted:true,model:'older-model',references}};
    const legacyShot={id:'legacy-shot',label:'1-1-2',content:'既有估时分镜',durationEstimate:timing};
    const episodes=[{id:episodeId,episodeNumber:1,content:'1-1 房间',prompts:[{...original,durationEstimate:timing},legacyShot],storyboardPrompts:[original,legacyShot]}];
    await pool.query('insert into collab_projects(id,name,owner_id,episodes) values($1,$2,$3,$4)',[projectId,'隔离测试',owner.id,JSON.stringify(episodes)]);
    await pool.query("insert into collab_members(project_id,user_id,username,role) values($1,$2,'editor_fixture','collaborator'),($1,$3,'art_fixture','artist')",[projectId,collaborator.id,artist.id]);
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
    const expectedProtected={...original.generationConfig,...settings.settings,libtvMode:'auto',libtvParams:{},storyboardDefaultsRevision:'recommended'};
    assert.deepEqual(protectedRow.generationConfig,expectedProtected);
    assert.deepEqual((await read(collaborator)).body.episodes[0].storyboardPrompts[0].generationConfig,expectedProtected);
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
    const timingV3={...timing,version:'3.0.0',naturalSeconds:34,recommendedSeconds:30,capacityStatus:'略偏紧',
      breakdown:{speechSeconds:20,nonparallelActionSeconds:8,pauseBufferSeconds:5.6}};
    const refresh={...target,base:{content:'人工改稿',durationEstimate:stored.storyboardPrompts[0].durationEstimate},
      updates:{durationEstimate:timingV3}};
    assert.equal((await patch(artist,refresh)).status,403);
    assert.equal((await patch(collaborator,{...refresh,updates:{durationEstimate:{...timingV3,version:'9.0.0'}}})).status,400);
    assert.equal((await patch(collaborator,{...refresh,updates:{durationEstimate:{...timingV3,recommendedSeconds:12}}})).status,400);
    const refreshed=await patch(collaborator,refresh);
    assert.equal(refreshed.status,200);
    assert.deepEqual(refreshed.body.storyboardReceipt.shot.durationEstimate,timingV3);
    assert.equal((await patch(owner,{...refresh,updates:{durationEstimate:timing}})).status,409);
    const mixed=await patch(owner,{...settings,revision:'mixed',recommendedDurations:{[storyId]:30,[legacyShot.id]:20}});
    assert.equal(mixed.status,200);
    const readBack=(await read(collaborator)).body.episodes[0];
    assert.deepEqual(readBack.storyboardPrompts.map(row=>[row.durationEstimate.version,row.generationConfig.duration]),[['3.0.0',30],['2.0.0',20]]);
    assert.deepEqual(readBack.storyboardPrompts[0].durationEstimate,timingV3);
    assert.deepEqual(readBack.storyboardPrompts[1].durationEstimate,timing);
    assert.deepEqual(readBack.prompts[0].durationEstimate,timing);
    console.log(JSON.stringify({jsonbRoundTrip:true,oldPromptPreserved:true,referenceSeatsPreserved:true,collaboratorReceipt:true,
      unauthorizedWritesDenied:true,manualProtection:true,protectedModelAndOutputSettingsSynced:true,alignedReset:true,staleProofRejected:true,
      mixedEstimateVersions:true,malformedEstimateRejected:true,reestimateV3:true,paidRequests:0}));
  } finally { await pool.end(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

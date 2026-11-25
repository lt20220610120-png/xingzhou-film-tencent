// Run with pg_virtualenv against an empty throwaway cluster.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {Pool} = require('pg');
const {createRepository} = require('../src/postgres-repository.cjs');
const {handleAction} = require('../src/collab.cjs');

async function verify() {
  assert.match(process.env.PGPORT || '', /^\d+$/);
  assert.notEqual(process.env.PGPORT, '5432');
  assert.match(process.env.PG_CLUSTER_CONF_ROOT || '', /[\\/]pg_virtualenv\./);
  const pool = new Pool();
  const repository = createRepository('', {pool});
  try {
    await pool.query(await fs.readFile(path.join(__dirname, '../schema.sql'), 'utf8'));
    const owner = {id:randomUUID()}, editor = {id:randomUUID()}, outsider = {id:randomUUID()};
    const projectId = randomUUID(), directorId = randomUUID();
    const estimate = {version:'3.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:23,recommendedSeconds:23,
      needsResegment:false,capacityStatus:'正常',breakdown:{speechSeconds:16,nonparallelActionSeconds:6,pauseBufferSeconds:0.6},reason:'对白和动作顺序进行。'};
    const stale = {...estimate,status:'needs-review'};
    const source = '甲（参考@）推门，乙说进来。', compiled = source.replace('参考@','参考@image1');
    const reference = {id:'image-fixture',name:'甲',kind:'image'};
    const rows = [1,2,3].map(number=>({id:`shot-${number}`,label:`1-1-${number}`,content:source,durationEstimate:estimate,durationEstimatedAt:'2026-11-26T02:00:00Z'}));
    const savedShots = rows.map(row=>({...row,sourcePromptId:row.id,sourceContent:source,content:compiled,durationEstimate:stale,
      durationEstimatedAt:'2026-11-25T02:00:00Z',durationStatus:'needs-review',
      generationConfig:{model:'old',duration:4,references:[reference],bindingSourcePrompt:source,bindingCompiledPrompt:compiled}}));
    savedShots[2].content = '甲推开窗户，乙说先别进来。';
    const episode = {id:'ep',episodeNumber:1,title:'第1集',content:'1-1 室内\n甲推门。'};
    await pool.query('insert into collab_projects(id,name,owner_id,genre,script,episodes) values($1,$2,$3,$4,$5,$6),($7,$8,$3,$9,$5,$10)',
      [directorId,'隔离导演',owner.id,'[DIRECTOR_PROJECT]',episode.content,JSON.stringify([{...episode,prompts:rows}]),
       projectId,'隔离分镜',`[COLLAB_PROJECT][COLLAB_SOURCE:${directorId}]`,JSON.stringify([{...episode,prompts:[],storyboardPrompts:savedShots}])]);
    await pool.query("insert into collab_members(project_id,user_id,username,role) values($1,$3,'isolated','collaborator'),($2,$3,'isolated','collaborator')",[directorId,projectId,editor.id]);
    const read = user => handleAction('project-get',{projectId},user,repository);
    const patch = (user,fields) => handleAction('storyboard-patch',{projectId,...fields},user,repository);
    const first = await read(editor);
    assert.equal(first.status,200);
    const [clean,draft,edited] = first.body.episodes[0].storyboardPrompts;
    assert.equal(clean.recommendedDurationSeconds,23);
    assert.equal(clean.content,compiled);
    assert.equal(edited.durationEstimate.status,'needs-review');
    const edit = {episodeId:episode.id,shotId:clean.id,editPolicy:'direct',requireExactBase:true,
      base:{content:clean.content,generationConfig:clean.generationConfig},updates:{content:'甲推门，乙说进来。',
        generationConfig:{...clean.generationConfig,references:[],storyboardRemovedReferences:[reference]}}};
    assert.equal((await patch(outsider,edit)).status,403);
    const removed = await patch(editor,edit);
    assert.equal(removed.status,200);
    assert.equal(removed.body.episodes[0].storyboardPrompts[0].durationEstimate.status,'estimated');
    assert.equal((await patch(editor,{...edit,updates:{content:'旧编辑器覆盖'}})).status,409);
    const apply = {operation:'settings',scope:'project',revision:'recommended-fixture',durationMode:'recommended',
      excludedShotIds:[draft.id],recommendedDurations:{[clean.id]:25},supportedDurations:[15,25,30],
      settings:{profileId:'fixture',model:'new',ratio:'9:16',resolution:'1080p'}};
    const applied = await patch(editor,apply);
    assert.equal(applied.status,200);
    const reloaded = (await read(owner)).body.episodes[0];
    const report = reloaded.storyboardDefaultSettings.global.recommendedDurationReport;
    assert.deepEqual(report.applied,[{shotId:clean.id,seconds:25}]);
    assert.deepEqual(report.skipped,[draft.id]);
    assert.deepEqual(report.blocked,[{shotId:edited.id,code:'needs-review'}]);
    assert.deepEqual(reloaded.storyboardPrompts[1],draft);
    assert.equal(reloaded.storyboardPrompts[0].generationConfig.duration,25);
    assert.equal(reloaded.storyboardPrompts[0].generationConfig.model,'new');
    assert.equal(reloaded.storyboardPrompts[0].generationConfig.resolution,'1080p');
    console.log(JSON.stringify({directorSeconds:23,appliedSeconds:25,materialEditPreservedEstimate:true,
      unsavedShotPreserved:true,realEditBlocked:true,permissionAndStaleWritesRejected:true,paidRequests:0}));
  } finally {
    await pool.end();
  }
}

verify().catch(error=>{console.error(error);process.exitCode=1;});

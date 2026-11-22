const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {createRepository}=require('../src/postgres-repository.cjs');
const {createCosSigner}=require('../src/cos.cjs');
const {handleAction}=require('../src/collab.cjs');
const {handleMediaAction}=require('../src/media.cjs');
const {emailCodeValid,hashEmailCode}=require('../src/email-code.cjs');

async function main() {
  assert.match(process.env.PGDATABASE||'',/^wave195_(?:schema|upgrade)$/);
  assert.match(process.env.PGHOST||'',/^\/tmp\/xingzhou-195-postgres-/);
  const pool=new Pool({options:'-c lock_timeout=700ms'});
  const repo=createRepository('',{pool});
  const signer=createCosSigner({secretId:'fixture-id',secretKey:'fixture-key',bucket:'fixture-bucket',region:'ap-guangzhou'});
  const makeUser=async label=>{
    const username=label+'_'+crypto.randomBytes(5).toString('hex');
    return repo.createUser({username,email:username+'@example.test',displayName:label,passwordHash:'fixture',roles:['creator'],isAdmin:false,isProducer:false});
  };
  const owner=await makeUser('owner');
  const collaborator=await makeUser('collaborator');
  const artist=await makeUser('artist');
  const project=await repo.createProject({ownerId:owner.id,ownerName:owner.username,name:'Fixture',episodes:[{title:'第1集'}]});
  const other=await repo.createProject({ownerId:artist.id,ownerName:artist.username,name:'Other'});
  const key=kind=>`projects/${project.id}/${kind}/${crypto.randomUUID()}.${kind==='audio'?'wav':'png'}`;
  const media=(action,payload,user=owner)=>handleMediaAction(action,{projectId:project.id,...payload},user,repo,signer);
  const collab=(action,payload,user=owner)=>handleAction(action,{projectId:project.id,...payload},user,repo,signer);
  try {
    await repo.addMember(project.id,{username:collaborator.username,role:'collaborator'},owner.id);
    await repo.addMember(project.id,{username:artist.username,role:'artist'},owner.id);
    const summaries=(await handleAction('project-list',{summary:true},collaborator,repo)).body;
    assert.deepEqual(summaries.map(row=>[row.id,row.episodeCount,row.myRole]),[[project.id,1,'collaborator']]);
    assert.equal(Object.hasOwn(summaries[0],'episodes'),false);
    const held=await pool.connect();
    try {
      await held.query('begin');
      await held.query('select id from collab_projects where id=$1 for update',[project.id]);
      assert.equal((await collab('project-get',{},collaborator)).status,200);
    } finally {await held.query('rollback');held.release();}

    const asset=(await collab('asset-create',{name:'角色'})).body;
    const image=key('image');
    assert.equal((await collab('asset-image-record',{assetId:asset.id,objectKey:image},collaborator)).status,403);
    assert.equal((await collab('asset-image-record',{assetId:asset.id,objectKey:'projects/'+other.id+'/image/other.png'},artist)).status,400);
    const art=(await collab('asset-image-record',{assetId:asset.id,objectKey:image},artist)).body;
    assert.match(art.url,/q-signature=/);
    assert.equal((await media('media-delete',{mediaId:art.id},owner)).status,404);
    const audioKey=key('audio');
    const audio=(await media('media-record',{objectKey:audioKey,kind:'audio',note:'参考素材 1-1'},collaborator)).body;
    assert.equal((await collab('asset-image-delete',{imageId:audio.id},artist)).status,403);
    assert.equal((await media('media-list',{},artist)).body.some(row=>row.id===audio.id),true);
    await pool.query('update collab_projects set analysis_progress=$2 where id=$1',[project.id,{voiceProfiles:{lead:{objectKey:audioKey}}}]);
    assert.equal((await media('media-delete',{mediaId:audio.id},collaborator)).status,404);
    await pool.query('update collab_projects set analysis_progress=$2 where id=$1',[project.id,{}]);
    assert.equal((await media('media-delete',{mediaId:audio.id,purpose:'reference-upload'},collaborator)).status,200);
    assert.equal((await collab('asset-image-delete',{imageId:art.id},artist)).status,200);
    assert.equal((await collab('stats-get',{},collaborator)).status,403);
    assert.ok(Array.isArray((await collab('stats-get')).body.media));
    const chat=await collab('message-send',{content:'fixture',imageUrl:'https://'+signer.host+'/'+image},collaborator);
    assert.equal(chat.status,200);assert.match(chat.body.image_url,/q-signature=/);
    assert.match((await collab('messages-list',{},artist)).body[0].image_url,/q-signature=/);
    await repo.setProjectLocked(project.id,true,owner.id);
    assert.equal((await media('media-upload-url',{kind:'image'},artist)).status,423);
    await repo.setProjectLocked(project.id,false,owner.id);
    await repo.softDeleteProject(project.id,owner.id);
    assert.equal((await media('media-record',{kind:'image',objectKey:key('image')},artist)).status,410);

    const [director,directorRetry]=await Promise.all(Array.from({length:2},()=>repo.createDirectorProject({name:'Fixture director',directorProjectId:'fixture-'+owner.id},owner.id,owner.username)));
    assert.equal(director.id,directorRetry.id);
    assert.equal((await handleAction('director-project-list',{associations:[{projectId:director.analysis_output,collaborationProjectId:project.id}]},owner,repo)).body.associations[0].status,'protected');
    assert.equal((await handleAction('director-project-list',{},owner,repo)).body[0].id,director.id);
    const invite=await repo.createInvite({code:'FIXTURE',digest:crypto.randomUUID(),kind:'role',role:'creator',maxUses:1});
    const digest=(await pool.query('select digest from invites where id=$1',[invite.id])).rows[0].digest;
    const code='12345678';
    const registrations=await Promise.all(Array.from({length:2},async ()=>{
      const username='attempt_'+crypto.randomBytes(4).toString('hex');
      const email=username+'@example.test';
      await repo.saveEmailCode(email,hashEmailCode(code),new Date(Date.now()+60000));
      assert.equal(emailCodeValid(await repo.findEmailCode(email),code),true);
      return repo.registerWithInvite({username,email,displayName:username,emailCode:code,digest,token:crypto.randomUUID(),passwordHash:'fixture'})
        .then(()=>200,error=>error.status);
    }));
    assert.deepEqual(registrations.sort(),[200,400]);
    const order=await repo.licenseCreateOrder('fixture',owner.id);
    const card=await repo.licenseIssue({digest:crypto.randomUUID(),hint:'fixture',note:'fixture',orderId:order.id,monthNumber:1},owner.id);
    const cardDigest=(await pool.query('select digest from software_license_cards where id=$1',[card.id])).rows[0].digest;
    const device=crypto.randomUUID();
    const license=(await repo.licensePrepare(cardDigest,device)).activationToken;
    await repo.licenseRedeem(license,device,owner.id);
    assert.equal((await repo.licenseState(owner.id,device)).knownDevice,true);
    await repo.deleteUser(owner.id);
    const historical=(await pool.query('select redeemed_by,redeemed_at from software_license_cards where id=$1',[card.id])).rows[0];
    assert.equal(historical.redeemed_by,null);assert.ok(historical.redeemed_at);
    assert.equal((await pool.query('select user_id from software_license_orders where id=$1',[order.id])).rows[0].user_id,null);
    await assert.rejects(repo.licensePrepare(cardDigest,device),error=>error.status===403);
    assert.equal(await repo.licensePending(license,device),false);
    console.log('PASS clean PG application, access, signing, lock-free read, concurrent invite, and deleted-account redemption history');
  } finally {await repo.close();}
}

main().catch(error=>{console.error(error);process.exitCode=1;});

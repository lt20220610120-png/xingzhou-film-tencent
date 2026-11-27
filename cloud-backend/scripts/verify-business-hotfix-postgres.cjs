const assert=require('node:assert/strict');
const {randomUUID,generateKeyPairSync,sign}=require('node:crypto');
const {Pool}=require('pg');
const {createRepository}=require('../src/postgres-repository.cjs');
const {createServer}=require('../src/server.cjs');
const {createCosSigner}=require('../src/cos.cjs');
const {signature}=require('../src/art-review-repository.cjs');
const {hashPassword}=require('../src/password.cjs');
const {proofMessage}=require('../shared/software-license.cjs');

async function verify() {
  assert.match(process.env.PGDATABASE||'',/^xz_business_hotfix(?:_upgrade)?$/);
  assert.match(process.env.PGHOST||'',/^\/tmp\/xz-business-hotfix-[\w.\/]+$/);
  const pool=new Pool({options:'-c lock_timeout=1500ms'});
  const repo=createRepository('',{pool});
  const signer=createCosSigner({secretId:'fixture',secretKey:'fixture',bucket:'fixture',region:'ap-guangzhou'});
  const password='fixture-password';
  const passwordHash=hashPassword(password);
  const user=(label,roles=['director'])=>repo.createUser({username:label,email:label+'@example.test',displayName:label,passwordHash,roles,activeRole:'director',isAdmin:false,isProducer:false});
  const server=createServer({API_SECRET:'fixture',DATABASE_URL:'postgres://fixture'},{
    repository:repo,cosSigner:null,mailer:null,protectedSkills:()=>assert.fail('expired authorization invoked a mutating skill operation'),
    logger:{error(){}},
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const post=async(action,payload={},token='')=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
      body:JSON.stringify({action,...payload}),
    });
    return {status:response.status,body:await response.json()};
  };
  const device=()=>{
    const {publicKey,privateKey}=generateKeyPairSync('ed25519');
    return {publicKey:publicKey.export({type:'spki',format:'pem'}),privateKey};
  };
  const authenticated=async(device,action,input,token='')=>{
    const challenge=await post('license-challenge',{publicKey:device.publicKey});
    assert.equal(challenge.status,200);
    const {nonce}=challenge.body;
    const payload={...input,_licenseVersion:'2.8.211'};
    const signature=sign(null,proofMessage({action,payload,token,nonce}),device.privateKey).toString('base64');
    return post(action,{...payload,_licenseProof:{nonce,signature,publicKey:device.publicKey}},token);
  };

  try {
    const owner=await user('owner'), colleague=await user('colleague');
    const outsider=await user('outsider'), disabled=await user('disabled'), filmUnavailable=await user('film_unavailable',[]);
    await repo.setBanned(disabled.id,true);
    await pool.query("insert into software_license_exemptions(user_id,reason) values($1,'fixture'),($2,'fixture')",[owner.id,outsider.id]);
    const ownerLogin=await post('login',{username:owner.username,password});
    assert.equal(ownerLogin.status,200);
    const token=ownerLogin.body.token;
    const call=(action,input)=>post(action,input,token);

    const director=await repo.createDirectorProject({name:'Director',directorProjectId:'owner-local'},owner.id,owner.username);
    const project=await repo.createProject({name:'Cloud',ownerId:owner.id,ownerName:owner.username,
      episodes:[{title:'第2集',content:'2-1 Room',episodeNumber:2},{title:'第5集',content:'5-1 Room',episodeNumber:5}],
    });
    const checkAssociation=(u,collaborationProjectId,projectId='owner-local')=>
      repo.directorAssociationStates([{projectId,collaborationProjectId}],u.id).then(([item])=>item.status);
    assert.equal(await checkAssociation(owner,project.id),'protected');
    assert.equal(await checkAssociation(outsider,project.id),'released');
    assert.equal(await checkAssociation(outsider,randomUUID()),'released');
    await repo.softDeleteProject(project.id,owner.id);
    assert.equal(await checkAssociation(outsider,project.id),'released');
    await repo.restoreProject(project.id,owner.id);

    const invite=(user,role='artist')=>call('director-member-add',{directorProjectId:director.id,username:user.username,role});
    assert.equal((await invite(owner)).status,409);
    assert.equal((await invite(disabled)).status,404);
    assert.equal((await invite(filmUnavailable)).status,404);
    assert.equal((await invite(colleague,'producer')).status,200);
    assert.equal((await invite(colleague)).status,409);
    assert.equal((await repo.findMembership(director.id,colleague.id)).role,'producer');
    await repo.setDirectorProjectLocked(director.id,true,owner.id);
    assert.equal((await invite(outsider)).status,423);
    assert.equal((await call('director-member-remove',{directorProjectId:director.id,userId:outsider.id})).status,423);

    await pool.query("insert into software_licenses(user_id,expires_at) values($1,'2099-01-01'),($2,'2099-01-01')",[colleague.id,filmUnavailable.id]);
    const licensedDevice=device();
    const before=await repo.createLicensedSession(colleague.id,randomUUID(),'stale',licensedDevice.publicKey);
    assert.equal(before,null);
    assert.equal((await repo.licenseState(colleague.id,licensedDevice.publicKey)).grant.device_key,null);
    await pool.query(`create function reject_fixture_session() returns trigger language plpgsql as
      $$begin raise exception 'simulated session insert failure';end$$`);
    await pool.query('create trigger fixture_session_failure before insert on app_sessions for each row execute function reject_fixture_session()');
    try {
      const failed=await authenticated(licensedDevice,'login',{username:colleague.username,password});
      assert.equal(failed.status,503);
      const grant=await repo.licenseState(colleague.id,licensedDevice.publicKey);
      assert.equal(grant.grant.device_key,null);
      assert.equal(grant.knownDevice,false);
    } finally { await pool.query('drop trigger fixture_session_failure on app_sessions'); }
    const login=await authenticated(licensedDevice,'login',{username:colleague.username,password});
    assert.equal(login.status,200);
    assert.equal(login.body.license.status,'active');
    const occupied=await authenticated(licensedDevice,'login',{username:filmUnavailable.username,password});
    assert.equal(occupied.status,403);
    assert.match(occupied.body.error,/此电脑已绑定其他账号/);
    assert.equal((await repo.licenseState(filmUnavailable.id,licensedDevice.publicKey)).grant.device_key,null);
    await pool.query("update software_licenses set expires_at='2000-01-01',previous_device_key=device_key,device_key=null where user_id=$1",[colleague.id]);
    const expired=await authenticated(licensedDevice,'login',{username:colleague.username,password});
    assert.equal(expired.status,200);
    assert.equal(expired.body.license.allowed,false);
    assert.equal((await repo.licenseState(colleague.id,licensedDevice.publicKey)).grant.device_key,null);
    const settled=(action,input)=>authenticated(licensedDevice,action,input,expired.body.token);
    assert.equal((await settled('director-members-list',{directorProjectId:director.id})).status,200);
    for(const action of ['profile-update','generation-reference-cleanup','generation-reference-release','protected-skill-cancel']) {
      assert.equal((await settled(action,{})).status,403);
    }

    const assets=(input)=>call('asset-create',{projectId:project.id,...input});
    assert.equal((await call('project-restore',{})).status,400);
    assert.equal((await assets({name:'Invalid',category:'vehicle'})).status,400);
    assert.equal((await assets({name:'Invalid',firstEpisode:0})).status,400);
    const manual=await assets({name:'Manual'});assert.equal(manual.status,200);
    assert.equal((await assets({name:'Manual'})).status,409);
    const other=await assets({name:'Other'});assert.equal(other.status,200);
    assert.equal((await call('asset-update',{projectId:project.id,assetId:other.body.id,updates:{name:'Manual'}})).status,409);

    const artName='【造型】';
    const publish=async(number,base=0,items=[{id:'costume',name:artName,category:'character',description:'造型',ready:true}])=>{
      const episode=project.episodes.find(e=>e.episodeNumber===number);
      const scene={id:number+'-1',source:episode.content,items};
      scene.approval={signature:signature(scene)};
      const data={schema:1,episodeNumber:number,sourceContent:episode.content,scenes:[scene],unassigned:[]};
      const saved=await repo.saveArtReview(project.id,{episodeNumber:number,baseVersion:base,writeId:randomUUID(),data},owner.id);
      return repo.publishArtReview(project.id,{episodeNumber:number,baseVersion:saved.version,writeId:randomUUID(),sceneIds:[scene.id]},owner.id);
    };
    const readArt=()=>repo.listAssets(project.id,owner.id).then(rows=>rows.find(row=>row.name===artName));
    await publish(5);
    const late=await readArt();
    assert.equal(late.first_episode,5);
    const earlyPublication=await publish(2);
    const early=await readArt();
    assert.equal(early.id,late.id);
    assert.equal(early.first_episode,2);
    assert.ok(early.updated_at>=late.updated_at);
    await publish(2,earlyPublication.version,[]);
    assert.equal((await readArt()).first_episode,5);
    await repo.updateProjectFields(project.id,{episodes:[project.episodes[0]]},owner.id);
    assert.equal((await readArt()).first_episode,null);

    const objectKey='projects/'+project.id+'/image/'+randomUUID()+'.png';
    const image=await repo.recordAssetImage(project.id,{assetId:manual.body.id,objectKey},owner.id);
    await repo.sendMessage(project.id,{imageUrl:objectKey},owner.id);
    await repo.deleteAssetImage(project.id,{imageId:image.id},owner.id);
    const due=()=>pool.query("update collab_asset_image_cleanup set next_attempt_at=now()-interval '1 minute'");
    let removed=0;
    const remove=async(url,options)=>{
      assert.equal(new URL(url).pathname,'/'+objectKey);
      assert.equal(options.method,'DELETE');
      removed++;
      return new Response(null,{status:removed===1?503:204});
    };
    await due();
    await repo.cleanupAssetImages(signer,remove);
    assert.equal(removed,0);
    await pool.query('delete from collab_messages where project_id=$1',[project.id]);
    await due();
    await repo.cleanupAssetImages(signer,remove);
    assert.equal(removed,1);
    assert.equal((await pool.query('select attempts from collab_asset_image_cleanup')).rows[0].attempts,1);
    await due();
    await repo.cleanupAssetImages(signer,remove);
    assert.equal(removed,2);
    assert.equal((await pool.query('select * from collab_asset_image_cleanup')).rowCount,0);

    const projectId=randomUUID(),requestId=randomUUID();
    const invitation={username:colleague.username,role:'artist'};
    const pending={projectId,requestId,invitation};
    const reservation=await repo.prepareLocalProjectShare(pending,owner);
    await repo.setBanned(colleague.id,true);
    const submission={...pending,revision:reservation.revision,project:{name:'Draft',episodes:[]}};
    assert.deepEqual(await repo.recoverLocalProjectShare(submission,owner),{released:true,revision:null});
    await assert.rejects(repo.shareLocalProject(submission,owner),{status:409});
    const invitation2={username:outsider.username,role:'artist'};
    const pending2={projectId,requestId:randomUUID(),invitation:invitation2};
    const next=await repo.prepareLocalProjectShare(pending2,owner);
    const finished=await repo.shareLocalProject({...pending2,revision:next.revision,project:{name:'Draft',episodes:[]},assets:[],media:[]},owner);
    await repo.removeDirectorMember(projectId,{userId:outsider.id},owner.id,'collab');
    await repo.setBanned(outsider.id,true);
    const receipt=await repo.localProjectShareReceipt(pending2,owner);
    assert.equal(receipt.completed.project.id,finished.project.id);
    assert.equal(receipt.completed.member.removed,true);
    assert.equal((await repo.recoverLocalProjectShare({...pending2,revision:next.revision},owner)).completed.project.id,finished.project.id);

    console.log('BUSINESS_HOTFIX_POSTGRES_PASS: scoped associations, transactional authorization, read-only settlement, business errors, asset episodes, durable COS retry, share recovery.');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await pool.end();
  }
}

verify().catch(error=>{console.error(error.stack);process.exitCode=1;});

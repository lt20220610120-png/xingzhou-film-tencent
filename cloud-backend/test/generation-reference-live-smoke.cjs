// Runs on the existing server with its local environment; never prints secrets,
// session tokens or signed URLs. Creates and removes one synthetic PNG only.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const live='/opt/xingzhou-cloud-backend',env={};for(const line of fs.readFileSync(live+'/.env','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
 const signer=require(live+'/src/cos.cjs').createCosSigner(env);assert.ok(signer,'COS configured');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-niney-reference-smoke-'));let now=Date.now();const store=require(live+'/src/generation-references.cjs').createGenerationReferenceStore({directory:root,signer,now:()=>now});let issued=false;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 try{
  const signed=await store.issue({filename:'synthetic.png',kind:'image',mime:'image/png',size:png.length},{id:'release-niney-smoke-'+Date.now()});issued=true;
  const put=await fetch(signed.url,{method:'PUT',headers:{Authorization:signed.authorization,'Content-Type':signed.contentType,'Content-Length':String(png.length)},body:png,redirect:'error'});await put.body?.cancel();assert.ok(put.ok,'COS signed PUT status '+put.status);
  const get=await fetch(signed.downloadUrl,{redirect:'error'});assert.equal(get.status,200);assert.deepEqual(Buffer.from(await get.arrayBuffer()),png);
  assert.ok(signed.expiresAt-Date.now()>47*3600*1000);
  console.log(JSON.stringify({syntheticSignedUpload:true,anonymousSignedDownload:true,bytes:png.length,referenceLifetimeHours:48,noVideoGeneration:true}));
 }finally{if(issued){now+=49*3600*1000;const result=await store.prune();assert.equal(result.removed,1,'synthetic cleanup');console.log(JSON.stringify({syntheticObjectDeleted:true}));}fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

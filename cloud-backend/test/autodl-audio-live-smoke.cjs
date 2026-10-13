const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const live='/opt/xingzhou-cloud-backend',env={};for(const line of fs.readFileSync(live+'/.env','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
 const signer=require(live+'/src/cos.cjs').createCosSigner(env);assert.ok(signer);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-autodl-audio-'));let now=Date.now(),issued=0;const store=require(live+'/src/generation-references.cjs').createGenerationReferenceStore({directory:root,signer,now:()=>now});
 try{
  for(const [filename,mime,bytes] of [['synthetic.flac','audio/flac',Buffer.from('fLaC-synthetic-storage-probe')],['synthetic.mp4','audio/mp4',Buffer.from('mp4-synthetic-storage-probe')]]){
   const signed=await store.issue({filename,kind:'audio',mime,size:bytes.length},{id:'release-autodl-smoke'});issued++;
   const put=await fetch(signed.url,{method:'PUT',headers:{Authorization:signed.authorization,'Content-Type':mime,'Content-Length':String(bytes.length)},body:bytes,redirect:'error'});await put.body?.cancel();assert.ok(put.ok,'COS PUT '+put.status);
   const get=await fetch(signed.downloadUrl);assert.equal(get.status,200);assert.equal(get.headers.get('content-type'),mime);assert.deepEqual(Buffer.from(await get.arrayBuffer()),bytes);
  }
  console.log(JSON.stringify({FLACandMP4AudioUpload:true,signedAnonymousReads:true,noAutoDLPaidRequest:true}));
 }finally{now+=49*3600*1000;assert.equal((await store.prune()).removed,issued);fs.rmSync(root,{recursive:true,force:true});console.log(JSON.stringify({syntheticObjectsRemoved:issued}));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

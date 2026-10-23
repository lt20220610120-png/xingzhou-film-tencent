const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {validateManifest}=require('../electron/update-trust.cjs');
const fetchUpdate=require('../electron/update-transport.cjs').createUpdateFetch();
(async()=>{
 const version='2.8.66',root=path.resolve(__dirname,'..'),local=validateManifest(JSON.parse(fs.readFileSync(path.join(root,'release',version,'latest.json'),'utf8')));
 assert.equal(local.version,version);
 const installer=path.join(root,'release',version,`Xingzhou-Film-Tencent-Setup-${version}.exe`),bytes=fs.readFileSync(installer);
 assert.equal(bytes.length,local.size);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),local.sha256);
 const manifests=[];
 for(const repo of ['xingzhou-film-updates','xingzhou-film-tencent']){
  const response=await fetch(`https://raw.githubusercontent.com/lt20220610120-png/${repo}/main/latest.json?verified=${Date.now()}`,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const manifest=validateManifest(await response.json());assert.deepEqual(manifest,local);manifests.push(repo);
 }
 const response=await fetch('https://api.github.com/repos/lt20220610120-png/xingzhou-film-updates/releases/tags/v'+version,{headers:{'User-Agent':'xingzhou-release-verification'},signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const release=await response.json(),asset=release.assets.find(a=>a.browser_download_url===local.installerUrl);assert(asset);assert.equal(asset.size,local.size);assert.equal(asset.digest,'sha256:'+local.sha256);
 const head=await fetch(local.installerUrl,{method:'HEAD',signal:AbortSignal.timeout(30000)});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),local.size);
 const mirror=await fetchUpdate('https://106.55.41.128/api/updates/latest.json',{signal:AbortSignal.timeout(30000)});assert.equal(mirror.status,200);assert.deepEqual(validateManifest(await mirror.json()),local);
 const range=await fetchUpdate(`https://106.55.41.128/api/updates/Xingzhou-Film-Tencent-Setup-${version}.exe`,{headers:{Range:'bytes=0-65535'},signal:AbortSignal.timeout(30000)});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 0-65535/${local.size}`);const prefix=Buffer.from(await range.arrayBuffer());assert(prefix.equals(bytes.subarray(0,65536)));
 const report={version,passed:true,size:local.size,sha256:local.sha256,manifests,githubDigest:true,downloadHead:head.status,mirrorPinnedTls:true,mirrorRange:range.status,installerUrl:local.installerUrl,checkedAt:new Date().toISOString()};fs.writeFileSync(path.join(root,'output/license-release-verified.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exit(1)});

const test=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {validateManifest,signingBytes,TRUSTED_MANIFEST_URL,RELEASE_REPO}=require('./update-trust.cjs');
const {fetchUpdateManifest}=require('./update-manifest.cjs');
const {downloadInstaller,verifyInstaller,trustedDownload}=require('./update-service.cjs');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const bytes=Buffer.alloc(128,7);bytes.write('MZ');
const manifest={version:'9.8.7',installerUrl:`https://github.com/${RELEASE_REPO}/releases/download/v9.8.7/Xingzhou-Film-Tencent-Setup-9.8.7.exe`,notes:'安全验证',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,publishedAt:new Date().toISOString()};
manifest.signature={algorithm:'Ed25519',value:crypto.sign(null,signingBytes(manifest),privateKey).toString('base64')};
test('签名清单验证固定发布者，并拒绝摘要、地址、版本或说明被改动',()=>{
 assert.equal(validateManifest(manifest,publicKey).version,'9.8.7');
 for(const patch of [{sha256:'0'.repeat(64)},{notes:'恶意说明'},{size:129},{version:'9.8.8'},{installerUrl:'https://attacker.invalid/setup.exe'},{signature:null}])assert.throws(()=>validateManifest({...manifest,...patch},publicKey));
 assert.throws(()=>validateManifest(manifest,crypto.generateKeyPairSync('ed25519').publicKey),/签名无效/);
});
test('真实清单入口拒绝其他来源和未签名清单',async()=>{
 let called=false;
 await assert.rejects(()=>fetchUpdateManifest('https://attacker.invalid/latest.json',{fetchFn:async()=>{called=true}}),/官方更新/);assert.equal(called,false);
 await assert.rejects(()=>fetchUpdateManifest(TRUSTED_MANIFEST_URL,{fetchFn:async()=>({ok:true,json:async()=>({...manifest,signature:null})}),retries:1}),/暂时无法连接/);
});
test('下载验证实际字节，失败不留下可安装文件，安装前拒绝下载后篡改',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-update-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const good=await downloadInstaller({...manifest,url:manifest.installerUrl,destinationDir:dir,fetchImpl:async()=>new Response(bytes)});
 await verifyInstaller(good,manifest);
 fs.writeFileSync(good,Buffer.alloc(128));await assert.rejects(()=>verifyInstaller(good,manifest),/完整性/);
 for(const data of [Buffer.alloc(128),bytes.subarray(0,100),Buffer.alloc(200)]){
  await assert.rejects(()=>downloadInstaller({...manifest,version:'failed',url:manifest.installerUrl,destinationDir:dir,fetchImpl:async()=>new Response(data)}));
  assert.equal(fs.existsSync(path.join(dir,'Xingzhou-Film-Setup-failed.exe')),false);
  assert.equal(fs.existsSync(path.join(dir,'Xingzhou-Film-Setup-failed.exe.download')),false);
  assert.equal(fs.readdirSync(dir).some(name=>name.endsWith('.download')),false);
 }
});
test('只允许 GitHub 发布资产跳转，拒绝外站、HTTP 和无限重定向',async()=>{
 for(const location of ['https://evil.invalid/setup.exe','http://github.com/setup.exe','https://github.com.evil.invalid/setup.exe','https://user:pass@github.com/setup.exe']){
  let calls=0;await assert.rejects(()=>trustedDownload(manifest.installerUrl,async()=>{calls++;return new Response(null,{status:302,headers:{location}})}));assert.equal(calls,1);
 }
 const response=await trustedDownload(manifest.installerUrl,async url=>url.startsWith('https://github.com/')?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/asset'}}):new Response(bytes));assert.equal(response.status,200);
 await assert.rejects(()=>trustedDownload(manifest.installerUrl,async()=>new Response(null,{status:302,headers:{location:manifest.installerUrl}})),/次数过多/);
});

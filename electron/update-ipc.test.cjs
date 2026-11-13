const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {signingBytes,validateManifest}=require('./update-trust.cjs');

test('update IPC uses the version shown by check, even if the feed fails on click',async()=>{
 const {registerUpdateHandlers}=require('./update-ipc.cjs');
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const version='2.8.155',installerUrl='https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.155/Xingzhou-Film-Tencent-Setup-2.8.155.exe';
 const payload={version,installerUrl,notes:'Release',size:64,sha256:'a'.repeat(64),publishedAt:new Date().toISOString()};
 payload.signature={algorithm:'Ed25519',value:crypto.sign(null,signingBytes(payload),privateKey).toString('base64')};
 const handlers={},events=[];
 let offline=false,checks=0,failed=true;
 registerUpdateHandlers({ipcMain:{handle:(name,handler)=>handlers[name]=handler},getVersion:()=> '2.8.154',
  checkManifest:async()=>{checks++;if(offline)throw Error('offline');return {manifest:payload,source:'official'};},
  verifyManifest:m=>validateManifest(m,publicKey),
  download:async(manifest,progress)=>{events.push(manifest.installerUrl);if(failed)throw Error('interrupted');progress({percent:100});return 'installer.exe';},
  install:async(file,manifest)=>{events.push([file,manifest.sha256]);return true;}});
 const event={sender:{isDestroyed:()=>false,send:(channel,p)=>events.push([channel,p.percent])}};
 await assert.rejects(handlers['download-update'](event,{version}),/重新检查/);
 await assert.rejects(handlers['install-update'](),/尚未下载/);
 assert.equal((await handlers['check-update']()).manifest.version,version);
 offline=true;
 await assert.rejects(handlers['download-update'](event,{version:'2.8.156'}),/重新检查/);
 await assert.rejects(handlers['download-update'](event,{version}),/interrupted/);
 await assert.rejects(handlers['install-update'](),/尚未下载/);
 failed=false;
 assert.deepEqual(await handlers['download-update'](event,{version,url:'https://untrusted.invalid/test.exe'}),{filePath:'installer.exe'});
 assert.equal(await handlers['install-update'](),true);
 assert.deepEqual(events,[installerUrl,installerUrl,['update-progress',100],['installer.exe',payload.sha256]]);
 assert.equal(checks,1);
});

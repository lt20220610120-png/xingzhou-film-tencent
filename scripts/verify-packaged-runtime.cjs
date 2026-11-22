const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const os = require('node:os');
exports.verify = async (exe,version,dependencies={}) => {
  const asar = require('@electron/asar');
  const archive = path.join(path.dirname(exe),'resources/app.asar');
  const bundled = JSON.parse(asar.extractFile(archive,'package.json').toString());
  assert.equal(bundled.version,version);
  for(const name of ['mammoth','yjs','p-queue','jszip']) {
    const manifest=JSON.parse(asar.extractFile(archive,path.join('node_modules',name,'package.json')).toString());
    assert.equal(bundled.dependencies[name],manifest.version,`Direct runtime dependency missing: ${name}`);
  }
  const entries=asar.listPackage(archive);
  assert.deepEqual(fs.readdirSync(path.join(path.dirname(exe),'locales')).sort(),['en-US.pak','zh-CN.pak','zh-TW.pak']);
  assert.ok(!entries.some(name=>/(?:^|[\\/])(?:coverage|tests?|__tests__|fixtures|__fixtures__|\.nyc_output|\.playwright-mcp)(?:$|[\\/])|\.(?:map|pdb|log)$/i.test(name)),'Development-only files must stay out of the installer');
  const requiredProjectModules=['storyboard-merge','storyboard-settings','storyboard-identity','prompt-duration','collab-episodes','director-source','episode-identity-repair','image-composition','reference-upload-delete','art-review-repository','analysis-publication','prompt-binding'];
  for(const name of requiredProjectModules){
    const relative=path.join('cloud-backend','src',name+'.cjs');
    assert.ok(entries.some(entry=>entry.replace(/^[\\/]/,'').replaceAll('\\','/')===relative.replaceAll('\\','/')),`Packaged project module missing: ${name}`);
    assert.ok(asar.extractFile(archive,relative).length>0,`Packaged project module is empty: ${name}`);
  }
  const extension=JSON.parse(asar.extractFile(archive,path.join('browser-extension','like-connector','manifest.json')));assert.equal(extension.manifest_version,3);for(const name of ['background.js','content.js','main.js','popup.html','popup.js'])assert(asar.extractFile(archive,path.join('browser-extension','like-connector',name)).length>0);assert(!extension.permissions.some(p=>['cookies','history','webRequest','nativeMessaging'].includes(p)));
  assert.ok(!entries.some(name=>/(?:^|[\\/])(?:xingzhou-data\.json|director-projects\.json|local-provider-migration\.json|protected-skill-vault-2850)(?:$|[\\/])/.test(name)),'Private workspace data must not ship');
  const vault=path.resolve(__dirname,'../output/protected-skill-vault-2850');
  if(fs.existsSync(vault)){
    const needles=fs.readdirSync(vault).filter(n=>n.endsWith('.json')).flatMap(n=>{const source=JSON.parse(fs.readFileSync(path.join(vault,n),'utf8'));return [source.content,...(source.files||[]).map(f=>f.content)].filter(s=>typeof s==='string'&&s.length>300).map(s=>s.slice(0,300));});
    for(const entry of entries.filter(n=>/\.(?:js|cjs|mjs|json|html|md|txt)$/.test(n))){const relative=entry.replace(/^[/\\]/,'');if(asar.statFile(archive,relative).files)continue;const data=asar.extractFile(archive,relative).toString();assert.ok(!needles.some(s=>data.includes(s)),`Private Skill body found in ${entry}`);}
  }
  const retiredModules=new Set(['electron/access-service.cjs','core/accessControl.cjs','electron/cloud-media-service.cjs','electron/doubao-work.cjs','electron/local-trial-features.cjs']);
  assert.ok(!entries.some(name=>retiredModules.has(name.replaceAll('\\','/').replace(/^\//,''))),'Retired desktop modules must not ship');
  const {getCurrentFuseWire,FuseV1Options}=require('@electron/fuses');
  const fuses=await getCurrentFuseWire(exe);
  for(const option of [FuseV1Options.EnableEmbeddedAsarIntegrityValidation,FuseV1Options.OnlyLoadAppFromAsar])assert.equal(fuses[option],49,'ASAR integrity fuse must be enabled');
  for(const option of [FuseV1Options.RunAsNode,FuseV1Options.EnableNodeOptionsEnvironmentVariable,FuseV1Options.EnableNodeCliInspectArguments])assert.equal(fuses[option],48,'Debug/runtime injection fuse must be disabled');
  for (const [name,expected] of Object.entries(dependencies)) {
    const manifest = JSON.parse(asar.extractFile(archive,path.join('node_modules',...name.split('/'),'package.json')).toString());
    assert.equal(manifest.version,expected,`Missing or incorrect runtime package: ${name}`);
  }
  const temp=fs.realpathSync(os.tmpdir());
  const testRoot = fs.mkdtempSync(path.join(temp,`xz-packaged-smoke-${version}-`));
  fs.copyFileSync(path.resolve(__dirname,'../electron/fixtures/preview-seek.mp4'),path.join(testRoot,'preview-seek.mp4'));
  const env = {...process.env,XINGZHOU_SMOKE_TEST_ROOT:testRoot}; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe,[],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const log = fs.createWriteStream(path.join(testRoot,'process.log')); child.stdout.pipe(log,{end:false}); child.stderr.pipe(log,{end:false});
  const code = await new Promise((resolve,reject)=>{
    const timer = setTimeout(()=>{child.kill();reject(new Error('Packaged app verification timed out'));},35000);
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('close',code=>{clearTimeout(timer);resolve(code)});
  });
  await new Promise(resolve=>log.end(resolve));
  const report = JSON.parse(fs.readFileSync(path.join(testRoot,'report.json'),'utf8'));
  assert.equal(code,0,JSON.stringify(report));
  assert.equal(report.success,true,JSON.stringify(report));
  assert.equal(report.version,version);
  console.log(JSON.stringify({packagedRuntime:'PASS',...report}));
  if(path.dirname(fs.realpathSync(testRoot))===temp) {
    await fs.promises.rm(testRoot,{recursive:true,force:true,maxRetries:8,retryDelay:250});
  }
};
if(require.main === module) exports.verify(path.resolve(process.argv[2]),process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});

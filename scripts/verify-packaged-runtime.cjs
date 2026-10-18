const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
exports.verify = async (exe,version,dependencies={}) => {
  const asar = require('@electron/asar');
  const archive = path.join(path.dirname(exe),'resources/app.asar');
  const bundled = JSON.parse(asar.extractFile(archive,'package.json').toString());
  assert.equal(bundled.version,version);
  const entries=asar.listPackage(archive);
  assert.ok(!entries.some(name=>/(?:^|[\\/])(?:xingzhou-data\.json|director-projects\.json|local-provider-migration\.json|protected-skill-vault-2850)(?:$|[\\/])/.test(name)),'Private workspace data must not ship');
  const vault=path.resolve(__dirname,'../output/protected-skill-vault-2850');
  if(fs.existsSync(vault)){
    const needles=fs.readdirSync(vault).filter(n=>n.endsWith('.json')).flatMap(n=>{const source=JSON.parse(fs.readFileSync(path.join(vault,n),'utf8'));return [source.content,...(source.files||[]).map(f=>f.content)].filter(s=>typeof s==='string'&&s.length>300).map(s=>s.slice(0,300));});
    for(const entry of entries.filter(n=>/\.(?:js|cjs|mjs|json|html|md|txt)$/.test(n))){const relative=entry.replace(/^[/\\]/,'');if(asar.statFile(archive,relative).files)continue;const data=asar.extractFile(archive,relative).toString();assert.ok(!needles.some(s=>data.includes(s)),`Private Skill body found in ${entry}`);}
  }
  assert.ok(!entries.some(name=>/electron[\\/]access-service\.cjs$|core[\\/]accessControl\.cjs$/.test(name)),'Legacy local permission modules must not ship');
  const {getCurrentFuseWire,FuseV1Options}=require('@electron/fuses');
  const fuses=await getCurrentFuseWire(exe);
  for(const option of [FuseV1Options.EnableEmbeddedAsarIntegrityValidation,FuseV1Options.OnlyLoadAppFromAsar])assert.equal(fuses[option],49,'ASAR integrity fuse must be enabled');
  for(const option of [FuseV1Options.RunAsNode,FuseV1Options.EnableNodeOptionsEnvironmentVariable,FuseV1Options.EnableNodeCliInspectArguments])assert.equal(fuses[option],48,'Debug/runtime injection fuse must be disabled');
  for (const [name,expected] of Object.entries(dependencies)) {
    const manifest = JSON.parse(asar.extractFile(archive,path.join('node_modules',...name.split('/'),'package.json')).toString());
    assert.equal(manifest.version,expected,`Missing or incorrect runtime package: ${name}`);
  }
  const testRoot = path.resolve(__dirname,'../qa',`packaged-smoke-${version}-${Date.now()}`);
  fs.mkdirSync(testRoot,{recursive:true});
  const env = {...process.env,XINGZHOU_SMOKE_TEST_ROOT:testRoot}; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe,[],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const log = fs.createWriteStream(path.join(testRoot,'process.log')); child.stdout.pipe(log); child.stderr.pipe(log);
  const code = await new Promise((resolve,reject)=>{
    const timer = setTimeout(()=>{child.kill();reject(new Error('Packaged app verification timed out'));},35000);
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('exit',code=>{clearTimeout(timer);resolve(code)});
  });
  log.end();
  const report = JSON.parse(fs.readFileSync(path.join(testRoot,'report.json'),'utf8'));
  assert.equal(code,0,JSON.stringify(report));
  assert.equal(report.success,true,JSON.stringify(report));
  assert.equal(report.version,version);
  console.log(JSON.stringify({packagedRuntime:'PASS',report:testRoot,...report}));
};
if(require.main === module) exports.verify(path.resolve(process.argv[2]),process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});

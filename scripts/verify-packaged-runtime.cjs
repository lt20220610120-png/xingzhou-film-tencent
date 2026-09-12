const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
exports.verify = async (exe,version,dependencies={}) => {
  const asar = require('@electron/asar');
  const archive = path.join(path.dirname(exe),'resources/app.asar');
  const bundled = JSON.parse(asar.extractFile(archive,'package.json').toString());
  assert.equal(bundled.version,version);
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

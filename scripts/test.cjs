// Test source suites only; release staging contains copies of app modules.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const suites = ['core','electron','cloud-backend/test','world-simulation/test','scripts'].flatMap(folder=>
  fs.readdirSync(path.join(root,folder)).filter(name=>/\.test\.(?:cjs|js)$/.test(name)).map(name=>path.join(folder,name)));
const result = spawnSync(process.execPath,['--test',...suites],{cwd:root,stdio:'inherit',windowsHide:true});
if(result.error) console.error(result.error);
if(result.status!==0) process.exit(result.status ?? 1);
const python=process.platform==='win32'?'python':'python3';
const scriptTests=spawnSync(python,['-m','unittest','discover','-s','scripts','-p','test_*.py'],{cwd:root,stdio:'inherit',windowsHide:true});
if(scriptTests.error) console.error(scriptTests.error);
process.exitCode = scriptTests.status ?? 1;

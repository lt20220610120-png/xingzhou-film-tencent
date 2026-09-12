// Test source suites only; release staging contains copies of app modules.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const suites = ['core','electron','cloud-backend/test'].flatMap(folder=>
  fs.readdirSync(path.join(root,folder)).filter(name=>/\.test\.(?:cjs|js)$/.test(name)).map(name=>path.join(root,folder,name)));
const result = spawnSync(process.execPath,['--test',...suites],{cwd:root,stdio:'inherit',windowsHide:true});
if(result.error) console.error(result.error);
process.exitCode = result.status ?? 1;

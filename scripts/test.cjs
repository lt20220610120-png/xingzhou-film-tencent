// Test source suites only; release staging contains copies of app modules.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const python=process.platform==='win32'?'python':'python3';
const pythonArgs=(folder,pattern)=>['-B','-m','unittest','discover','-s',folder,'-p',pattern];
const run=(program,args)=>{
  const result=spawnSync(program,args,{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.error) console.error(result.error);
  if(result.status!==0) process.exit(result.status ?? 1);
};
const localQwenOnly=process.argv.includes('--local-qwen');
if(!localQwenOnly){
  const suites=['core','electron','cloud-backend/test','world-simulation/test','scripts'].flatMap(folder=>
    fs.readdirSync(path.join(root,folder)).filter(name=>/\.test\.(?:cjs|js)$/.test(name)).map(name=>path.join(folder,name)));
  run(process.execPath,['--test',...suites]);
  run(python,pythonArgs('scripts','test_*.py'));
}
const qwenFolder='tools/local-qwen-tts';
const qwenVenv=path.join(root,qwenFolder,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const configuredPython=process.env.XINGZHOU_QWEN_TEST_PYTHON;
const qwenPython=configuredPython||(fs.existsSync(qwenVenv)?qwenVenv:python);
if(localQwenOnly||configuredPython||fs.existsSync(qwenVenv)){
  run(qwenPython,pythonArgs(qwenFolder,'test_*.py'));
}else{
  const installed=spawnSync(qwenPython,['-B','-c','import fastapi; import httpx'],{cwd:root,windowsHide:true});
  if(installed.status===0)run(qwenPython,pythonArgs(qwenFolder,'test_*.py'));
  else {
    run(qwenPython,pythonArgs(qwenFolder,'test_batch_scheduler.py'));
    console.log('Qwen HTTP tests require FastAPI and httpx. Run npm run test:local-qwen with the Qwen Python environment.');
  }
}

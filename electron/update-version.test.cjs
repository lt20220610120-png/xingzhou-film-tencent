const test=require('node:test');
const assert=require('node:assert/strict');
const {isNewerVersion}=require('../src/core/update-version.cjs');

async function loadServices(){return import('../core/appServices.js')}

test('只有GitHub清单版本高于当前版本时才提示更新',()=>{
 assert.equal(isNewerVersion('1.0.4','1.0.3'),true);
 assert.equal(isNewerVersion('1.0.3','1.0.3'),false);
 assert.equal(isNewerVersion('1.0.2','1.0.3'),false);
 assert.equal(isNewerVersion('1.10.0','1.9.9'),true);
});

test('清单缺少版本号时返回可读错误而不是undefined',async()=>{
 const {interpretUpdateResult}=await loadServices();
 assert.throws(()=>interpretUpdateResult({manifest:{installerUrl:'https://github.com/x.exe'},currentVersion:'1.0.3'}),/更新清单缺少版本号/);
});

test('解释GitHub更新结果并生成稳定状态',async()=>{
 const {interpretUpdateResult}=await loadServices();
 assert.deepEqual(interpretUpdateResult({manifest:{version:'1.0.4',installerUrl:'https://github.com/x.exe'},currentVersion:'1.0.3'}),{version:'1.0.4',installerUrl:'https://github.com/x.exe',notes:'',currentVersion:'1.0.3',available:true,status:'发现新版本 1.0.4'});
});

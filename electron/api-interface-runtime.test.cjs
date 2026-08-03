const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const ui=()=>fs.readFileSync(path.join(__dirname,'../src/v06/GlobalTools.jsx'),'utf8');
const app=()=>fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');

test('API测试连接正确读取主进程对象结果，不能把对象直接渲染导致页面崩溃',()=>{
 const source=ui();
 assert.match(source,/result\?\.message \|\|/);
 assert.doesNotMatch(source,/message: result \|\| '连接成功'/);
});

test('无需密钥的本地兼容服务允许测试和保存',()=>{
 const source=ui();
 assert.match(source,/selectedProvider\?\.requiresApiKey/);
 assert.match(source,/requiresApiKey: selectedProvider\?\.requiresApiKey/);
});

test('项目AI助手直接使用API接口页当前启用的配置',()=>{
 const source=app();
 assert.match(source,/function AiDrawer\(\{[^{]*state/);
 assert.match(source,/state\.apiProfiles\?\.find\(\(p\) => p\.id === state\.activeApiId\)/);
 assert.doesNotMatch(source,/localStorage\.getItem\('xz-ai-config'\)/);
});

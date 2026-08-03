const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

test('设置页只管理本地资料和软件更新，不再重复显示API连接表单',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
 const start=source.indexOf('function SettingsPage');
 const end=source.indexOf('/* ================================================================\n * App - 主应用组件',start);
 const settings=source.slice(start,end);
 assert.ok(settings.includes('<h2>软件更新</h2>'),'设置页必须保留软件更新卡片');
 assert.ok(settings.includes('api.checkUpdate(manifestUrl)'),'更新卡片必须连接更新清单');
 assert.ok(settings.includes('在软件内下载更新'),'发现新版本后必须能在软件内下载');
 assert.ok(!settings.includes('API 连接配置'),'设置页不得重复显示API连接配置');
 assert.ok(!settings.includes('handleTestConnection'),'设置页不得保留API测试逻辑');
 assert.ok(settings.indexOf('<h2>软件更新</h2>')>settings.indexOf('<h2>本地资料位置</h2>'),'软件更新卡片应位于本地资料卡片之后');
});

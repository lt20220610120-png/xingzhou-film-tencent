const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

test('设置页只显示当前版本，所有更新操作集中到启动授权页',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
 const start=source.indexOf('function SettingsPage');
 const end=source.indexOf('/* ================================================================\n * App - 主应用组件',start);
 const settings=source.slice(start,end);
 assert.ok(settings.includes('当前版本'));
 assert.ok(!settings.includes('checkUpdate'));
 assert.ok(!settings.includes('downloadUpdate'));
 assert.ok(!settings.includes('installUpdate'));
 assert.ok(!settings.includes('API 连接配置'),'设置页不得重复显示API连接配置');
 assert.ok(!settings.includes('handleTestConnection'),'设置页不得保留API测试逻辑');
});

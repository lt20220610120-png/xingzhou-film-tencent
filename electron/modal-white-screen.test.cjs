const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

test('API配置弹窗按对象形式读取 API_PROVIDERS，不得调用数组专用 find/map',()=>{
 const root=path.join(__dirname,'..');
 const ui=fs.readFileSync(path.join(root,'src/v06/GlobalTools.jsx'),'utf8');
 assert.doesNotMatch(ui,/API_PROVIDERS\.find\(/);
 assert.doesNotMatch(ui,/API_PROVIDERS\.map\(/);
 assert.match(ui,/Object\.values\(API_PROVIDERS\)/);
});

test('导演身份刷新后默认进入导演工作台而不是隐藏的果子库',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
 assert.match(app,/localStorage\.getItem\('xz-role'\) === 'director' \? 'director' : 'fruit'/);
});

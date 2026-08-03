const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const source=()=>fs.readFileSync(path.join(__dirname,'../src/v06/DirectorWorkspace.jsx'),'utf8');

test('创造模式的Skill下拉与生成按钮位于同一个紧凑操作组',()=>{
 const ui=source();
 assert.match(ui,/creative-generation-controls[\s\S]*mode-skill-picker[\s\S]*select[\s\S]*runCreativeScene/s);
 assert.doesNotMatch(ui,/当前将使用：/);
});

test('快速模式的Skill下拉与生成按钮位于场景卡片头部同一操作组',()=>{
 const ui=source();
 assert.match(ui,/quick-scene-card-head[\s\S]*mode-skill-picker[\s\S]*select[\s\S]*runQuickScene/s);
});

test('导演页面不再保留与生成按钮距离过远的全局Skill选择器',()=>{
 const ui=source();
 assert.doesNotMatch(ui,/\{\/\* Skill 选择器 \*\/\}[\s\S]*<div className="skill-selector">/);
});

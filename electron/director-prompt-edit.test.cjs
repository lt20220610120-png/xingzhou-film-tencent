const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const ui=()=>fs.readFileSync(path.join(__dirname,'../src/v06/DirectorWorkspace.jsx'),'utf8');
const css=()=>fs.readFileSync(path.join(__dirname,'../src/v100-compat.css'),'utf8');

test('提示词卡片提供编辑、保存、取消并将修改回写持久状态',()=>{
 const source=ui();
 assert.match(source,/function PromptCard\(\{[^}]*onEdit/);
 assert.match(source,/setEditing\(true\)/);
 assert.match(source,/保存修改/);
 assert.match(source,/取消/);
 assert.match(source,/onEdit\?\.\(prompt\.id, draft\)/);
 assert.match(source,/updateDirectorPromptEverywhere\(s, project\.id, promptId/);
});

test('快速模式使用全角兼容分段器解析Skill完整输出',()=>{
 const source=ui();
 assert.match(source,/splitNumberedPromptOutput\(result\.output\)/);
 assert.match(source,/buildScenePromptRecords\(\{[\s\S]*parts: outputParts/);
 assert.match(source,/quickSceneEdits/);
});

test('提示词编辑框和操作按钮有独立样式',()=>{
 const style=css();
 assert.match(style,/\.prompt-edit-textarea/);
 assert.match(style,/\.prompt-edit-actions/);
 assert.match(style,/\.prompt-edit-button/);
});

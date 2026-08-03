const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const read=(file)=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('所有会使用Skill的大模型入口都序列化完整目录上下文',()=>{
  const app=read('src/App.jsx');
  const chat=read('src/v06/PersistentChat.jsx');
  const tools=read('src/v06/GlobalTools.jsx');
  const director=read('src/v06/DirectorWorkspace.jsx');
  assert.match(app,/buildSkillContext\(skill\)/);
  assert.match(app,/executeSkillWithAi/);
  assert.match(chat,/buildSkillContext\(skill\)/);
  assert.match(tools,/buildSkillContext\(skill\)/);
  assert.match(director,/executeSkillWithAi/);
});

test('项目分组使用软件内对话框，不依赖Electron中不可靠的window.prompt',()=>{
  const hub=read('src/v06/ProjectCardHub.jsx');
  assert.doesNotMatch(hub,/window\.prompt/);
  assert.match(hub,/groupDialog/);
  assert.match(hub,/创建分组/);
});

test('导演快速模式仅渲染当前场景提示词，不再重复展开本集全部提示词',()=>{
  const director=read('src/v06/DirectorWorkspace.jsx');
  assert.match(director,/promptsForScene\(savedPrompts, currentScene\)/);
  assert.doesNotMatch(director,/全部提示词（/);
  assert.doesNotMatch(director,/savedPrompts\.map\(\(prompt/);
});

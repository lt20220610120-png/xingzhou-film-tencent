const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const read=(file)=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('果子/剧本转换与导演工作台统一走完整Skill执行器',()=>{
 const app=read('src/App.jsx');
 const director=read('src/v06/DirectorWorkspace.jsx');
 assert.match(app,/executeSkillWithAi/);
 assert.match(director,/executeSkillWithAi/);
 assert.match(app,/buildSkillManifest/);
 assert.match(director,/buildSkillManifest/);
});

test('行舟AI聊天和项目AI助手统一走完整Skill执行器',()=>{
 const chat=read('src/v06/PersistentChat.jsx');
 const app=read('src/App.jsx');
 assert.match(chat,/createSkillExecution/);
 assert.doesNotMatch(chat,/buildSkillContext\(skill\)/);
 assert.match(app,/createSkillExecution/);
 assert.doesNotMatch(app,/buildSkillContext\(skill\)/);
});

test('所有可选Skill入口向用户显示完整文件数量',()=>{
 const app=read('src/App.jsx');
 const chat=read('src/v06/PersistentChat.jsx');
 const director=read('src/v06/DirectorWorkspace.jsx');
 const css=read('src/v100-compat.css');
 for(const source of [app,chat,director]) assert.match(source,/skill-file-count/);
 assert.match(css,/\.skill-file-count/);
});

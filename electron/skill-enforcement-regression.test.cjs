const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const read=(file)=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('全软件所有Skill生成入口统一经过强制执行协议',()=>{
 const execution=read('core/skillExecution.js');
 const app=read('src/App.jsx');
 const director=read('src/v06/DirectorWorkspace.jsx');
 assert.match(execution,/buildSkillMessages\(skill, input, assistantRole\)/);
 assert.match(app,/executeSkillWithAi/);
 assert.match(app,/createSkillExecution/);
 assert.match(director,/executeSkillWithAi/);
 assert.equal((director.match(/executeSkillWithAi\(/g)||[]).length,3);
});

test('导演三级标题拆卡且卡片标题和正文第一行同时保留编号',()=>{
 const core=read('core/directorCreative.js');
 const ui=read('src/v06/DirectorWorkspace.jsx');
 assert.match(core,/SCENE_PROMPT_ID_MARKER/);
 assert.match(core,/markers\.push\(\{ label: marker\[1\], start: match\.index \}\)/);
 assert.match(core,/content:\s*trimOuterBlankLines\(source\.slice\(start, end\)\)/);
 assert.match(core,/label:\s*completeLabel/);
 assert.match(ui,/<div className="prompt-label">\{prompt\.label/);
 assert.match(ui,/<div className="prompt-content">\{prompt\.content\}<\/div>/);
 assert.match(ui,/复制/);
 assert.match(ui,/编辑/);
 assert.match(ui,/删除/);
});

test('完整Skill目录根SKILL.md不能为空，阻止只有references却声称完整读取',()=>{
 const importer=read('core/skillImport.js');
 assert.match(importer,/SKILL\.md 内容为空/);
});

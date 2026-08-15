const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const source=()=>fs.readFileSync(path.join(__dirname,'../src/v06/DirectorWorkspace.jsx'),'utf8');

test('导演Skill下拉用唯一ID保存和执行，避免显示video-prompt却实际调用其他Skill',()=>{
 const s=source();
 assert.match(s,/const \[selectedSkillId, setSelectedSkillId\]/);
 assert.match(s,/skills\.find\(\(s\) => s\.id === selectedSkillId\)/);
 assert.doesNotMatch(s,/skills\.find\(\(s\) => s\.name === selectedSkill/);
 assert.match(s,/<option key=\{skill\.id\} value=\{skill\.id\}>\{skill\.name\}<\/option>/);
 assert.match(s,/localStorage\.setItem\('xz-last-used-skill', event\.target\.value\)/);
});

test('快速模式按用户编号拆成独立模型调用并支持并发请求，防止模型跨段串写',()=>{
 const s=source();
 assert.match(s,/buildNumberedSceneTasks\(inputText, sceneLabel\)/);
 assert.match(s,/Promise\.all\(tasks\.map\(/);
 assert.match(s,/input: taskInput/);
 assert.match(s,/generatedParts\.push\(\{ label: task\.label, content \}\)/);
});

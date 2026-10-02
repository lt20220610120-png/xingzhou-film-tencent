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

test('人工快速模式把完整场景一次提交Skill，按用户括号核对输出数量和编号',()=>{
 const s=source();
 assert.match(s,/buildNumberedSceneTasks\(inputText, sceneLabel\)/);
 assert.doesNotMatch(s,/Promise\.allSettled\(tasks\.map\(/);
 assert.match(s,/input: `\$\{sourceText\}/);
 assert.match(s,/parsed\.length !== tasks\.length/);
 assert.match(s,/part\.label!==label/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

const app=()=>fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');

test('果子和剧本单集编辑器必须接收完整state供SkillRunner使用',()=>{
 const ui=app();
 assert.match(ui,/function FruitEpisodeEditor\(\{ project, episode, setState, skills, state, api \}\)/);
 assert.match(ui,/<FruitEpisodeEditor[^>]*state=\{state\}[^>]*api=\{api\}/s);
 assert.match(ui,/function ScriptEpisodeEditor\(\{ project, episode, setState, skills, state, api \}\)/);
 assert.match(ui,/<ScriptEpisodeEditor[^>]*state=\{state\}[^>]*api=\{api\}/s);
});

test('新建项目和添加集数必须传入默认分集数据，不能调用必填episodeData的接口后白屏',()=>{
 const ui=app();
 assert.match(ui,/addEpisode\(s, project\.id, createFruitEpisodeData\(/);
 assert.match(ui,/addScriptEpisode\(s, project\.id, createScriptEpisodeData\(/);
 assert.match(ui,/createProject\(state, name\)[\s\S]*addEpisode\(/);
 assert.match(ui,/createScriptProject\(state, name, mode\)[\s\S]*addScriptEpisode\(/);
});

test('总剧本展示和收录使用字符串内容，不得把状态对象写入文本区或剧本库',()=>{
 const ui=app();
 assert.match(ui,/buildFruitMasterScript\(project\)/);
 assert.match(ui,/buildScriptMasterScript\(project\)/);
 assert.doesNotMatch(ui,/compileFruitProject\(\{ \.\.\.project/);
 assert.doesNotMatch(ui,/const compiled = compileScriptProject\(project\)/);
});

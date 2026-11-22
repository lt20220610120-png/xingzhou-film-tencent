const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const read=(file)=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('果子/剧本转换与导演工作台统一走完整Skill执行器',()=>{
 const creator=read('src/creator/CreatorWorkspace.jsx');
 const editor=read('src/creator/CreatorEditor.jsx');
 const agent=read('src/creator/useCreatorAgent.js');
 const tasks=read('core/creatorAi.js');
 const director=read('src/v06/DirectorWorkspace.jsx');
 assert.match(creator,/<EpisodeEditor\b[^>]*agent=\{agent\}/);
 assert.match(editor,/<AgentPanel\b[^>]*kind=\{kind\}/);
 assert.match(agent,/runCreatorTask\(\{[^}]*kind[^}]*skillId/);
 assert.match(tasks,/buildSkillMessages\(skill,prompt,/);
 assert.match(director,/executeSkillWithAi\(\{[^\n]*input: finalInput/);
 assert.match(director,/executeSkillWithAi\(\{[^\n]*input: sourceText/);
});

test('行舟AI聊天和项目AI助手统一走完整Skill执行器',()=>{
 const chat=read('src/v06/PersistentChat.jsx');
 const rewrite=read('src/creator/RewriteWorkspace.jsx');
 const panel=read('src/creator/AgentPanel.jsx');
 const tasks=read('core/creatorAi.js');
 assert.match(chat,/createSkillExecution\(\{[^}]*skillId: skill\.id/);
 assert.match(rewrite,/<AgentPanel\b[^>]*\bchat\b/);
 assert.match(panel,/const args=\{[^}]*skillId[^}]*chat\}/);
 assert.match(tasks,/buildSkillMessages\(skill,prompt,/);
 for(const source of [chat,panel,tasks]) assert.doesNotMatch(source,/buildSkillContext\(skill\)/);
});

test('所有可选Skill入口向用户显示完整文件数量',()=>{
 const panel=read('src/creator/AgentPanel.jsx');
 const chat=read('src/v06/PersistentChat.jsx');
 const director=read('src/v06/DirectorWorkspace.jsx');
 const css=read('src/v100-compat.css');
 assert.match(panel,/完整 Skill · \{1\+\(skill\.files\?\.length\|\|0\)\} 个文件/);
 assert.match(chat,/skill-file-count[^\n]*buildSkillManifest\(selectedSkill\)\.totalFiles/);
 assert.match(director,/skill-file-count[^\n]*buildSkillManifest\(currentSkill\)\.totalFiles/);
 assert.match(css,/\.skill-file-count/);
});

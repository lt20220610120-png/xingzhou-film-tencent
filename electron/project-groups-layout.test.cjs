const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const app=()=>fs.readFileSync(path.join(__dirname,'../src/App.jsx'),'utf8');
const hub=()=>fs.readFileSync(path.join(__dirname,'../src/v06/ProjectCardHub.jsx'),'utf8');
const css=()=>fs.readFileSync(path.join(__dirname,'../src/v100-compat.css'),'utf8');

test('果子库与剧本创作项目卡均启用分组筛选、改名和移动分组',()=>{
 const ui=app();
 assert.match(ui,/fruitGroups/);
 assert.match(ui,/scriptGroups/);
 assert.match(ui,/groups=\{state\.fruitGroups/);
 assert.match(ui,/groups=\{state\.scriptGroups/);
 const cards=hub();
 assert.match(cards,/const canOrganize =/);
 assert.match(cards,/\{canOrganize && \(/);
 assert.match(cards,/project-organize-row/);
});

test('导演快速模式在桌面宽屏使用主区全宽三栏，不被1500容器和1700断点压成窄列',()=>{
 const style=css();
 assert.match(style,/\.director-stage\{max-width:none/);
 assert.match(style,/grid-template-columns:minmax\(230px,280px\) minmax\(520px,1fr\) minmax\(340px,400px\)/);
 assert.doesNotMatch(style,/@media\(max-width:1700px\)[^{]*\{\.quick-mode-container/);
});

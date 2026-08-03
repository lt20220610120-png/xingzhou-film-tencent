const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

test('用户指定的1.0.0完整CSS必须作为最终视觉基线加载且由兼容层承载新功能样式',()=>{
 const root=path.join(__dirname,'..');
 const baseline=fs.readFileSync(path.join(root,'src/v100-exact.css'));
 assert.ok(baseline.length>30000,'1.0.0视觉基线不应被截断');
 const baselineText=baseline.toString('utf8');
 assert.match(baselineText,/\.sidebar\{background:linear-gradient\(#172755,#2d3690 58%,#493298\)/);
 assert.doesNotMatch(baselineText,/skill-create-panel/,'Skill 新功能样式不得污染1.0.0视觉基线');
 const compat=fs.readFileSync(path.join(root,'src/v100-compat.css'),'utf8');
 assert.match(compat,/skill-create-panel/,'新功能样式应放入兼容层');
 const main=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
 assert.ok(main.indexOf("./v100-exact.css")>main.indexOf("./v09.css"),'1.0.0视觉基线必须在现有主题之后加载');
 assert.ok(main.indexOf("./v100-compat.css")>main.indexOf("./v100-exact.css"),'新功能兼容样式必须在基线之后加载');
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

test('1.0.0项目卡片视觉基线样式必须保留',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../src/v100-visual.css'),'utf8');
 for(const selector of ['.card-page','.project-grid','.project-card','.card-cover','.project-card-actions','.director-shell']){
   assert.ok(css.includes(selector),`缺少视觉基线选择器 ${selector}`);
 }
 assert.match(css,/\.project-grid[^\{]*\{[^}]*display:grid/);
 assert.match(css,/\.project-card[^\{]*\{[^}]*border-radius/);
 assert.match(css,/\.card-cover[^\{]*\{[^}]*height:105px/);
});

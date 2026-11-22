const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const src=name=>fs.readFileSync(path.resolve(__dirname,'../src',name),'utf8');
test('current navigation has one creator entry and no retired editors',()=>{
 const app=src('App.jsx');
 assert.match(app,/<CreatorWorkspace\b/);
 assert.match(app,/<PersistentChat\b/);
 assert.doesNotMatch(app,/function (?:AiDrawer|FruitEpisodeEditor|ScriptEpisodeEditor|FruitLibrary|ScriptStudio|ScriptLibrary)\(/);
});

test('the renderer does not load empty transitional styles',()=>{
 assert.doesNotMatch(src('main.jsx'),/import '\.\/v0[678]\.css'/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {PNG}=require('pngjs');

test('图标母版为 1024 方形且四角透明、圆角内不透明',()=>{
 const png=PNG.sync.read(fs.readFileSync(path.join(__dirname,'../build/icon-master.png')));
 assert.equal(png.width,1024);assert.equal(png.height,1024);
 const alpha=(x,y)=>png.data[(y*png.width+x)*4+3];
 assert.equal(alpha(0,0),0);assert.equal(alpha(1023,0),0);assert.equal(alpha(0,1023),0);assert.equal(alpha(1023,1023),0);
 assert.ok(alpha(100,100)>200);assert.ok(alpha(512,512)>250);
});

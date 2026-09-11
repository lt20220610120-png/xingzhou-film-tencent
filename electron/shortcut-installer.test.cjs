const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

test('快捷方式只能由安装器创建，应用启动不得再次创建',()=>{
 const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
 assert.doesNotMatch(main,/writeShortcutLink|refreshDesktopShortcut/);
 const pkg=require('../package.json');
 assert.equal(pkg.build.nsis.createDesktopShortcut,true);
 assert.equal(pkg.build.nsis.include,'build/installer.nsh');
});

test('安装器按安装范围清理另一桌面的快捷方式，不再重复创建',()=>{
 const nsh=fs.readFileSync(path.join(__dirname,'../build/installer.nsh'),'utf8');
 assert.match(nsh,/\$DESKTOP\\Xingzhou Film Tencent\.lnk/);
 assert.match(nsh,/SetShellVarContext all/);
 assert.match(nsh,/SetShellVarContext current/);
 assert.doesNotMatch(nsh, /CreateShortCut/);
 assert.match(nsh, /\$installMode == "all"/);
 assert.equal((nsh.match(/Delete "\$DESKTOP\\Xingzhou Film Tencent\.lnk"/g) || []).length, 4);
 assert.doesNotMatch(nsh,/Delete "\$DESKTOP\\行舟影视\.lnk"/);
 assert.doesNotMatch(nsh,/CreateShortCut "\$DESKTOP\\行舟影视\.lnk"/);
});

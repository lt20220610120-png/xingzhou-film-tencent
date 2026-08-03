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

test('安装升级会清理旧快捷方式并明确在当前用户桌面创建新快捷方式',()=>{
 const nsh=fs.readFileSync(path.join(__dirname,'../build/installer.nsh'),'utf8');
 assert.match(nsh,/\$DESKTOP\\行舟影视\.lnk/);
 assert.match(nsh,/SetShellVarContext all/);
 assert.match(nsh,/SetShellVarContext current/);
 assert.ok((nsh.match(/Delete "\$DESKTOP\\行舟影视\.lnk"/g)||[]).length>=2);
 assert.match(nsh,/CreateShortCut "\$DESKTOP\\行舟影视\.lnk" "\$INSTDIR\\行舟影视\.exe"/);
});

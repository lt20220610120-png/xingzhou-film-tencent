const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const pkg=require('../package.json');

test('Windows 程序、安装器和卸载器统一使用行舟帆船图标',()=>{
 const icon=path.join(__dirname,'..','build','icon.ico');
 assert.ok(fs.existsSync(icon),'缺少 build/icon.ico');
 const bytes=fs.readFileSync(icon);
 assert.equal(bytes.readUInt16LE(0),0);
 assert.equal(bytes.readUInt16LE(2),1);
 assert.ok(bytes.readUInt16LE(4)>=7,'ICO 必须包含多尺寸图层');
 assert.equal(pkg.build.win.icon,'build/icon.ico');
 assert.equal(pkg.build.nsis.installerIcon,'build/icon.ico');
 assert.equal(pkg.build.nsis.uninstallerIcon,'build/icon.ico');
});

test('应用启动不再自行创建桌面快捷方式',()=>{
 const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
 assert.doesNotMatch(main,/writeShortcutLink|refreshDesktopShortcut/);
});

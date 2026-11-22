const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pruneReleaseInstallers}=require('./release-retention.cjs');

test('six stable versions keep the five newest numerically and leave unrelated data intact',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-retention-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const name=v=>`Xingzhou-Film-Tencent-Setup-${v}.exe`;
 for(const version of ['2.8.9','2.8.98','2.8.99','2.8.100','2.8.101','2.8.102','2.8.103-private.1']) {
   const dir=path.join(root,version);
   fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,name(version)),version);
 }
 const privateFile=path.join(root,'2.8.103-private.1',name('2.8.103-private.1'));
 const unrelated=path.join(root,'2.8.9','my-project.json');fs.writeFileSync(unrelated,'project');
 const empty=path.join(root,'2.8.104');fs.mkdirSync(empty);
 assert.deepEqual(pruneReleaseInstallers(root),{
   kept:['2.8.102','2.8.101','2.8.100','2.8.99','2.8.98'],removed:['2.8.9'],removedBytes:5,
 });
 assert.equal(fs.existsSync(path.join(root,'2.8.9',name('2.8.9'))),false);
 assert.equal(fs.readFileSync(unrelated,'utf8'),'project');
 assert.ok(fs.existsSync(privateFile)&&fs.existsSync(empty));
});

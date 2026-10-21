const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {syncLikeExtension}=require('./like-extension.cjs');
test('Like extension upgrade keeps the registered directory and pairing files',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-like-upgrade-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(syncLikeExtension(root,{existingOnly:true}),null);
 const folder=syncLikeExtension(root);fs.writeFileSync(path.join(folder,'keep-pairing'),'fixture');fs.writeFileSync(path.join(folder,'main.js'),'old adapter');
 assert.equal(syncLikeExtension(root,{existingOnly:true}),folder);
 assert.match(fs.readFileSync(path.join(folder,'main.js'),'utf8'),/wb-snapshot-select/);assert.equal(fs.readFileSync(path.join(folder,'keep-pairing'),'utf8'),'fixture');
 assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))).version,'1.0.1');
});

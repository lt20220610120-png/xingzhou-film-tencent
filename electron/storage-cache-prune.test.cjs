const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
test('仅清理可重建原图/预览缓存，项目文件与未匹配文件保留',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-prune-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'.cloud-image-cache');await fs.mkdir(dir);const file=path.join(dir,'a'.repeat(64)+'.png');await fs.writeFile(file,'cache');await fs.writeFile(file+'.json','{}');await fs.utimes(file,new Date(0),new Date(0));
 await fs.writeFile(path.join(dir,'project-not-cache.json'),'draft');await fs.writeFile(path.join(root,'xingzhou-data.json'),'project');
 await require('./storage-cache-prune.cjs').pruneStorageCaches(root);
 await assert.rejects(fs.access(file),{code:'ENOENT'});await assert.rejects(fs.access(file+'.json'),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(root,'xingzhou-data.json'),'utf8'),'project');assert.equal(await fs.readFile(path.join(dir,'project-not-cache.json'),'utf8'),'draft');
});

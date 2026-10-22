const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifiedImportedImages,bindingImageInputs}=require('./imported-binding-media.cjs');
test('导入图片按真实路径和内容哈希复核；替换或越界不能生成',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-import-binding-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'整本提示词素材');await fs.mkdir(dir);
 const hash=crypto.createHash('sha256').update('image').digest('hex'),filePath=path.join(dir,hash+'.png');
 await fs.writeFile(filePath,'image');
 const ref={id:`folder-${hash}-png`,kind:'image',filePath};
 assert.equal((await verifiedImportedImages([ref],root))[0].filePath,filePath);
 const images=await bindingImageInputs([ref],root,{createThumbnailFromPath:async()=>({isEmpty:()=>false,toJPEG:()=>Buffer.from('jpeg')})});
 assert.match(images[0].dataUrl,/^data:image\/jpeg;base64,/);
 await assert.rejects(bindingImageInputs(Array(25).fill(ref),root,{}),/24/);
 await fs.writeFile(filePath,'changed');await assert.rejects(verifiedImportedImages([ref],root),/内容已变化/);
 const outside=path.join(root,hash+'.png');await fs.writeFile(outside,'image');
 await assert.rejects(verifiedImportedImages([{...ref,filePath:outside}],root),/目录/);
});

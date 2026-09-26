const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {exportImagesToFolder}=require('./image-export.cjs');

test('whole-drama export can group by episode or combine all images without duplicate downloads',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-art-export-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const images=[{id:'a',assetName:'主角',episodes:[1,2],filename:'a.png'},{id:'b',assetName:'场景',episodes:[2],filename:'b.jpg'}];
 let calls=0;const fetchImage=async image=>{calls++;return Buffer.from(image.id)};
 const grouped=await exportImagesToFolder({images,dir:path.join(root,'按集'),layout:'episode',fetchImage});
 assert.equal(grouped.count,2);assert.equal(calls,2);
 assert.deepEqual(await fs.readdir(path.join(root,'按集')),['第1集','第2集']);
 assert.equal((await fs.readdir(path.join(root,'按集','第2集'))).length,2);
 const flat=await exportImagesToFolder({images,dir:path.join(root,'汇总'),layout:'flat',fetchImage});
 assert.equal(flat.count,2);assert.equal((await fs.readdir(path.join(root,'汇总'))).length,2);
});

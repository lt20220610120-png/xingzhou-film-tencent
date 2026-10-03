const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {exportImagesToFolder}=require('./image-export.cjs');
const {importEpisodeMedia}=require('./episode-media-import.cjs');
test('scene export roundtrips reusable images without leaking another scene or unbound cards',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-scene-export-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,'export');let downloads=0;
 const images=[{id:'shared',assetName:'主角睡衣',sceneIds:['1-1','1-2','2-3'],episodes:[1,2],filename:'sleep.png'},{id:'school',assetName:'校服',sceneIds:['1-2'],episodes:[1],filename:'school.png'},{id:'unbound',assetName:'后加资产',episodes:[1],filename:'extra.png'}];
 const exported=await exportImagesToFolder({images,dir,layout:'scene',fetchImage:async i=>{downloads++;return Buffer.from(i.id);}});assert.equal(exported.count,3);assert.equal(downloads,3);assert.equal(exported.unbound,1);
 const result=await importEpisodeMedia({dialog:{showOpenDialog:async()=>({filePaths:[dir]})},destDir:path.join(root,'local'),mode:'series'});
 assert.equal(result.episodes[1].length,0);assert.equal(result.scenes['1-1'].length,1);assert.equal(result.scenes['1-2'].length,2);assert.equal(result.scenes['2-3'].length,1);assert.equal(result.scenes['1-1'][0].id,result.scenes['2-3'][0].id);assert.ok(result.warnings.some(w=>w.includes('未关联')));
});

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

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {episodeNumber,importEpisodeMedia,importEpisodeFiles,deleteEpisodeMedia}=require('./episode-media-import.cjs');
test('Arabic and Chinese episode folders resolve without inventing unknown episodes',()=>{
 for(const [name,n] of [['第一集',1],['第1集',1],['1',1],['第十一集 素材',11],['第一百零二集',102],['第两百集',200],['００３',3],['其他',null],['0',null]])assert.equal(episodeNumber(name),n,name);
});
test('whole folders import mixed media once; empty and unrecognized folders are nonfatal',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-book-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),destDir=path.join(root,'dest');
 for(const name of ['第一集','第2集','3','花絮'])await fs.mkdir(path.join(source,name),{recursive:true});
 await fs.writeFile(path.join(source,'第一集','角色.png'),'image');await fs.writeFile(path.join(source,'第一集','动作.mp4'),'video');await fs.writeFile(path.join(source,'第2集','对白.wav'),'audio');await fs.writeFile(path.join(source,'第一集','忽略.txt'),'text');
 const dialog={showOpenDialog:async()=>({filePaths:[source]})};
 const first=await importEpisodeMedia({dialog,destDir,mode:'series'});
 assert.equal(first.count,3);assert.equal(first.episodes[1].length,2);assert.equal(first.episodes[2][0].kind,'audio');assert.deepEqual(first.episodes[3],[]);assert.match(first.warnings[0],/花絮/);
 const second=await importEpisodeMedia({dialog,destDir,mode:'series'});
 assert.deepEqual(second,first);assert.equal((await fs.readdir(path.join(destDir,'整本提示词素材'))).length,3);
 const one=await importEpisodeMedia({dialog:{showOpenDialog:async()=>({filePaths:[path.join(source,'第一集')]})},destDir,mode:'episode',episode:7});
 assert.deepEqual(one.episodes[7],first.episodes[1]);
 assert.equal(await importEpisodeMedia({dialog:{showOpenDialog:async()=>({canceled:true})},destDir,episode:1}),null);
});
test('individual image audio and video files attach to the chosen episode and survive a second import',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-book-files-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),destDir=path.join(root,'dest');await fs.mkdir(source);
 const files=[['picture.png','image'],['voice.wav','audio'],['clip.mp4','video']];
 for(const [name] of files)await fs.writeFile(path.join(source,name),name);
 for(const [name,kind] of files){
  const input=path.join(source,name),dialog={showOpenDialog:async options=>{assert.ok(options.properties.includes('openFile'));return {filePaths:[input]}}};
  const result=await importEpisodeFiles({dialog,destDir,kind,episode:2});
  assert.equal(result.episodes[2][0].kind,kind);
  assert.equal(await fs.readFile(result.episodes[2][0].filePath,'utf8'),name);
  assert.deepEqual(await importEpisodeFiles({dialog,destDir,kind,episode:2}),result);
 }
});
test('clearing one book deletes only unshared imported files inside the prompt media directory',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xz-book-clear-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'整本提示词素材');await fs.mkdir(dir);
 const own=path.join(dir,'own.png'),shared=path.join(dir,'shared.png'),outside=path.join(root,'outside.png');
 for(const file of [own,shared,outside])await fs.writeFile(file,'x');
 const deleted=await deleteEpisodeMedia({destDir:root,paths:[own,shared,outside],retainedPaths:[shared]});
 assert.equal(deleted,1);await assert.rejects(fs.stat(own));
 assert.equal((await fs.stat(shared)).isFile(),true);assert.equal((await fs.stat(outside)).isFile(),true);
});

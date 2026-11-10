const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLocalMediaHandler,LOCAL_MEDIA_PRIVILEGES,exportMediaFile}=require('./local-media.cjs');
test('local video protocol is standard and supports tail reads, seeking, HEAD and invalid ranges',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-video-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'视频.mp4');fs.writeFileSync(file,'0123456789');const handle=createLocalMediaHandler(()=>root);
 assert.equal(LOCAL_MEDIA_PRIVILEGES.standard,true);assert.equal(LOCAL_MEDIA_PRIVILEGES.stream,true);
 const request=(options={})=>new Request(`xzmedia://local/${encodeURIComponent(file)}`,options);
 let r=await handle(request({headers:{range:'bytes=3-5'}}));assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 3-5/10');assert.equal(await r.text(),'345');
 r=await handle(request({headers:{range:'bytes=-3'}}));assert.equal(await r.text(),'789');
 r=await handle(request({headers:{range:'bytes=4-'}}));assert.equal(await r.text(),'456789');
 r=await handle(request({method:'HEAD'}));assert.equal(r.headers.get('content-length'),'10');assert.equal(r.headers.get('content-type'),'video/mp4');assert.equal(await r.text(),'');
 r=await handle(request({headers:{range:'bytes=20-'}}));assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */10');
 assert.equal((await handle(request({headers:{range:'bytes=1-2,4-5'}}))).status,416);
 assert.equal((await handle(new Request('xzmedia:///%ZZ'))).status,400);
 assert.equal((await handle(new Request(`xzmedia:///${encodeURIComponent(path.join(root,'missing.mp4'))}`))).status,404);
 assert.equal((await handle(new Request(`xzmedia:///${encodeURIComponent(__filename)}`))).status,403);
 assert.equal((await handle(request({method:'POST'}))).status,405);
 const controller=new AbortController();controller.abort();assert.equal((await handle(request({signal:controller.signal}))).status,499);
});
test('download preserves original bytes, recovers missing local copy from URL, and honors cancel',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-export-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'source.mp4'),dest=path.join(root,'saved.mp4');fs.writeFileSync(file,Buffer.from([0,1,2,255]));
 let downloads=0;const deps={showSaveDialog:async()=>({filePath:dest}),downloadToFile:async()=>{downloads++;return file;},mediaDir:()=>root};
 assert.equal(await exportMediaFile({filePath:file,kind:'video'},deps),dest);assert.deepEqual(fs.readFileSync(dest),fs.readFileSync(file));assert.equal(downloads,0);
 await exportMediaFile({filePath:path.join(root,'missing.mp4'),url:'https://example.com/video.mp4',kind:'video'},deps);assert.equal(downloads,1);
 assert.equal(await exportMediaFile({filePath:file},{...deps,showSaveDialog:async()=>({canceled:true})}),null);
 await assert.rejects(exportMediaFile({url:'file:///private' },deps),/下载地址无效/);
});

test('renaming a video to its shot number preserves playable extension and bytes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-export-name-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source.mp4'),dest=path.join(root,'1-6-1');fs.writeFileSync(source,Buffer.from('0000ftypisom-original-video'));
 let options;const deps={showSaveDialog:async o=>{options=o;return {filePath:dest};},mediaDir:()=>root};
 const saved=await exportMediaFile({filePath:source,kind:'video',filename:'1-6-1'},deps);
 assert.equal(saved,dest+'.mp4');assert.deepEqual(fs.readFileSync(saved),fs.readFileSync(source));
 assert.equal(options.defaultPath,'1-6-1.mp4');assert.deepEqual(options.filters[0].extensions,['mp4']);
});

test('format filters preserve original MOV, audio and image types, including canvas calls without kind',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-export-types-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const ext of ['mov','webm','wav','aac','flac','png']){
  const source=path.join(root,'source.'+ext),dest=path.join(root,'renamed-'+ext);fs.writeFileSync(source,ext+' original bytes');
  assert.equal(await exportMediaFile({filePath:source},{showSaveDialog:async()=>({filePath:dest}),mediaDir:()=>root}),dest+'.'+ext);
 }
});

test('adding a missing extension never silently overwrites another saved video',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-export-exists-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source.mp4'),dest=path.join(root,'1-6-1.mp4');fs.writeFileSync(source,'new');fs.writeFileSync(dest,'keep');
 await assert.rejects(exportMediaFile({filePath:source,kind:'video'},{showSaveDialog:async()=>({filePath:dest.slice(0,-4)}),mediaDir:()=>root}),/已存在/);
 assert.equal(fs.readFileSync(dest,'utf8'),'keep');
});

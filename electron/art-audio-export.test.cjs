const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,os=require('node:os'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const {readMediaBytes}=require('./media-network.cjs');
const {exportImagesToFolder}=require('./image-export.cjs');
const wav=()=>{const rate=16000,count=4800,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)b.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*440*i/rate)),44+i*2);return b;};

test('actual export IPC writes playable local and downloaded WAV beside the correct prompt images',async t=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'xz-export-audio-'));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 const dataDir=path.join(root,'data');await fsp.mkdir(dataDir);const audio=wav(),localFile=path.join(dataDir,'speaker.wav');await fsp.writeFile(localFile,audio);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZQAAAABJRU5ErkJggg==','base64');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/voice.wav'?'audio/wav':'image/png');res.end(req.url==='/voice.wav'?audio:png);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const endpoint=`http://127.0.0.1:${server.address().port}`;let exportHandler;
 // Exercise the shipped handler (including local data-root checks), rather
 // than substituting a test-only downloader for Electron's real export path.
 const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8'),start=main.indexOf("ipcMain.handle('collab-export-images'"),end=main.indexOf("ipcMain.handle('collab-list-members'",start);
 vm.runInNewContext(main.slice(start,end),{fs,path,getDataDir:()=>dataDir,readMediaBytes,exportImagesToFolder,collabService:{resolveAssetImage:async()=>({url:endpoint+'/image.png'})},dialog:{showOpenDialog:async()=>({filePaths:[root]})},ipcMain:{handle:(_,fn)=>{exportHandler=fn;}}});
 const {fixture}=await import('../core/promptDistribution.fixtures.js'),{bindingSnapshot,currentEntryBinding,saveDistribution}=await import('../core/promptArtBinding.js'),{applySceneDistribution}=await import('../core/scenePromptDistribution.js'),{promptExportImages}=await import('../core/promptBindingVersions.js');
 const f=fixture(),snapshot=bindingSnapshot(f.project,f.ledger,f.assets),entry=snapshot.entries[0];snapshot.entries=[entry];snapshot.cards=snapshot.cards.map(c=>({...c,assetId:'published-person',publishedSceneIds:[entry.sceneId],images:[{id:'picture',url:endpoint+'/image.png'}]}));entry.prompt+='\n【连续台词】\nD01｜张三｜现场对白｜分镜01：『你好。』\nD02｜李四｜现场对白｜分镜02：『好的。』';
 snapshot.voiceCards=[{uid:'local',name:'张三',sceneIds:[entry.sceneId],reference:{id:'local-audio',kind:'audio',filePath:localFile}},{uid:'remote',name:'李四',sceneIds:[entry.sceneId],reference:{id:'remote-audio',kind:'audio',url:endpoint+'/voice.wav'}},{uid:'silent',name:'沉默人物',sceneIds:[entry.sceneId],reference:{id:'silent-audio',kind:'audio',filePath:localFile}}];
 const seed=currentEntryBinding(snapshot,entry),decision=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,seed,{assignments:[],missing:[],speakers:[]})),rows=promptExportImages(snapshot,{[entry.id]:decision},{includeAudio:true});
 assert.equal(rows.filter(r=>r.kind==='audio').length,2);assert(!rows.some(r=>r.id==='silent-audio'));
 for(const layout of ['prompt','scene','episode']){
  const result=await exportHandler(null,{folderName:layout,images:rows,layout});assert.equal(result.count,rows.length);
  const dir=path.join(root,layout,`第${entry.episode}集`,...(layout==='episode'?[]:[`场景${entry.sceneId}`]),...(layout==='prompt'?[`提示词${entry.label}`]:[])),files=await fsp.readdir(dir),voices=files.filter(n=>n.endsWith('.wav'));
  assert.equal(voices.length,2);assert(files.some(n=>n.endsWith('.png')));
  for(const name of voices){const exported=await fsp.readFile(path.join(dir,name));assert.deepEqual(exported,audio);assert.equal(exported.toString('ascii',0,4),'RIFF');assert.equal(exported.readUInt32LE(40)/(exported.readUInt32LE(24)*2),.3);}
 }
 await assert.rejects(exportHandler(null,{folderName:'broken',images:[{...rows.find(r=>r.kind==='audio'),filePath:path.join(dataDir,'missing.wav')}],layout:'prompt'}),/失败/);
});

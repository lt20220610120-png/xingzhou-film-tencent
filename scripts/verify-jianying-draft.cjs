const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temporary = fs.realpathSync(os.tmpdir());
if (!process.versions.electron) {
 const folder = fs.mkdtempSync(path.join(temporary,'xz-jianying-draft-'));
 try {
  const env = {...process.env,XZ_JIANYING_DRAFT_ROOT:folder};
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,timeout:45000,env});
  if(result.error)throw result.error;
  assert.equal(result.status,0,'Isolated Jianying draft verification failed');
 } finally {
  if(path.dirname(fs.realpathSync(folder))===temporary)fs.rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
 return;
}

const { app, BrowserWindow, protocol } = require('electron');
const { LOCAL_MEDIA_PRIVILEGES } = require('../electron/local-media.cjs');
const { createJianyingMediaProbe } = require('../electron/jianying-media-probe.cjs');
const { exportJianyingDraft } = require('../electron/jianying-draft.cjs');
const root = fs.realpathSync(process.env.XZ_JIANYING_DRAFT_ROOT || '.');
assert.ok(path.dirname(root)===temporary&&path.basename(root).startsWith('xz-jianying-draft-'));
const profile=path.join(root,'electron-profile');
fs.mkdirSync(profile);
app.setPath('userData',profile);
app.setPath('sessionData',profile);
app.commandLine.appendSwitch('disable-background-networking');
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'xzmedia',privileges:LOCAL_MEDIA_PRIVILEGES}]);
app.on('window-all-closed',()=>{});

function waveTone(seconds) {
 const sampleRate=8000;
 const samples=sampleRate*seconds;
 const wav=Buffer.alloc(44+samples*2);
 wav.write('RIFF',0);
 wav.writeUInt32LE(wav.length-8,4);
 wav.write('WAVEfmt ',8);
 wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);
 wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(sampleRate,24);
 wav.writeUInt32LE(sampleRate*2,28);
 wav.writeUInt16LE(2,32);
 wav.writeUInt16LE(16,34);
 wav.write('data',36);
 wav.writeUInt32LE(samples*2,40);
 for(let index=0;index<samples;index++)wav.writeInt16LE(Math.round(Math.sin(index*440*Math.PI*2/sampleRate)*4000),44+index*2);
 return wav;
}

const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const posixPath=value=>value.replaceAll('\\','/');

app.whenReady().then(async()=>{
 const dataDir=path.join(root,'project-data'),folder=path.join(root,'drafts');
 fs.mkdirSync(dataDir);
 fs.mkdirSync(folder);
 const video=path.join(dataDir,'测试分镜 2.mp4'),later=path.join(dataDir,'测试分镜 10.mp4');
 const audio=path.join(dataDir,'测试台词.wav'),bad=path.join(dataDir,'损坏视频.mp4');
 const existing=path.join(folder,'已有草稿.json'),outside=path.join(root,'资料目录之外的测试视频.mp4');
 const mp4=path.join(__dirname,'../electron/fixtures/preview-seek.mp4');
 for(const copy of [video,later,outside])fs.copyFileSync(mp4,copy);
 fs.writeFileSync(audio,waveTone(0.75));
 fs.writeFileSync(bad,'invalid mp4');
 fs.writeFileSync(existing,'{"preserved":true}');
 const sources=[video,later,audio,bad,outside,existing,mp4];
 const before=sources.map(digest);
 const project={id:'isolated-jianying',name:'隔离剪映测试',episodes:[{storyboardPrompts:[
  {id:'last',label:'1-2-10'}, {id:'never-started',label:'1-2-6'}, {id:'corrupt',label:'1-2-5'},
  {id:'remote',label:'1-2-4'}, {id:'missing',label:'1-2-3'},
  {id:'first',label:'1-2-2',sourcePromptId:'original-first',subtitle:'测试字幕'},
 ]}]};
 const jobs=[
  ['last',later],['missing',path.join(dataDir,'不存在.mp4')],['remote',null],['corrupt',bad],['original-first',video],
 ].map(([shotId,filePath])=>({id:'job-'+shotId,projectId:project.id,kind:'video',status:'success',shotId,filePath,url:'https://never-request.example.invalid/video.mp4'}));
 const media=[
  {id:'a',kind:'audio',shotId:'first',filePath:audio,offsetSeconds:0.25},
  {id:'b',kind:'audio',note:'[shot:original-first]',filePath:audio,offsetSeconds:0.5},
  {id:'c',kind:'audio',shotId:'last',filePath:audio,offsetSeconds:2.8},
  {id:'d',kind:'audio',shotId:'last',filePath:path.join(dataDir,'不存在.wav')},
 ];
 let probe,exit=0;
 try {
  probe=await createJianyingMediaProbe({BrowserWindow,dataDir});
  assert.deepEqual(await probe.read(video,'video'),{duration:3000000,width:320,height:180});
  assert.deepEqual(await probe.read(audio,'audio'),{duration:750000,width:0,height:0});
  assert.equal(await probe.read(outside,'video'),null);
  assert.equal(await probe.read(bad,'video'),null);
  const result=await exportJianyingDraft({project,jobs,media,selection:{episode:1},folder,dataDir,probe:probe.read,guard:async()=>{}});
  assert.ok(result.folder&&path.dirname(result.folder)===folder);
  assert.equal(result.shots,2);
  assert.equal(result.voices,3);
  assert.deepEqual(result.skipped,['1-2-3 素材缺失或无法读取','1-2-4 请先下载视频','1-2-5 素材缺失或无法读取','1-2-6 视频尚未生成']);
  assert.deepEqual(result.voiceNotes,['1-2-10 配音超出镜头，已按镜头长度截取','1-2-10 有配音尚未下载、不可读或超出镜头范围']);
  const content=JSON.parse(fs.readFileSync(path.join(result.folder,'draft_content.json'),'utf8'));
  const meta=JSON.parse(fs.readFileSync(path.join(result.folder,'draft_meta_info.json'),'utf8'));
  assert.equal(content.duration,6000000);
  assert.equal(meta.tm_duration,content.duration);
  assert.equal(meta.draft_id,content.id);
  assert.equal(meta.draft_fold_path,posixPath(result.folder));
  assert.deepEqual(content.canvas_config,{height:180,width:320,ratio:'original'});
  const [picture,voice0,voice1,captions]=content.tracks;
  assert.deepEqual(content.tracks.map(track=>track.type),['video','audio','audio','text']);
  assert.deepEqual(picture.segments.map(clip=>clip.target_timerange),[{start:0,duration:3000000},{start:3000000,duration:3000000}]);
  assert.deepEqual(voice0.segments.map(clip=>clip.target_timerange),[{start:250000,duration:750000},{start:5800000,duration:200000}]);
  assert.deepEqual(voice1.segments.map(clip=>clip.target_timerange),[{start:500000,duration:750000}]);
  assert.deepEqual(captions.segments.map(clip=>JSON.parse(content.materials.texts.find(text=>text.id===clip.material_id).content).text),['测试字幕','1-2-10']);
  const [firstClip,lastClip]=picture.segments.map(clip=>content.materials.videos.find(material=>material.id===clip.material_id));
  assert.equal(firstClip.path,posixPath(path.join(result.folder,'assets','1.mp4')));
  assert.equal(lastClip.path,posixPath(path.join(result.folder,'assets','3.mp4')));
  assert.ok(content.materials.audios.every(material=>material.path===posixPath(path.join(result.folder,'assets','2.wav'))));
  assert.deepEqual([firstClip.path,content.materials.audios[0].path,lastClip.path].map(digest),[before[0],before[2],before[1]]);
  assert.ok(!JSON.stringify({content,meta}).includes('never-request.example.invalid'));
  const empty=await exportJianyingDraft({project,jobs,media,selection:{shotId:'remote'},folder,dataDir,probe:probe.read,guard:async()=>{}});
  assert.deepEqual(empty,{shots:0,voices:0,skipped:['1-2-4 请先下载视频'],voiceNotes:[]});
  await assert.rejects(exportJianyingDraft({
   project,jobs,media,selection:{shotId:'first'},folder,dataDir,probe:probe.read,guard:async()=>{},
   beforePublish:async()=>{throw Error('隔离测试在发布前取消');},
  }),/隔离测试在发布前取消/);
  assert.deepEqual(fs.readdirSync(folder).sort(),['已有草稿.json',path.basename(result.folder)].sort());
  assert.deepEqual(sources.map(digest),before);
  console.log(JSON.stringify({durationMicroseconds:content.duration,canvas:content.canvas_config,videoClips:result.shots,voices:result.voices,
   voiceLanes:2,skipped:result.skipped.length,sourceAndExistingDraftPreserved:true,emptyAndCancelledDraftLeaveNoOutput:true}));
 } catch(error) {
  console.error(error);
  exit=1;
 } finally {
  probe?.close();
  app.exit(exit);
 }
});

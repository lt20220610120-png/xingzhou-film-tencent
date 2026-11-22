const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {exportProjectVideos}=require('./project-video-export.cjs');
test('an interrupted export stages bytes away from the final path and can be retried',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-pool-interrupted-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const mediaRoot=path.join(root,'media'),folder=path.join(root,'out');fs.mkdirSync(mediaRoot);fs.mkdirSync(folder);
 const filePath=path.join(mediaRoot,'source.mp4');fs.writeFileSync(filePath,'完整视频');
 const project={id:'p',name:'剧'},jobs=[{id:'a',projectId:'p',kind:'video',status:'success',episode:1,shotLabel:'1-1-1',filePath}];
 const options={project,jobs,ids:[{jobId:'a'}],media:[],mediaRoot,folder};
 const targetDir=path.join(folder,'剧','第1集'),dest=path.join(targetDir,'1-1-1-a.mp4');
 const failure=t.mock.method(fs.promises,'copyFile',async(_source,target)=>{
  await fs.promises.writeFile(target,'incomplete');
  throw Object.assign(Error('fixture interruption'),{code:'EIO'});
 });
 assert.equal((await exportProjectVideos(options)).completed,0);
 assert.deepEqual(fs.readdirSync(targetDir),[]);
 failure.mock.restore();
 assert.equal((await exportProjectVideos(options)).completed,1);
 assert.equal(fs.readFileSync(dest,'utf8'),'完整视频');
});
test('concurrent exports reuse identical complete bytes and never replace conflicting output',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-pool-concurrent-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const mediaRoot=path.join(root,'media'),folder=path.join(root,'out');fs.mkdirSync(mediaRoot);fs.mkdirSync(folder);
 const first=path.join(mediaRoot,'a.mp4'),second=path.join(mediaRoot,'b.mp4');
 fs.writeFileSync(first,'一号内容');fs.writeFileSync(second,'二号内容');
 const exportClip=(name,filePath)=>exportProjectVideos({project:{id:'p',name},jobs:[{id:'clip',projectId:'p',kind:'video',status:'success',episode:1,shotLabel:'1-1-1',filePath}],ids:[{jobId:'clip'}],media:[],mediaRoot,folder});
 const original=fs.promises.link;
 let ready=0,release,gate=new Promise(resolve=>release=resolve);
 t.mock.method(fs.promises,'link',async(from,to)=>{
  if(++ready===2)release();
  await gate;
  return original(from,to);
 });
 const same=await Promise.all([exportClip('相同',first),exportClip('相同',first)]);
 assert.deepEqual(same.map(result=>result.completed),[1,1]);
 ready=0;gate=new Promise(resolve=>release=resolve);
 const conflicting=await Promise.all([exportClip('冲突',first),exportClip('冲突',second)]);
 assert.equal(conflicting[0].completed+conflicting[1].completed,1);
 const finalDir=path.join(folder,'冲突','第1集'),filename='1-1-1-clip.mp4';
 assert.deepEqual(fs.readdirSync(finalDir),[filename]);
 assert.equal(fs.readFileSync(path.join(finalDir,filename),'utf8'),conflicting[0].completed?'一号内容':'二号内容');
});
test('scope downloads are project isolated, repeatable and preserve conflicting output',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-pool-'));try{const mediaRoot=path.join(dir,'media'),folder=path.join(dir,'out');fs.mkdirSync(mediaRoot);fs.mkdirSync(folder);const input=path.join(mediaRoot,'clip.mp4');fs.writeFileSync(input,'fixture');const jobs=[{id:'a',projectId:'p',kind:'video',status:'success',episode:2,shotLabel:'2-1-1',filePath:input},{id:'b',projectId:'other',kind:'video',status:'success',episode:1,filePath:input}];const options={project:{id:'p',name:'剧'},ids:[{jobId:'a'},{jobId:'b'}],jobs,media:[],folder,mediaRoot};
 let result=await exportProjectVideos(options);assert.equal(result.completed,1);assert.equal(result.errors.length,1);result=await exportProjectVideos({...options,ids:[{jobId:'a'}]});assert.equal(result.completed,1);const dest=path.join(folder,'剧','第2集','2-1-1-a.mp4');fs.writeFileSync(dest,'keep this');result=await exportProjectVideos({...options,ids:[{jobId:'a'}]});assert.equal(result.completed,0);assert.equal(fs.readFileSync(dest,'utf8'),'keep this');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('latest-only and all-result selections export the exact requested files once with published storyboard labels',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-pool-selection-'));try{
  const mediaRoot=path.join(dir,'media'),folder=path.join(dir,'out');fs.mkdirSync(mediaRoot);fs.mkdirSync(folder);
  const jobs=['old','new'].map(id=>{const filePath=path.join(mediaRoot,id+'.mp4');fs.writeFileSync(filePath,id);return {id,projectId:'p',kind:'video',status:'success',episode:1,shotId:'s',shotLabel:'outdated',filePath};});
  const options={project:{id:'p',name:'剧',episodes:[{storyboardPrompts:[{id:'s',label:'1-5-1'}]}]},jobs,media:[],folder,mediaRoot};
  let result=await exportProjectVideos({...options,ids:[{jobId:'new'}]});assert.equal(result.completed,1);const target=path.join(folder,'剧','第1集');assert.deepEqual(fs.readdirSync(target),['1-5-1-new.mp4']);assert.equal(fs.readFileSync(path.join(target,'1-5-1-new.mp4'),'utf8'),'new');
  result=await exportProjectVideos({...options,ids:[{jobId:'old'},{jobId:'new'},{jobId:'new'}]});assert.equal(result.completed,2);assert.deepEqual(result.errors,[]);assert.equal(fs.readFileSync(path.join(target,'1-5-1-old.mp4'),'utf8'),'old');
  jobs.push({...jobs[0],id:'legacy',shotId:undefined,shotLabel:'1-7-2'});result=await exportProjectVideos({...options,ids:[{jobId:'legacy'}]});assert.equal(result.completed,1);assert(fs.existsSync(path.join(target,'1-7-2-legacy.mp4')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

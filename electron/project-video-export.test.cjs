const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {exportProjectVideos}=require('./project-video-export.cjs');
test('scope downloads are project isolated, repeatable and preserve conflicting output',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-pool-'));try{const mediaRoot=path.join(dir,'media'),folder=path.join(dir,'out');fs.mkdirSync(mediaRoot);fs.mkdirSync(folder);const input=path.join(mediaRoot,'clip.mp4');fs.writeFileSync(input,'fixture');const jobs=[{id:'a',projectId:'p',kind:'video',status:'success',episode:2,shotLabel:'2-1-1',filePath:input},{id:'b',projectId:'other',kind:'video',status:'success',episode:1,filePath:input}];const options={project:{id:'p',name:'剧'},ids:[{jobId:'a'},{jobId:'b'}],jobs,media:[],folder,mediaRoot};
 let result=await exportProjectVideos(options);assert.equal(result.completed,1);assert.equal(result.errors.length,1);result=await exportProjectVideos({...options,ids:[{jobId:'a'}]});assert.equal(result.completed,1);const dest=path.join(folder,'剧','第2集','2-1-1-a.mp4');fs.writeFileSync(dest,'keep this');result=await exportProjectVideos({...options,ids:[{jobId:'a'}]});assert.equal(result.completed,0);assert.equal(fs.readFileSync(dest,'utf8'),'keep this');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

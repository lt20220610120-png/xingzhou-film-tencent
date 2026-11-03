const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runTopazGui}=require('./topaz-gui.cjs');
test('GUI runner stages an independent project and invokes the UI driver with scoped cancellation',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-gui-runner-'));
 try{
  const topaz=path.join(root,'Topaz Video.exe');for(const name of ['Topaz Video.exe','ffmpeg.exe','ffprobe.exe','input.mp4'])fs.writeFileSync(path.join(root,name),'fixture');
  let called=0;
  const result=await runTopazGui({config:{topazPath:topaz,upscaleFactor:4},input:path.join(root,'input.mp4'),info:{width:256,height:256,duration:1},directory:path.join(root,'xingzhou-topaz-test'),executeCommand:async(exe,args,options)=>{called++;assert(exe.endsWith('powershell.exe'));assert(args.includes('-ProjectPath'));assert(fs.existsSync(args[args.indexOf('-File')+1]));assert(!args[args.indexOf('-File')+1].includes('app.asar'));assert(args.includes('-CancelFile'));assert(options.cancelFile.startsWith(root));assert(!args.includes('-vf'));fs.writeFileSync(args[args.indexOf('-ExpectedOutput')+1],'output');}});
  assert.equal(called,1);assert.equal(result.width,1024);assert.equal(result.transport,'gui');assert.equal(fs.readFileSync(path.join(root,'input.mp4'),'utf8'),'fixture');
  await assert.rejects(runTopazGui({guard:async()=>{throw Error('工作流已停止');}}),/已停止/);
  const cancelled=path.join(root,'xingzhou-topaz-cancelled');let expected='';
  await assert.rejects(runTopazGui({config:{topazPath:topaz,upscaleFactor:2},input:path.join(root,'input.mp4'),info:{width:256,height:256,duration:1},directory:cancelled,executeCommand:async(exe,args)=>{expected=args[args.indexOf('-ExpectedOutput')+1];fs.writeFileSync(expected,'partial');throw Error('XINGZHOU_TOPAZ_CANCELLED');}}),/CANCELLED/);
  assert.equal(fs.existsSync(expected),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const execute=require('node:util').promisify(require('node:child_process').execFile);
const {createTopazGuiProject}=require('./topaz-gui-project.cjs');
const {topazComponents,topazEncoder}=require('./production-software.cjs');
let queue=Promise.resolve(),pending=0,testState=null;
function cancellingResult(){return {ready:false,code:'TOPAZ_TEST_CANCELLED',message:'已停止Topaz连接测试，原片未修改'};}
function cancelTopazTest(){if(testState){testState.cancelled=true;if(testState.cancelFile)fs.writeFileSync(testState.cancelFile,'stop');}return cancellingResult();}
function runTopazGui({config,input,info,directory,executeCommand=execute,guard=async()=>{},timeoutSeconds=28800,requireIdle=false,onReady=()=>{}}){
 if(requireIdle&&pending)return Promise.reject(Error('Topaz正在处理自动化任务，请等待该任务完成后测试'));pending++;
 const task=queue.catch(()=>{}).then(async()=>{
  let project;try{
   await guard();const components=topazComponents(config.topazPath);
   fs.mkdirSync(directory,{recursive:true});const source=path.join(directory,'source'+(path.extname(input)||'.mp4'));
   fs.copyFileSync(input,source,fs.constants.COPYFILE_EXCL);
   project=createTopazGuiProject({directory,input:source,info,factor:config.upscaleFactor});
   const cancelFile=path.join(directory,'cancel.request'),driver=path.join(directory,'xingzhou-topaz-driver.ps1');
   fs.writeFileSync(driver,fs.readFileSync(path.join(__dirname,'topaz-gui-driver.ps1')),{flag:'wx'});
   onReady(cancelFile);const powershell=path.join(process.env.WINDIR||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
   await guard();
   await executeCommand(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',driver,'-TopazPath',components.executable,'-ProjectPath',project.projectFile,'-ExpectedOutput',project.expectedOutput,'-CancelFile',cancelFile,'-TimeoutSeconds',String(timeoutSeconds)],{windowsHide:true,timeout:timeoutSeconds*1000+30000,maxBuffer:4*1024*1024,cancelFile});
   await guard();if(!fs.existsSync(project.expectedOutput)||!fs.statSync(project.expectedOutput).size)throw Error('Topaz界面未生成可验收超分文件');
   return {...project,transport:'gui',source};
  }catch(error){if(project?.expectedOutput)try{fs.unlinkSync(project.expectedOutput);}catch{}throw error;}
 });queue=task.finally(()=>{pending--;});return queue;
}
async function testTopazGui(config){
 if(testState)return {ready:false,message:'已有Topaz连接测试正在进行'};const state={cancelled:false,cancelFile:null};testState=state;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-topaz-'));
 try{
  const {ffmpeg,ffprobe}=topazComponents(config.topazPath),encoder=await topazEncoder(ffmpeg),input=path.join(root,'test.mp4');
  await execute(ffmpeg,['-hide_banner','-nostdin','-n','-f','lavfi','-i','testsrc2=size=256x256:rate=24:duration=1',...encoder.args,'-pix_fmt','yuv420p',input],{windowsHide:true,timeout:30000});
  const project=await runTopazGui({config,input,info:{width:256,height:256,duration:1,fps:24},directory:path.join(root,'xingzhou-topaz-'+crypto.randomUUID()),timeoutSeconds:90,requireIdle:true,guard:async()=>{if(state.cancelled)throw Error('连接测试已停止');},onReady:cancelFile=>{state.cancelFile=cancelFile;if(state.cancelled)fs.writeFileSync(cancelFile,'stop');}});
  const {stdout}=await execute(ffprobe,['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',project.expectedOutput],{windowsHide:true,timeout:30000});
  const data=JSON.parse(stdout),video=data.streams.find(s=>s.codec_type==='video');
  if(video?.width!==project.width||video?.height!==project.height||Math.abs(Number(data.format.duration)-1)>0.1)throw Error('Topaz界面输出尺寸或时长不符合设置');
  return {ready:true,transport:'gui',message:`Topaz界面真实Proteus测试通过：256×256 → ${project.width}×${project.height}，1秒输出已验收`};
 }catch(error){if(state.cancelled)return cancellingResult();return {ready:false,code:'TOPAZ_GUI_ATTENTION',message:'Topaz界面测试未完成：'+String(error.stderr||error.message).slice(-800)};}finally{if(testState===state)testState=null;}
}
module.exports={runTopazGui,testTopazGui,cancelTopazTest};

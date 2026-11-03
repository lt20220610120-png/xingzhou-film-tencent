const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
const file=value=>{try{return fs.statSync(value).isFile()?fs.realpathSync(value):'';}catch{return '';}};
const unique=values=>[...new Set(values.filter(Boolean).map(value=>path.normalize(value)))];
function topazComponents(executable){
 const app=file(executable);if(!app)throw Error('未找到 Topaz 软件，请自动检测或重新选择安装程序');
 const directory=path.dirname(app),ffmpeg=file(path.join(directory,'ffmpeg.exe')),ffprobe=file(path.join(directory,'ffprobe.exe'));
 if(!ffmpeg||!ffprobe)throw Error('Topaz 安装不完整：缺少随附的 FFmpeg/FFprobe 组件，请修复或重新安装 Topaz');
 return {executable:app,directory,ffmpeg,ffprobe};
}
function openFilmComponents(executable){
 const app=file(executable);if(!app)throw Error('未找到 OpenFilm 软件，请自动检测或重新选择安装程序');
 const roots=[path.join(path.dirname(app),'resources','app.asar.unpacked','node_modules','openfilm'),path.join(path.dirname(app),'resources','app','node_modules','openfilm')];
 const root=roots.find(candidate=>file(path.join(candidate,'bin','openfilm.mjs'))&&file(path.join(candidate,'MANUAL.md')));
 if(!root)throw Error('当前 OpenFilm 版本没有受支持的工程与渲染接口，请更新 OpenFilm 后重试');
 return {executable:app,root,manual:path.join(root,'MANUAL.md'),cli:path.join(root,'bin','openfilm.mjs')};
}
async function registeredLocations(run=execute){
 const roots=['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'],locations=[];
 for(const root of roots)try{const {stdout}=await run('reg.exe',['query',root,'/s'],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});for(const block of stdout.split(/\r?\n\r?\n/)){if(!/DisplayName\s+REG_SZ\s+.*(?:Topaz Video|OpenFilm)/i.test(block))continue;for(const match of block.matchAll(/(?:InstallLocation|DisplayIcon)\s+REG(?:_SZ|_EXPAND_SZ)\s+([^\r\n]+)/gi)){const raw=match[1].trim(),icon=raw.match(/^(?:"([^"]+\.exe)"|([^",]+\.exe))(?:,\d+)?$/i);let value=icon?path.dirname(icon[1]||icon[2]):raw.replace(/^"|"$/g,'');if(value)locations.push(value);}}}catch{}
 return locations;
}
async function discoverSoftware({env=process.env,home=os.homedir(),run=execute}={}){
 const programFiles=env.ProgramFiles||'C:/Program Files',local=env.LOCALAPPDATA||path.join(home,'AppData','Local'),locations=(await registeredLocations(run)).map(value=>value.replace(/%([^%]+)%/g,(_,key)=>env[key]||'')).map(value=>file(value)?path.dirname(value):value);
 const topaz=unique([...locations.map(directory=>path.join(directory,'Topaz Video.exe')),path.join(programFiles,'Topaz Labs LLC','Topaz Video','Topaz Video.exe'),path.join(programFiles,'Topaz Labs LLC','Topaz Video AI','Topaz Video AI.exe'),path.join(local,'Programs','Topaz Video','Topaz Video.exe'),'D:/Topaz Video/Topaz Video.exe']).map(file).filter(Boolean);
 const openfilm=unique([...locations.map(directory=>path.join(directory,'OpenFilm.exe')),path.join(local,'Programs','OpenFilm','OpenFilm.exe'),'D:/Openfilm/OpenFilm.exe']).map(file).filter(Boolean);
 const result={};if(topaz[0])result.topazPath=topaz[0];if(openfilm[0])result.openFilmPath=openfilm[0];return result;
}
async function checkTopaz(executable,run=execute){
 const components=topazComponents(executable),result=await run(components.ffmpeg,['-hide_banner','-h','filter=tvai_up'],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});
 if(!`${result.stdout||''}\n${result.stderr||''}`.includes('tvai_up AVOptions'))throw Error('当前 Topaz 版本没有受支持的 AI 超分滤镜，请更新或修复 Topaz');
 return components;
}
async function topazEncoder(executable,run=execute){
 const result=await run(executable,['-hide_banner','-encoders'],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024}),available=`${result.stdout||''}\n${result.stderr||''}`;
 const name=['libx264','h264_nvenc','h264_qsv','h264_amf','h264_mf'].find(candidate=>new RegExp(`(?:^|\\s)${candidate}(?:\\s|$)`,'m').test(available));
 if(!name)throw Error('当前 Topaz 缺少受支持的 H.264 编码器，请修复或重新安装 Topaz');
 const args=name==='libx264'?['-c:v',name,'-crf','18']:name==='h264_nvenc'?['-c:v',name,'-cq','18']:['-c:v',name];
 return {name,args};
}
const topazSetupError=message=>Object.assign(Error(message),{code:'TOPAZ_SETUP_REQUIRED'});
function productionSoftwareError(error){
 const message=String(error?.message||error),detail=String(error?.stderr||''),output=String(error?.stdout||''),diagnostic=`${message}\n${detail}\n${output}`;
 if(/parseAuth[^\r\n]*(?:null|fail|invalid|expired)|unauthorized|licen[cs]e[^\r\n]*(?:expired|invalid|fail)|授权|过期|activation failed/i.test(diagnostic))return topazSetupError('Topaz AI 授权不可用或已过期。请在 Topaz 中登录或续期，行舟影视会自动复查；原片及已验收成果均已保留，未改用普通放大冒充 AI 超分。');
 if(/No filtered frames/i.test(diagnostic)&&[3221225477,-1073741819].includes(Number(error?.code)))return topazSetupError('Topaz AI 未产出画面，授权或模型组件可能不可用。请在 Topaz 中确认登录、授权和 Proteus 模型，行舟影视会自动复查；原片及已验收成果均已保留，未改用普通放大冒充 AI 超分。');
 if(/Model not found|No filtered frames/i.test(diagnostic))return topazSetupError('Topaz AI 超分模型或组件不可用。请在 Topaz 中修复 Proteus 模型，行舟影视会自动复查；未改用普通放大冒充 AI 超分。');
 return error instanceof Error?error:Error(message);
}
module.exports={discoverSoftware,topazComponents,openFilmComponents,checkTopaz,topazEncoder,productionSoftwareError,registeredLocations};

function topazFilter(config,width,height){
 const factor=Number(config.upscaleFactor),device=String(config.topazDevice??'-2'),estimate=Number(config.topazEstimate??8);
 if(![2,4].includes(factor))throw Error('超分倍率应为2或4');
 if(!['-2','-1','0','1'].includes(device))throw Error('请选择有效的Topaz处理设备');
 if(![0,8,20].includes(estimate))throw Error('请选择有效的Proteus自动估计帧数');
 return `tvai_up=model=prob-4:scale=${factor}:estimate=${estimate}:device=${device},scale=${width*factor}:${height*factor}`;
}
async function testTopaz(config,{run=execute}={}){
 const components=topazComponents(config.topazPath),filter=topazFilter(config,256,256);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-topaz-test-'));
 const input=path.join(directory,'input.mp4'),output=path.join(directory,'enhanced.mp4');
 const options={cwd:components.directory,windowsHide:true,timeout:90000,maxBuffer:4*1024*1024,env:{...process.env,TVAI_MODEL_DIR:path.join(components.directory,'models'),TVAI_MODEL_DATA_DIR:path.join(components.directory,'models')}};
 try{
  const encoder=await topazEncoder(components.ffmpeg,run);
  await run(components.ffmpeg,['-hide_banner','-nostdin','-y','-f','lavfi','-i','testsrc2=size=256x256:rate=24:duration=1',...encoder.args,'-pix_fmt','yuv420p',input],options);
  await run(components.ffmpeg,['-hide_banner','-nostdin','-n','-i',input,'-vf',filter,...encoder.args,'-pix_fmt','yuv420p',output],options);
  const {stdout}=await run(components.ffprobe,['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',output],options);
  const data=JSON.parse(stdout),video=data.streams?.find(v=>v.codec_type==='video'),size=256*Number(config.upscaleFactor);
  if(video?.width!==size||video?.height!==size||Number(data.format?.duration)<0.8||!fs.statSync(output).size)throw Error('Topaz未产出可验收的AI超分文件');
  return {ready:true,message:`真实Proteus超分通过：256×256 → ${size}×${size}，1秒测试片已验收`,filter,encoder:encoder.name};
 }catch(error){const failure=productionSoftwareError(error);return {ready:false,code:failure.code||'TOPAZ_TEST_FAILED',message:failure.code?failure.message:'Topaz真实超分测试失败，请检查授权、模型、设备或编码器。',filter};}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
}
module.exports.topazFilter=topazFilter;
module.exports.testTopaz=testTopaz;

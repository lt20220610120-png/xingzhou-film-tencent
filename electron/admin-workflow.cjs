const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const safe=value=>String(value||'未命名').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,90)||'未命名';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function createWorkflowEngine({root,authorize,prepare,submit,refresh,listJobs,mediaRoot,clock=()=>Date.now()}){
 const runs=new Map(),busy=new Set();fs.mkdirSync(root,{recursive:true});
 const file=id=>path.join(root,`${id}.json`);
 const save=run=>{run.updatedAt=new Date(clock()).toISOString();fs.writeFileSync(file(run.id)+'.tmp',JSON.stringify(run));fs.renameSync(file(run.id)+'.tmp',file(run.id));return run;};
 for(const name of fs.readdirSync(root).filter(n=>/^[a-f0-9-]+\.json$/.test(n))){const run=JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));if(run.status==='running'){run.status='paused';run.message='软件重新启动，请检查后继续；原任务不会重复提交';}runs.set(run.id,run);}
 const owner=async()=>{const a=await authorize();if(!a?.id||a.isAdmin!==true||a.banned)throw Error('仅有效管理员可使用工作流');return String(a.id);};
 const get=async id=>{const accountId=await owner(),run=runs.get(id);if(!run||run.accountId!==accountId)throw Error('找不到当前管理员的工作流');return run;};
 const publicRun=run=>{const {book,...out}=run;return structuredClone(out);};
 async function guard(run){try{if(await owner()!==run.accountId)throw Error('管理员已切换，工作流已暂停');}catch(error){run.status='paused';save(run);throw error;}if(run.status!=='running')throw Error('工作流已暂停');}
 function publishEpisodes(run){
  for(const episode of [...new Set(run.items.map(i=>i.episode))]){
   const items=run.items.filter(i=>i.episode===episode);
   if(!items.every(i=>i.status==='downloaded'))continue;
   const ep=run.episodes.find(e=>e.number===episode);if(ep?.ready)continue;
   const directory=path.join(run.outputDir,'原始素材',`第${episode}集`);
   const manifest={schema:1,runId:run.id,episode,stage:'awaiting-upscale',target:{width:run.settings.ratio==='9:16'?1080:1920,height:run.settings.ratio==='9:16'?1920:1080},settings:run.settings.post,clips:items.map((i,index)=>({order:index+1,entryId:i.id,label:i.label,file:i.outputFile,sha256:i.sha256})),upscaledDirectory:path.join(run.outputDir,'超分素材',`第${episode}集`),finalDirectory:path.join(run.outputDir,'成片')};
   fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(manifest.upscaledDirectory,{recursive:true});fs.mkdirSync(manifest.finalDirectory,{recursive:true});
   const manifestFile=path.join(directory,'本集处理清单.json');fs.writeFileSync(manifestFile+'.tmp',JSON.stringify(manifest,null,2));fs.renameSync(manifestFile+'.tmp',manifestFile);
   run.episodes.push({number:episode,ready:true,stage:'awaiting-upscale',manifestFile});save(run);
  }
 }
 function download(run,item,job){
  if(!job.filePath)throw Error('任务完成但没有本地视频，等待原任务下载');
  const source=fs.realpathSync(job.filePath),base=fs.realpathSync(mediaRoot()),rel=path.relative(base,source);
  if(rel.startsWith('..')||path.isAbsolute(rel)||!rel||!fs.statSync(source).isFile()||!fs.statSync(source).size)throw Error('生成视频文件不在本机素材目录或文件为空');
  const ext=path.extname(source).toLowerCase();if(!['.mp4','.mov','.webm'].includes(ext))throw Error('结果不是支持的视频文件');
  const directory=path.join(run.outputDir,'原始素材',`第${item.episode}集`);fs.mkdirSync(directory,{recursive:true});
  const order=String(run.items.filter(i=>i.episode===item.episode).findIndex(i=>i.id===item.id)+1).padStart(4,'0');
  const dest=path.join(directory,`${order}-${safe(item.label)}-${safe(item.id).slice(-12)}${ext}`),digest=hash(source);
  if(fs.existsSync(dest)){if(hash(dest)!==digest)throw Error('目标视频已存在且内容不同，已保留文件');}
  else {fs.copyFileSync(source,dest+'.partial');if(hash(dest+'.partial')!==digest)throw Error('视频复制校验失败');fs.renameSync(dest+'.partial',dest);}
  Object.assign(item,{status:'downloaded',outputFile:dest,sha256:digest,error:''});save(run);publishEpisodes(run);
 }
 async function tick(id){
  if(busy.has(id))return;const run=runs.get(id);if(!run||run.status!=='running')return;busy.add(id);
  try{
   await guard(run);
   const item=run.items.find(i=>['queued','preparing','submitting','submitted','downloading'].includes(i.status));
   if(!item){run.status=run.items.every(i=>i.status==='downloaded')?'awaiting-post':'needs-attention';run.message=run.status==='awaiting-post'?'本剧原始视频已齐全，等待超分与剪辑接入':'有待处理条目，其余可运行条目已完成';save(run);return;}
   if(['queued','preparing'].includes(item.status)){
    item.status='preparing';run.message=`AI 检查与准备 ${item.label}`;save(run);
    const input=await prepare(run,item,()=>guard(run),()=>save(run));await guard(run);
    item.status='submitting';save(run); // durable before any paid request
    try{const job=await submit({...input,workflowRunId:run.id,workflowItemId:item.id});item.jobId=job.id;item.status='submitted';save(run);}
    catch(error){const job=listJobs().find(j=>j.workflowRunId===run.id&&j.workflowItemId===item.id);item.jobId=job?.id;item.status=job?'submitted':'uncertain';item.error='提交结果需要核对，不自动重发：'+error.message;save(run);}
   }
   if(item.status==='submitting'){
    const job=listJobs().find(j=>j.workflowRunId===run.id&&j.workflowItemId===item.id);
    if(job){item.jobId=job.id;item.status='submitted';}else{item.status='uncertain';item.error='提交期间中断，未找到原任务记录；请人工核对上游，不自动重发';}save(run);
   }
   if(['submitted','downloading'].includes(item.status)){
    await guard(run);let job=listJobs().find(j=>j.id===item.jobId);
    if(!job){item.status='uncertain';item.error='原任务记录不存在，停止该条';save(run);return;}
    if(!['success','failed','uncertain'].includes(job.status)&&(!job.nextPollAt||job.nextPollAt<=clock()))job=await refresh(job,run);
    await guard(run);
    if(job.status==='success')download(run,item,job);
    else if(['failed','uncertain'].includes(job.status)){item.status=job.status;item.error=job.error||job.warning||'原任务需要核对';save(run);}
    else{item.status='submitted';run.message=`等待 ${item.label} 的原生成任务`;save(run);}
   }
  }catch(error){
   const item=run.items.find(i=>i.status==='preparing');
   if(run.status==='running'&&item){item.status='blocked';item.error=error.message;}
   else if(run.status==='running'){run.status='paused';}
   run.message=error.message;save(run);
  }finally{busy.delete(id);}
 }
 return {
  async list(){const id=await owner();return [...runs.values()].filter(r=>r.accountId===id).map(publicRun);},
  async create({book,settings,outputRoot}){
   const accountId=await owner();if(!book?.entries?.length)throw Error('请先准备整本提示词与素材');
   if(new Set(book.entries.map(e=>e.id)).size!==book.entries.length||book.entries.some(e=>typeof e.id!=='string'||!e.id||!Number.isInteger(e.episode)||e.episode<1))throw Error('提示词编号或集数无效');
   if(!['auto','semi'].includes(settings.mode)||!settings.profileId||!settings.model||!settings.aiProfileId)throw Error('请选择模式、生成模型和 AI 模型');
   if(settings.mode==='semi'&&settings.humanConfirmed!==true)throw Error('半自动模式须先核对提示词与图片');
   if(book.importedBinding&&book.importedBinding.accountId!==accountId)throw Error('提示词属于其他账号');
   const id=crypto.randomUUID(),outputDir=path.join(fs.realpathSync(outputRoot),`${safe(book.name)}-${id.slice(0,8)}`);
   const run={id,accountId,book:structuredClone(book),name:book.name,bookId:book.id,settings,outputDir,status:'paused',message:'设置已保存，点击开始后将调用所选 AI 与视频接口',createdAt:new Date(clock()).toISOString(),items:book.entries.map(e=>({id:e.id,label:e.label,episode:e.episode,scene:e.scene,status:'queued'})),episodes:[]};
   runs.set(id,run);save(run);return publicRun(run);
  },
  async action({id,action,itemId}){const run=await get(id);if(action==='start'){run.status='running';run.message='工作流已启动';}else if(action==='pause'){run.status='paused';run.message='已暂停，已提交的上游任务仍保留';}else if(action==='retry'){const item=run.items.find(i=>i.id===itemId);if(!item||item.status!=='blocked')throw Error('仅生成前被拦截的条目可重新检查；已提交项不能自动重发');item.status='queued';item.error='';}else throw Error('未知操作');save(run);return publicRun(run);},
  pauseAll(){for(const run of runs.values())if(run.status==='running'){run.status='paused';run.message='身份或环境变化，已暂停';save(run);}},
  async pump(){for(const run of runs.values())if(run.status==='running')await tick(run.id);},tick,
  async output(id){return (await get(id)).outputDir;}
 };
}
module.exports={createWorkflowEngine};

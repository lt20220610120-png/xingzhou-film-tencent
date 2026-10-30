import {parseDirectorScenes,inferDirectorEpisodeNumber} from './scriptImport.js';
import {profileModels} from './videoCatalog.js';
import {generationMediaProfiles} from './canvasStore.js';
import {normalizeCapabilities} from './modelCapabilities.js';
import {effectiveEditingInstruction} from './editingPresets.js';
import {videoPolicyIssues} from './productionVideoPolicy.js';
export function productionVideoIssues(c,state){
 let selected;try{selected=JSON.parse(c.videoModel);}catch{return ['请选择有效的视频模型'];}
 const p=generationMediaProfiles(state,'video').find(p=>p.id===selected[0]),model=p&&profileModels(p,'video').find(m=>m.id===selected[1]);if(!model)return ['所选视频模型已不存在'];
 const caps=normalizeCapabilities(model),issues=[],duration=Number(c.videoDuration);
 if(caps.durations?.length&&!caps.durations.includes(duration)||caps.durationByResolution?.[c.videoResolution]?.length&&!caps.durationByResolution[c.videoResolution].includes(duration))issues.push('视频时长不在所选模型/分辨率的支持范围');
 if(caps.ratios?.length&&!caps.ratios.includes(c.ratio))issues.push('视频画幅不在所选模型的支持范围');
 if(caps.resolutions?.length&&!caps.resolutions.includes(c.videoResolution))issues.push('视频分辨率不在所选模型的支持范围');
 return [...issues,...videoPolicyIssues(c,value=>productionVideoIssues(value,state))];
}
export const PRODUCTION_STAGES=[['prompts','剧本与提示词'],['art','美术清单与关联'],['images','美术图片'],['videos','视频生成与归档'],['upscale','逐集超分'],['edit','剪辑成片']];
export function productionDefaults(){return {mode:'auto',style:'真人电影级',ratio:'9:16',maxDuration:32,promptProfileId:'',promptSkillId:'',analysisProfileId:'',artStyle:'AI真人',composition:'portrait-four',imageModel:'',fallbackImageModel:'',imageAttempts:2,imageConcurrency:2,imageRatio:'16:9',videoModel:'',videoDuration:30,videoResolution:'480p',videoConcurrency:2,videoAttempts:2,videoFallbackEnabled:false,fallbackVideoModel:'',fallbackVideoAttempts:2,agentPath:'',agentProtocol:'codex',agentModel:'',agentEffort:'high',topazPath:'',upscaleFactor:2,openFilmPath:'',editAgentPath:'',editAgentProtocol:'codex',editModel:'',editPreset:'default',editMarket:'domestic',tailFrameMode:'default',tailFramePath:'',editInstruction:'',musicFolder:'',soundFolder:'',voiceFolder:'',outputRoot:'',endStage:'edit',humanConfirmed:false};}
export function productionIssues(c,{project,models=[],profiles=[],skills=[]}={}){
 const issues=[];if(!project?.episodes?.some(e=>e.kind!=='setting'))issues.push('请上传剧本或选择导演项目');
 if(!c.outputRoot)issues.push('请选择项目输出目录');
 if(!c.agentPath||!c.agentModel)issues.push('请连接制作 Agent 并选择模型');
 if(c.mode==='auto'){
  if(!profiles.some(p=>p.id===c.promptProfileId))issues.push('请选择提示词模型');
  if(!skills.some(s=>s.id===c.promptSkillId))issues.push('请选择导演提示词 Skill');
  if(!profiles.some(p=>p.id===c.analysisProfileId))issues.push('请选择美术分析模型');
  if(!models.some(m=>m.id===c.imageModel))issues.push('请选择生图主模型');
  if(!models.some(m=>m.id===c.fallbackImageModel))issues.push('请选择生图备用模型');
 }
 if(c.mode==='semi'&&!c.humanConfirmed)issues.push('请确认提示词与图片关联已经人工核对');
 if(!c.videoModel)issues.push('请选择视频渠道与模型');
 if(![2,4].includes(Number(c.upscaleFactor)))issues.push('超分倍率请选择 2 倍或 4 倍');
 if(c.endStage!=='archive'&&!c.topazPath)issues.push('请选择 Topaz 软件');
 if(c.endStage==='edit'&&(!c.openFilmPath||!c.editAgentPath||!c.editModel||!effectiveEditingInstruction(c)))issues.push('请设置剪辑软件、Agent、模型及每集剪辑指令');
 if(c.endStage==='edit'&&c.tailFrameMode==='custom'&&!c.tailFramePath)issues.push('请选择指定尾帧文件，或改用默认伪帧');
 if(!(Number(c.maxDuration)>0&&Number(c.maxDuration)<=35))issues.push('最高分段时长应在 1–35 秒之间');
 if(!(Number(c.videoDuration)>0&&Number(c.videoDuration)<=3600))issues.push('视频生成时长无效');
 for(const k of ['imageConcurrency','videoConcurrency','imageAttempts'])if(!Number.isInteger(Number(c[k]))||c[k]<1||c[k]>8)issues.push('并发和尝试次数应在 1–8 之间');
 return issues;
}
export function productionCoverage(project){
 const episodes=(project?.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传');
 return episodes.map((ep,i)=>{const number=inferDirectorEpisodeNumber(ep,i+1),scenes=parseDirectorScenes(ep.content||'',number);return {id:ep.id,number,scenes:scenes.map(s=>({label:s.label,count:(ep.prompts||[]).filter(p=>String(p.label||'').startsWith(s.label+'-')&&p.content?.trim()).length})),prompts:(ep.prompts||[]).filter(p=>p.content?.trim()).length};});
}
export function productionExpectedPrompts(project){
 const prompts=(project.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传').flatMap(e=>e.prompts||[]),latest=new Map();
 for(const p of prompts)if(p.generationRunId)latest.set(String(p.label).split('-').slice(0,2).join('-'),p.generationRunId);
 return prompts.filter(p=>{const scene=String(p.label).split('-').slice(0,2).join('-');return !latest.has(scene)||latest.get(scene)===p.generationRunId;});
}
export function imageFailureKind(error,pending){
 if(pending||/超时|timeout|network|socket|ECONN|提交.*不明/i.test(error?.message||error))return 'uncertain';
 const message=String(error?.message||error);
 if(/content.policy|moderation|safety|内容.*(拒绝|审核)|安全策略/i.test(message))return 'content';
 if(/余额|quota|billing|401|403|api.key|credential/i.test(message))return 'configuration';
 if(/429|限流|rate.limit/i.test(message))return 'rate-limit';
 return 'failed';
}
export const completeEpisode=(expected,clips)=>expected.length>0&&new Set(expected).size===expected.length&&expected.every(id=>clips.some(c=>c.id===id&&c.status==='downloaded'&&c.outputFile&&c.sha256));

/** A view-independent coordinator. Every side effect gets a durable checkpoint first. */
export function createProductionController({load,save,adapters,onChange=()=>{}}){
 let runs=[],ready=false,loadError='';const active=new Map(),chatting=new Set();
 const emit=()=>onChange(runs);
 let writes=Promise.resolve();
 const persist=async run=>{run.updatedAt=Date.now();const snapshot=structuredClone(run);const writing=writes.then(()=>save(snapshot));writes=writing.catch(()=>{});await writing;emit();};
 const guard=run=>{if(run.status!=='running')throw Error('工作流已暂停');};
 async function execute(run){
   const log=async(text,kind='agent')=>{run.logs=[...(run.logs||[]),{id:crypto.randomUUID(),at:Date.now(),kind,text}].slice(-500);await persist(run);};
   const ctx={run,guard:()=>guard(run),checkpoint:()=>persist(run),log,notice:async text=>{run.message=text;await log(text);}};
  try{
    await log('已接管制作任务，先读取当前项目状态。');
   let recoveryRound=0;while(true){
   try{await adapters.validate?.(ctx);guard(run);if(run.stageErrors)delete run.stageErrors.validation;}catch(error){guard(run);if(!adapters.recover)throw error;run.stageErrors={...run.stageErrors,validation:error.message};await log('前置目标待修复：'+error.message,'warning');}
   if(adapters.monitor){
    try{const facts=await adapters.monitor(ctx);guard(run);for(const key of ['prompts','art','images'])if(typeof facts[key]==='boolean'){
     run.stages[key]={status:facts[key]?'done':'pending',detectedAt:Date.now()};
     if(facts[key]&&run.stageErrors)delete run.stageErrors[key];
    }if(facts.art)run.artWarnings=[];if(facts.images)run.imageErrors=[];await persist(run);
    }catch(error){guard(run);await log(`监测暂未完成：${error.message}；保留原成果，按原任务凭据接续。`,'warning');}
   }
   for(const stage of ['prompts','art','images']){
    guard(run);if(run.stages[stage]?.status==='done'||run.config.mode==='semi')continue;
     run.stages[stage]={status:'running'};await log(`开始执行：${PRODUCTION_STAGES.find(([key])=>key===stage)?.[1]||stage}`);
     let result;
     try{result=await adapters[stage](ctx);if(run.stageErrors)delete run.stageErrors[stage];}catch(error){if(run.status!=='running')throw error;run.stageErrors={...(run.stageErrors||{}),[stage]:error.message};await log(`${PRODUCTION_STAGES.find(([key])=>key===stage)?.[1]||stage}出现问题：${error.message}；保留当前结果并继续后续阶段。`,'error');result={partial:true};}
     guard(run);run.stages[stage]={status:result?.partial?'partial':'done'};await persist(run);
     if(stage==='prompts')delete ctx.artSnapshot;
     await log(`${PRODUCTION_STAGES.find(([key])=>key===stage)?.[1]||stage}${result?.partial?'存在待处理项，已继续后续阶段':'已完成'}。`,result?.partial?'warning':'success');
   }
   guard(run);try{await adapters.videos(ctx);if(run.stageErrors)delete run.stageErrors.videos;}catch(error){guard(run);if(!adapters.recover)throw error;run.stageErrors={...run.stageErrors,videos:error.message};await log('视频前置目标待修复：'+error.message,'warning');}
   guard(run);run.status=run.episodes.length&&run.episodes.every(e=>e.stage==='done')&&!Object.values(run.stages).some(s=>s.status==='partial')&&!Object.keys(run.stageErrors||{}).length?'done':'attention';
    if(run.status==='done'||!adapters.recover){run.message=run.status==='done'?'全部分集已完成并核验输出':'其余可运行工作已结束，请处理提示的问题';await log(run.message,run.status==='done'?'success':'warning');await persist(run);break;}
    run.status='running';guard(run);let recovery;try{recovery=await adapters.recover(ctx);}catch(error){guard(run);await log('Agent 修复暂未完成，保留目标并稍后重试：'+error.message,'warning');recovery={retry:true,delay:60000};}
    guard(run);if(recovery?.budget){run.status='waiting-budget';run.message=recovery.reason||'生成渠道余额不足，成果已保存，充值后点击继续';await log(run.message,'warning');await persist(run);break;}
    recoveryRound++;const delay=recovery?.delay??Math.min(300000,5000*2**Math.min(recoveryRound,6));run.recovery={...run.recovery,round:recoveryRound,nextAt:Date.now()+delay};run.message=delay?'目标尚未完成，Agent 已安排下一轮接续':'修复已完成，正在验证并接续';await persist(run);
    if(adapters.waitForRecovery)await adapters.waitForRecovery(delay,ctx);else {let remaining=delay;while(remaining>0){guard(run);const step=Math.min(1000,remaining);await new Promise(r=>setTimeout(r,step));remaining-=step;}}
    guard(run);delete ctx.artSnapshot;delete ctx.collabSnapshot;
   }
  }catch(e){if(run.status==='paused'){run.message='已暂停；完成成果和在途任务已保留，下次只接续缺项';await log(run.message,'info');}else{if(run.status==='running')run.status='attention';run.message=e.message;await log(`流程提示：${e.message}`,'error');}await persist(run);}
 }
 const controller={
  get loadError(){return loadError;},
  snapshot:()=>runs,
  async restore(){if(ready)return;try{runs=await load();for(const run of runs){if(run.status==='running'){run.status='paused';run.message='软件已重启，检查后继续；原任务记录保留';await persist(run);}}ready=true;loadError='';emit();}catch(e){loadError=e.message;emit();throw e;}},
  async create(projectId,config){const run={id:crypto.randomUUID(),projectId,config:structuredClone(config),status:'paused',message:'准备完成，可以开始',stages:{},episodes:[],items:[],logs:[],createdAt:Date.now()};runs.unshift(run);await persist(run);return run;},
  async start(id){const run=runs.find(r=>r.id===id);if(!run||active.has(id))return;if(run.status==='done')return;active.set(id,true);try{run.status='running';await persist(run);return await execute(run);}finally{active.delete(id);}},
  async refresh(id){const run=runs.find(r=>r.id===id);if(!run)throw Error('任务不存在');if(active.has(id))throw Error('运行时自动监测，请暂停并等待当前操作结束后刷新');if(!adapters.monitor)return;active.set(id,true);try{const result=await adapters.monitor({run,readOnly:true,guard:()=>{},checkpoint:()=>persist(run),log:async()=>{}});if(run.status==='done'&&(Object.values(result).some(v=>v===false)||run.monitor?.files?.invalidItems?.length||run.monitor?.files?.invalidEpisodes?.length)){run.status='attention';run.message='监测发现缺项，已保留原成果，点击继续接续';}await persist(run);return result;}catch(error){if(run.status==='done'){run.status='attention';run.message='监测暂未完成，已保留成果，请重试检查';await persist(run);}throw error;}finally{active.delete(id);}},
  async bindProject(id,projectId){const run=runs.find(r=>r.id===id);if(!run)throw Error('任务不存在');if(active.has(id)||run.status==='running')throw Error('请先暂停并等待当前操作结束再切换项目');if(run.items.length||run.videoSourceSignature)throw Error('任务已有视频提交记录，保留原项目，请创建新流程改选');await adapters.selectCollab(run,projectId);if(active.has(id)||run.status==='running'||run.items.length||run.videoSourceSignature)throw Error('任务状态已改变，请暂停后重试');run.collabProjectId=projectId;run.config.collabProjectId=projectId;delete run.stages.art;delete run.stages.images;await persist(run);},
  async saveRule(id,text){const run=runs.find(r=>r.id===id);if(!run||!String(text||'').trim()||text.length>8000)throw Error('请填写要保存的流程规则');run.config.workflowRules=String(text).trim();await persist(run);},
  async updateVideoPolicy(id,value){const run=runs.find(r=>r.id===id);if(!run)throw Error('任务不存在');if(active.has(id)||run.status==='running')throw Error('请先暂停并等待当前操作结束');const patch=Object.fromEntries(['videoAttempts','videoFallbackEnabled','fallbackVideoModel','fallbackVideoAttempts'].map(k=>[k,value[k]])),next={...run.config,...patch};const issues=videoPolicyIssues(next);if(issues.length)throw Error(issues.join('；'));await adapters.validateVideoPolicy?.(next);if(active.has(id)||run.status==='running')throw Error('任务正在运行，请先暂停');run.config=next;delete run.recovery?.nextAgentAt;run.message='视频失败接续策略已保存；已提交原任务继续监测，点击继续仅处理缺项';await persist(run);},
  async chat(id,{text,model}){const run=runs.find(r=>r.id===id);if(!run)throw Error('任务不存在');if(chatting.has(id))throw Error('Agent 正在回复，请稍候');if(!String(text||'').trim()||text.length>8000)throw Error('请输入 1—8000 字指令');chatting.add(id);
   const add=async(role,message)=>{run.conversation=[...(run.conversation||[]),{id:crypto.randomUUID(),at:Date.now(),role,text:message}].slice(-200);await persist(run);};
   try{const history=(run.conversation||[]).slice(-16);await add('user',text);const response=await adapters.chat(run,{text,model,history});await add('assistant',response.reply);let result='';
    if(response.action==='pause'){await controller.pause(id);result='已暂停新任务派发。';}
    else if(response.action==='select_collab'){await controller.bindProject(id,response.projectId);result=`已改用协作项目 ${response.projectId}，点击继续接续。`;}
    else if(response.action==='refresh'||response.action==='continue'){
     if(active.has(id))result='任务正在运行，指令已记录；可暂停后重新读取接续。';
     else if(run.status==='done')result='任务已经完成，保留已完成结果。';
     else{await add('system','已接受接续指令，重新读取现有项目并执行未完成阶段。');void controller.start(id).catch(()=>{});}
    }
    if(result)await add('system',result);return response;
   }catch(error){await add('system',`指令未完成：${error.message}`);throw error;}finally{chatting.delete(id);}
  },
  async pause(id){const run=runs.find(r=>r.id===id);if(!run)return;run.status='paused';run.message='已暂停派发新任务，已提交任务仍保留';await persist(run);await adapters.pause?.(run);},
  async pauseAll(){for(const run of runs)if(run.status==='running'){run.status='paused';await persist(run);await adapters.pause?.(run);}},
 };return controller;
}

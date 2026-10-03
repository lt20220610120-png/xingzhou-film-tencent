const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Evaluate the actual IPC handler, not a separately mocked serializer. The
// request remains local and never loads Electron or forwards to a provider.
function ipcBridge(requestText){
 const handlers=new Map();
 const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
 const source=main.slice(main.indexOf('const activeAiRequests='),main.indexOf('const analysisStore='));
 vm.runInNewContext(source,{requestText,AbortController,ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)}});
 return payload=>handlers.get('ai-chat')(null,payload);
}

test('desktop result envelopes retain classified errors and paid partial text without copying internal details',async()=>{
 const bridge=ipcBridge(async()=>{throw Object.assign(new Error('号池限流，已保留进度'),{code:'RATE_LIMITED',partialText:'部分正文',apiKey:'private-must-not-cross-ipc'});});
 const result=structuredClone(await bridge({resultEnvelope:true,taskId:'fixture'}));
 assert.deepEqual(result,{ok:false,code:'RATE_LIMITED',error:'号池限流，已保留进度',partialText:'部分正文'});
 const {executeSkillWithAi}=await import('../core/skillExecution.js');
 await assert.rejects(executeSkillWithAi({api:{aiChat:bridge},state:{skills:[{id:'s',content:'完整Skill'}],apiProfiles:[{id:'p',model:'mock'}]},skillId:'s',input:'完整场景',requestOptions:{resultEnvelope:true}}),error=>error.code==='RATE_LIMITED'&&error.partialText==='部分正文');
});

test('desktop abort envelope has a stopped classification while success still returns its body',async()=>{
 const stopped=await ipcBridge(async()=>{throw Object.assign(new Error('aborted'),{name:'AbortError'});})({resultEnvelope:true});
 assert.equal(stopped.code,'STOPPED');assert.equal(stopped.error,'任务已停止');
 assert.equal((await ipcBridge(async()=> '完整正文')({resultEnvelope:true})).output,'完整正文');
});

test('desktop IPC through Skill execution pauses a throttled real batch and leaves its next scene pending',async()=>{
 const {executeSkillWithAi}=await import('../core/skillExecution.js');
 const {createQuickGenerationController}=await import('../core/directorQuickGeneration.js');
 const {createDirectorBatchController,createDirectorBatchPlan}=await import('../core/directorBatchGeneration.js');
 const {directorSceneInput}=await import('../core/directorQuickStore.js');
 const skill={id:'s',content:'生成编号提示词'},profile={id:'p',model:'mock'};
 const episode={id:'e',title:'第1集',content:'1-1 景：屋内 日 内\n甲：好。\n1-2 景：门外 日 外\n乙：走吧。'};
 const project={id:'project',style:'真人电影级',aspectRatio:'9:16',episodes:[episode]};
 const records=new Map(),started=[];
 const checkpoints={save:async({run})=>records.set(run.id,structuredClone(run)),load:async({runId})=>structuredClone(records.get(runId)),list:async()=>[...records.values()]};
 const getContext=target=>({accountId:'account',project,episode,skill,profile,inputText:directorSceneInput(project,episode,target.sceneLabel),permissions:{canGenerate:true}});
 const bridge=ipcBridge(async payload=>{
   if(payload.messages[0].content==='请读取Skill文档，严格按照Skill文档输出'){
     started.push(payload.messages.at(-1).content);
     throw Object.assign(new Error('号池限流'),{code:'RATE_LIMITED'});
   }
   return JSON.stringify({segments:[{end:{unitId:'u1'},timing:{speechSeconds:1,actionSeconds:0,overlapSeconds:0,transitionSeconds:0},startState:'起点',endState:'终点',boundary:'scene-end',visualNotes:[]}]});
 });
 const scene=createQuickGenerationController({getContext,checkpoints,groundedTiming:true,
   executeText:async payload=>{const result=await bridge({...payload,resultEnvelope:true});if(!result.ok)throw Object.assign(new Error(result.error),{code:result.code});return result.output;},
   executeSkill:payload=>executeSkillWithAi({api:{aiChat:bridge},state:{skills:[skill],apiProfiles:[profile]},skillId:'s',input:payload.input,requestOptions:{resultEnvelope:true}}),
   commitRun:async()=>({applied:true}),
 });
 const batch=createDirectorBatchController({sceneController:scene,getContext,checkpoints});
 const plan=await createDirectorBatchPlan({accountId:'account',project,skill,profile,maxDurationSeconds:30,concurrency:1});
 const paused=await batch.start(plan);
 assert.equal(paused.phase,'paused');assert.equal(started.length,1);
 assert.equal(paused.targets[1].status,'pending');
 assert.equal(paused.errors[0].code,'RATE_LIMITED');
});

import React,{useState,useRef,useCallback} from 'react';import{createRoot}from'react-dom/client';
import {useDirectorQuickGeneration} from '../src/v06/useDirectorQuickGeneration.js';
import {DirectorBatchPanel} from '../src/v06/DirectorBatchPanel.jsx';
import {createDirectorPersistence} from '../core/directorPersistence.js';
import {createDirectorBatchPlan} from '../core/directorBatchGeneration.js';
import {createDirectorManualController,commitManualSceneRun} from '../core/directorManualGeneration.js';
import {directorSceneInput} from '../core/directorQuickStore.js';
import '../src/styles.css';import '../src/collab.css';import '../src/generation.css';import '../src/brand-theme.css';import '../src/workspace-readability.css';
const key='qa133-recovery',profile={id:'mock',name:'模拟接口',model:'mock'},skill={id:'skill',name:'generic-fixture',content:'按所给编号生成。'};
let initial={accountId:'qa',skills:[skill],apiProfiles:[profile],directorProjects:[{id:'project',name:'整本任务恢复验收',style:'真人电影级',aspectRatio:'9:16',episodes:[{id:'episode',title:'第一集',content:'1-1 房间 日 内\n甲：原稿保留。\n1-2 房间 日 内\n乙：继续未完成部分。'}]}]};
const records=new Map(),saved=JSON.parse(localStorage.getItem(key)||'null');
if(saved){initial=saved.state;for(const run of saved.runs)records.set(run.id,run);}
else{
 const project=initial.directorProjects[0],episode=project.episodes[0],plan=await createDirectorBatchPlan({accountId:'qa',project,skill,profile,maxDurationSeconds:30,segmentationMode:'manual',concurrency:2});
 const manual=createDirectorManualController({getContext:()=>({accountId:'qa',project:initial.directorProjects[0],episode:initial.directorProjects[0].episodes[0],skill,profile,permissions:{canGenerate:true}}),checkpoints:{save:async({run})=>records.set(run.id,structuredClone(run)),load:async({runId})=>structuredClone(records.get(runId)),list:async()=>[]},executeSkill:async()=> '1-1-1\n【基础设定】\n人物：甲\n场景：房间\n道具：无\n【画面内容】\n原稿保留。',commitRun:async run=>{const result=commitManualSceneRun(initial,run);initial=result.state;return result;}});
 const run=await manual.start({accountId:'qa',project,episode,inputText:directorSceneInput(project,episode,'1-1'),sceneLabel:'1-1',skill,profile,maxDurationSeconds:30},{runId:'saved-paid-child',batchId:plan.id});if(run.phase!=='completed')throw Error('fixture commit failed');
 plan.phase='running';plan.targets[0].status='running';plan.targets[0].sceneRunId=run.id;records.set(plan.id,plan);
}
let disk=structuredClone(initial);const save=()=>localStorage.setItem(key,JSON.stringify({state:disk,runs:[...records.values()].filter(r=>!r.id.startsWith('historic-'))}));save();
const oldOutput='已完成历史回包'.repeat(5000);
for(let i=0;i<3300;i++){const id='historic-'+String(i).padStart(5,'0');records.set(id,{id,kind:'manual-scene',phase:'completed',createdAt:'2026-01-01',snapshot:{accountId:'qa',projectId:'archived',episodeId:'old',sceneLabel:'1-1'},output:oldOutput});}
window.qa133={pages:0,paid:0,jumps:[],restored:false};
const api={directorQuickListRuns:async({after='',limit=64}={})=>{qa133.pages++;const keys=[...records.keys()].sort().filter(k=>!after||k>after),page=keys.slice(0,limit);return {runs:structuredClone(page.map(k=>records.get(k))),issues:[],nextCursor:keys.length>page.length?page.at(-1):null};},directorQuickLoadRun:async({runId})=>structuredClone(records.get(runId)),directorQuickSaveRun:async({run})=>{records.set(run.id,structuredClone(run));save();if(qa133.holdAfterOutput&&run.id!=='saved-paid-child'&&run.output&&!run.prompts?.length){qa133.held=true;await new Promise(()=>{});}return true;},saveState:async s=>{disk=structuredClone(s);save();return true;},saveDirectorProjects:async()=>true,aiChat:async payload=>{qa133.paid++;const text=payload.messages.map(m=>m.content).join('\n'),labels=[...new Set(text.match(/\b\d+-\d+-\d+\b/g)||[])];if(!labels.length)throw Error('No expected labels');return {ok:true,output:labels.map(label=>label+'\n【基础设定】\n人物：乙\n场景：房间\n道具：无\n【画面内容】\n继续未完成部分。').join('\n\n')};}};
function Fixture(){const[state,setRendered]=useState(initial),ref=useRef(state),[,setTick]=useState(0),persist=useRef(null);const setState=useCallback(update=>{const s=typeof update==='function'?update(ref.current):update;ref.current=s;setRendered(s);},[]);if(!persist.current)persist.current=createDirectorPersistence({saveState:api.saveState,saveDirectorProjects:api.saveDirectorProjects});const quick=useDirectorQuickGeneration({state,stateRef:ref,setState,api,accountId:'qa',persistence:persist.current,initialized:true});
 qa133.quick=quick;qa133.state=state;qa133.tick=()=>setTick(x=>x+1);qa133.batch=quick.getProjectBatch('project');qa133.summaryBytes=JSON.stringify(quick.runs).length;
 return <main style={{padding:24}}><h1>整本任务恢复验收</h1><DirectorBatchPanel project={state.directorProjects[0]} accountId="qa" skill={skill} profile={profile} maxDurationSeconds={30} segmentationMode="manual" quickGeneration={quick} onJump={(episodeId,sceneLabel)=>qa133.jumps.push({episodeId,sceneLabel})}/><pre>{JSON.stringify({history:quick.runs.length,batch:qa133.batch?.phase,paid:qa133.paid})}</pre></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

import React,{useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{DirectorWorkspace}from'../../src/v06/DirectorWorkspace.jsx';
import{useDirectorQuickGeneration}from'../../src/v06/useDirectorQuickGeneration.js';
import{manorScene}from'../../core/directorSceneBudget.fixtures.js';
import '../../src/styles.css';import '../../src/v06.css';import '../../src/v07.css';import '../../src/v08.css';import '../../src/v09.css';import '../../src/v100-exact.css';import '../../src/v100-compat.css';import '../../src/account-access.css';import '../../src/canvas.css';import '../../src/collab.css';import '../../src/generation.css';import '../../src/ocean-theme.css';import '../../src/ui-refinement.css';import '../../src/workspace-polish.css';import '../../src/studio-theme.css';import '../../src/production-workspace.css';import '../../src/brand-theme.css';import '../../src/workspace-readability.css';import '../../src/components/formatted-text.css';import '../../src/workspace-refresh.css';import '../../src/access-experience.css';
const calls=[],records=new Map();window.__calls=calls;
localStorage.clear();localStorage.setItem('xz-director-last-project','fixture-project');localStorage.setItem('xz-director-last-pane','fixture-episode');localStorage.setItem('xz-director-mode:fixture-account:fixture-project','quick');
const longScene=new URLSearchParams(location.search).has('extendedPace');
localStorage.setItem('xz-director-quick-settings:fixture-account:fixture-project',JSON.stringify({segmentationMode:'auto',maxDurationSeconds:longScene?30:15,pace:longScene?0:50}));
const source=longScene?'1-1 餐厅 日 内\n'+Array.from({length:24},(_,i)=>`${i%2?'乙':'甲'}：这件事情没你想的那么简单，我们现在必须马上赶过去处理清楚！`).join('\n'):manorScene.replace('2-1','1-1');
const initial={skills:[{id:'fixture-skill',name:'隔离测试 Skill',content:'逐段输出视频提示词；保留全部原话。'}],apiProfiles:[{id:'fixture-model',name:'隔离接口',model:'fixture',endpoint:'https://example.invalid/v1'},{id:'fixture-backup',name:'隔离备用接口',model:'fixture-backup',endpoint:'https://example.invalid/v1'}],activeApiId:'fixture-model',directorProjects:[{id:'fixture-project',name:'自动生成隔离测试',style:'真人电影级',aspectRatio:'9:16',episodes:[{id:'fixture-episode',title:'第1集',content:source}]}]};
const api={directorCollabListProjects:async()=>[],collabListProjects:async()=>[],collabIsProducer:async()=>false,directorQuickListRuns:async()=>[...records.values()],directorQuickSaveRun:async({run})=>{records.set(run.id,structuredClone(run));},directorQuickLoadRun:async({runId})=>records.get(runId),cancelAiTask:async()=>{},aiChat:async p=>{
 const text=p.messages.map(m=>m.content).join('\n');const kind=text.includes('只读语义核对员')?'audit':text.includes('表演估时规划器')?'plan':'skill';calls.push(kind);
 if(kind==='plan')return longScene?{ok:true,output:'{"estimatedSceneSeconds":180}'}:{ok:false,error:'all accounts are temporarily unavailable, please retry later'};
 if(kind==='audit')return{ok:false,error:'fixture audit unavailable'};
 if(window.__skillFail)return{ok:false,error:'all accounts are temporarily unavailable, please retry later'};
 const labels=[...new Set(text.match(/1-1-\d+/g)||[])];return{ok:true,output:labels.map(label=>`${label}\n【画面内容】\n隔离测试回包：按完整原文和所选 Skill 演出。`).join('\n\n')};
}};
function App(){const[state,setReactState]=useState(initial),ref=useRef(state);ref.current=state;const setState=next=>{ref.current=typeof next==='function'?next(ref.current):next;setReactState(ref.current);};const persistence=useRef({enqueue:()=>{},flush:async()=>{window.__persisted=structuredClone(ref.current);}}).current;const quick=useDirectorQuickGeneration({state,stateRef:ref,setState,api,accountId:'fixture-account',persistence,initialized:true});window.__state=state;window.__quick=quick;
return <div style={{height:'100vh',display:'flex'}}><DirectorWorkspace state={state} setState={setState} api={api} accountId="fixture-account" quickGeneration={quick}/></div>;}
createRoot(document.getElementById('root')).render(<App/>);

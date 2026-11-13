import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import PromptArtBindingPanel from '../../src/v06/PromptArtBindingPanel.jsx';
import {newArtReview,applyArtReviewCandidate} from '../../core/artReview.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {notifyBindingSaved} from '../../src/v06/useScenePromptLinks.js';
import '../../src/styles.css';import '../../src/collab.css';import '../../src/brand-theme.css';import '../../src/workspace-readability.css';
const episode={id:'ep',episodeNumber:1,content:[1,2,3].map(n=>`1-${n} 客厅 日 内\n张三喝水。`).join('\n'),prompts:Array.from({length:30},(_,n)=>({id:'p'+(n+1),label:`1-${Math.floor(n/10)+1}-${n%10+1}`,content:'【基础设定】\n人物：张三（参考@），短发灰衣。\n场景：客厅\n道具：水杯\n【画面内容】\n张三举杯。'}))};
const project={id:'flow-159',name:'协作流程隔离验收',episodes:[episode]};
let ledger={episodes:{1:applyArtReviewCandidate(newArtReview(episode),episode,{items:[{id:'a',category:'character',name:'【张三】',description:'成年男性，短黑发，灰色短袖。',ready:true}],mapping:[1,2,3].map(n=>({sceneId:'1-'+n,assets:[{category:'character',name:'【张三】'}]})),complete:true,warnings:[],inventory:'清单'})}},saved=null;
const clone=v=>structuredClone(v),profile={id:'mock',name:'隔离模拟模型'};
const qa=window.qaFlow={hold:true,bytes:0,pending:new Map(),started:[],active:0,peak:0,saved:()=>saved,realApiCalls:0};
const api={promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>clone(saved),promptArtSave:async p=>{if(p.baseRevision!==(saved?.revision||0))throw Error('关联记录已被另一窗口更新');saved={...clone(p.data),revision:p.baseRevision+1};return clone(saved);},
 artReviewLoadLocal:async()=>clone(ledger),artReviewSaveLocal:async({data})=>{ledger=clone(data);},analysisLoad:async()=>null,
 aiTaskStatus:async()=>({phase:'receiving',receivedBytes:qa.bytes}),aiChat:async p=>{const data=JSON.parse(p.messages[1].content);qa.started.push(data.label);qa.active++;qa.peak=Math.max(qa.peak,qa.active);try{if(qa.hold)await new Promise((resolve,reject)=>qa.pending.set(p.taskId,{resolve,reject}));return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:'张三',reason:'原文明确'})),missing:[]});}finally{qa.pending.delete(p.taskId);qa.active--;}} ,
 cancelAiTask:async({taskId})=>qa.pending.get(taskId)?.reject(Error('任务已停止'))};
const store=getArtReviewStore({api,projectId:project.id,accountId:'qa'});await store.load(project);
// The component uses the registry; share exactly that instance with the fixture.
const {getPromptDistributionService}=await import('../../core/promptDistributionService.js');
const live=getPromptDistributionService({api,projectId:project.id,accountId:'qa',getContext:()=>({project,ledger,assets:[]}),onSaved:data=>notifyBindingSaved(project.id,'qa',data)});
qa.service=live;qa.release=()=>{qa.hold=false;for(const p of qa.pending.values())p.resolve();};
function Fixture(){const [scene,setScene]=useState('1-1');return <main style={{padding:24,maxWidth:1900,margin:'auto'}}><nav style={{display:'flex',gap:12,marginBottom:18}}><button onClick={()=>{qa.run=Promise.allSettled(episode.prompts.map(p=>live.run(p.id,{profile})));}}>启动30条</button>{[1,2,3].map(n=><button key={n} onClick={()=>setScene('1-'+n)}>查看场景1-{n}</button>)}</nav><PromptArtBindingPanel project={project} ledger={ledger} assets={[]} api={api} accountId="qa" canEdit sceneId={scene} profile={profile} modelProfiles={[profile]} refresh={async()=>{}}/></main>;}
createRoot(document.getElementById('root')).render(<Fixture/>);

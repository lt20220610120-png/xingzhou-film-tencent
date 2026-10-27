import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import ArtReviewSection from '../src/v06/ArtReviewSection.jsx';
import PromptPublicationProgress from '../src/v06/PromptPublicationProgress.jsx';
import {getPromptDistributionService} from '../core/promptDistributionService.js';
import {newArtReview,applyArtReviewCandidate,reviewSceneSignature} from '../core/artReview.js';
import {getArtReviewStore} from '../core/artReviewPersistence.js';import {publishedReviewProject} from '../core/publishedReviewProject.js';
import {notifyBindingSaved} from '../src/v06/useScenePromptLinks.js';
import '../src/styles.css';import '../src/collab.css';import '../src/brand-theme.css';import '../src/workspace-readability.css';
const prompt='【基础设定】\n人物：李大川（参考@），短黑发、灰色短袖。\n场景：客厅（参考@）。\n道具：水杯（参考@）。\n【整体视听】\n真人电影级。';
const project={id:'publication-qa',name:'后台发布验收',myRole:'producer',episodes:Array.from({length:8},(_,i)=>({id:'ep'+(i+1),episodeNumber:i+1,title:`第${i+1}集`,content:`${i+1}-1 客厅 日 内\n李大川拿起水杯。`,prompts:[1,2].map(n=>({id:`p${i+1}-${n}`,label:`${i+1}-1-${n}`,content:prompt}))}))};
const cards=[{category:'character',name:'【李大川-日常服】',description:'32岁，灰色短袖，短黑发。',ready:true},{category:'scene',name:'【客厅-日-内】',description:'白墙客厅，木桌和布艺沙发。',ready:true},{category:'prop',name:'【水杯-李大川】',description:'透明玻璃水杯，圆形杯口。',ready:true}];
let disk={episodes:{}},saved=null,models=0,saves=0,publishes=0,active=0,peak=0,refreshes=0,assets=[];const cloud={},calls=[];
for(const ep of project.episodes)disk.episodes[ep.episodeNumber]=applyArtReviewCandidate(newArtReview(ep),ep,{items:cards,mapping:[{sceneId:`${ep.episodeNumber}-1`,assets:cards.map(({category,name})=>({category,name}))}],inventory:'清单',complete:true,warnings:[]});
let releaseUpload,releasePublish;const uploadGate=new Promise(r=>releaseUpload=r),publishGate=new Promise(r=>releasePublish=r);
const api={promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>structuredClone(saved),promptArtSave:async p=>{if(p.baseRevision!==(saved?.revision||0))throw Error('关联记录已被另一窗口更新');saved={...structuredClone(p.data),revision:(saved?.revision||0)+1};return structuredClone(saved);},artReviewLoadLocal:async()=>disk,artReviewSaveLocal:async({data})=>{disk=structuredClone(data);},analysisLoad:async()=>null,
 aiChat:async p=>{models++;const data=JSON.parse(p.messages[1].content);return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:c.category==='character'?'李大川':c.category==='scene'?'客厅':'水杯',reason:'基础设定'})),missing:[]});},
 collabArtReviewSave:async p=>{saves++;active++;peak=Math.max(active,peak);calls.push({kind:'save',episode:p.episodeNumber});await uploadGate;active--;return cloud[p.episodeNumber]={...structuredClone(p.data),version:p.baseVersion+1};},
 collabArtReviewPublish:async p=>{publishes++;active++;peak=Math.max(active,peak);calls.push({kind:'publish',episode:p.episodeNumber});await publishGate;active--;const record=structuredClone(cloud[p.episodeNumber]);record.published||={};for(const id of p.sceneIds){const s=record.scenes.find(s=>s.id===id);record.published[id]={...s,signature:reviewSceneSignature(s)};for(const c of s.items){let a=assets.find(a=>a.name===c.name);if(!a){a={...c,id:'asset'+assets.length,episodes:[]};assets.push(a);}a.episodes=[...new Set([...a.episodes,p.episodeNumber])];}}record.version=p.baseVersion+1;return cloud[p.episodeNumber]=record;}
};
const store=getArtReviewStore({api,accountId:'qa',projectId:project.id}),profile={id:'text',name:'模拟分析模型',model:'mock'},state={apiProfiles:[profile],activeApiId:'text'};
async function setup(){await store.load(project);const service=getPromptDistributionService({api,projectId:project.id,accountId:'qa',getContext:()=>({project,ledger:store.snapshot(),assets}),onSaved:d=>notifyBindingSaved(project.id,'qa',d)});for(const ep of project.episodes)for(const p of ep.prompts)await service.run(p.id,{profile});}
window.qaPublication={get saved(){return saved},get calls(){return calls},get models(){return models},get peak(){return peak},get saves(){return saves},get publishes(){return publishes},get refreshes(){return refreshes},releaseUpload:()=>releaseUpload(),releasePublish:()=>releasePublish()};
function Fixture(){const [ready,setReady]=useState(false),[page,setPage]=useState('review'),[live,setLive]=useState(project),[rows,setRows]=useState([]);
 const refresh=async()=>{refreshes++;setLive(publishedReviewProject(project,store.snapshot()));setRows([...assets]);};
 return <main style={{marginLeft:220,padding:18}}><nav><button onClick={()=>void setup().then(()=>setReady(true))}>准备模拟清单</button><button onClick={()=>setPage('review')}>清单核实</button><button onClick={()=>setPage('art')}>美术</button></nav><PromptPublicationProgress api={api} accountId="qa" projectId={project.id} refresh={refresh}/>{ready&&(page==='review'?<ArtReviewSection project={live} assets={rows} api={api} state={state} accountId="qa" canEdit refresh={refresh} analysisJob={null} onOpenArt={()=>setPage('art')}/>:<section aria-label="已发布美术资产"><h1>美术</h1>{rows.map(a=><article key={a.id}>{a.name} · 已关联 {a.episodes.length} 集</article>)}</section>)}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

import {mockSceneDistribution} from './mock-scene-distribution.js';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ArtReviewSection from '../src/v06/ArtReviewSection.jsx';
import {PromptBookWorkspace} from '../src/v06/PromptBookWorkspace.jsx';
import {newArtReview,editArtReview,reviewSceneSignature} from '../core/artReview.js';
import '../src/styles.css';
import '../src/generation.css';
import '../src/collab.css';
import '../src/ocean-theme.css';
import '../src/v06.css';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5e0AAAAASUVORK5CYII=';
const episode={id:'episode',episodeNumber:1,title:'第1集',content:'1-1 客厅 日 内\n张三拿起杯子递给李四。',prompts:[
 {id:'p1',label:'1-1-1',content:'【基础信息】\n人物：张三\n场景：客厅\n道具：无\n【镜头】\n张三说话。'},
 {id:'p2',label:'1-1-2',content:'【基础设定】\n人物：张三、李四\n场景：客厅\n道具：张三-杯子\n【镜头】\n张三把杯子递给李四。'}]};
const project={id:'qa-binding',name:'联动美术验收剧',director_project_id:'qa-director',myRole:'producer',episodes:[episode]};
const assets=[['a','character','【张三-白衣】'],['b','character','【李四-常服】'],['room','scene','【客厅】'],['cup','prop','【张三-杯子】'],['phone','prop','【手机】']].map(([id,category,name])=>({id,category,name,images:[{id:id+'-img',url:pixel}]}));
let record=newArtReview(episode);record.scenes[0].items=assets.map(asset=>({id:'r-'+asset.id,category:asset.category,name:asset.name,description:'已核实外观',ready:true}));record.scenes[0].mappingReady=true;record=editArtReview(record,{type:'approve',sceneId:'1-1'},'qa');record.published={'1-1':{...structuredClone(record.scenes[0]),signature:reviewSceneSignature(record.scenes[0])}};
let ledger={episodes:{1:record}};const read=()=>JSON.parse(localStorage.getItem('qa-binding-data')||'null');
window.qaBinding={submits:[],ai:0,project,assets};
const api={
 promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>read(),promptArtSave:async({baseRevision,data})=>{if((read()?.revision||0)!==baseRevision)throw Error('关联已更新');const next={...data,revision:baseRevision+1};localStorage.setItem('qa-binding-data',JSON.stringify(next));return next;},
 collabListProjects:async()=>[project],artReviewSaveLocal:async({data})=>{ledger=data;},promptArtList:async()=>read()?.enabled?[{projectId:project.id,name:project.name}]:[],collabGetProject:async()=>project,collabListAssets:async()=>assets,artReviewLoadLocal:async()=>ledger,collabResolveAssetImage:async()=>({url:pixel}),
 aiChat:mockSceneDistribution,
 generationList:async()=>[],generationSubmit:async input=>window.qaBinding.submits.push(input),saveState:async()=>{},
};
function Fixture(){
 const [page,setPage]=useState('review'),[state,setState]=useState(()=>JSON.parse(localStorage.getItem('qa-binding-workflow')||'null')||{apiProfiles:[{id:'text',name:'模拟分析',model:'mock',provider:'openai-compatible'}],activeApiId:'text',mediaProfiles:[{id:'video',kind:'video',name:'模拟视频接口',provider:'openai-compatible',endpoint:'https://example.invalid',apiKey:'mock-only',model:'qa-model',capabilities:{maxImages:10,maxVideos:0,maxAudios:0,ratios:['16:9']},models:[{id:'qa-model',name:'模拟多参考模型',maxImages:10,ratios:['16:9'],durations:[5],resolutions:['720p']}]}],activeVideoApiId:'video',directorProjects:[]}),[,refresh]=useState(0);
 const update=action=>setState(current=>{const next=typeof action==='function'?action(current):action;localStorage.setItem('qa-binding-workflow',JSON.stringify(next));return next;});
 return <main style={{maxWidth:1500,margin:'20px auto',padding:20}}><nav><button onClick={()=>setPage('review')}>清单核实</button><button onClick={()=>setPage('generation')}>图视生成</button><button onClick={()=>{project.episodes[0].prompts=[{...project.episodes[0].prompts[0],id:'new-p1',content:project.episodes[0].prompts[0].content+'新镜头'}];refresh(value=>value+1);}}>模拟导演改词</button></nav>{page==='review'?<ArtReviewSection project={{...project}} assets={assets} api={api} state={state} accountId="qa" canEdit refresh={async()=>refresh(value=>value+1)} analysisJob={{}} onAnalyze={async()=>{}} onStop={()=>{}} onOpenArt={()=>{}}/>:<PromptBookWorkspace state={state} setState={update} api={api} accountId="qa" onSubmit={api.generationSubmit}/>}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

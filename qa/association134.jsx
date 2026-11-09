import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DirectorWorkspace} from '../src/v06/DirectorWorkspace.jsx';
import ArtReviewSection from '../src/v06/ArtReviewSection.jsx';
import {newArtReview,applyArtReviewCandidate} from '../core/artReview.js';
import {getArtReviewStore} from '../core/artReviewPersistence.js';
import {directorEditionKey} from '../core/directorPromptEditions.js';
import '../src/styles.css';import '../src/collab.css';import '../src/generation.css';import '../src/brand-theme.css';import '../src/workspace-readability.css';
const prompt=`1-1-1
【基础设定】
人物：时江晚（参考@），成年女性，老旧居民楼走廊内站立，穿日常家居外套；林秋雨（参考@），成年女性，与时江晚面对面站立；本段无新入场者。
场景：夜，内，老旧居民楼走廊（参考@）；墙面斑驳，走廊顶部悬挂声控灯，走廊尽头为楼梯口，两人所在处为走廊中段。
道具：无关键手持道具。
音色：时江晚，年轻女声，清亮偏柔；林秋雨，年轻女声，温和明快。
限制：禁止字幕、水印、Logo和无意义UI；无需背景音乐。
【连续台词】
D01｜时江晚｜现场对白｜分镜01：『你真的能听到我的心声？』
D02｜时江晚｜内心VO｜分镜02：『怎么可能？』
D03｜林秋雨｜现场对白｜分镜03：『你说，你心里的秘密要全被我知道了。』
D04｜时江晚｜现场对白｜分镜06：『你真的能听见？！』`;
const ep={id:'ep',title:'第一集',episodeNumber:1,content:'1-1 老旧居民楼走廊 夜 内\n时江晚：你真的能听到我的心声？\n林秋雨：你说，你心里的秘密要全被我知道了。',prompts:[{id:'old',label:'1-1-1',content:prompt}]};
const director={id:'director134',name:'神明·关联与版本验收',masterScript:ep.content,episodes:[ep],style:'真人电影级',aspectRatio:'16:9'};
let project={id:'collab134',name:director.name,director_project_id:director.id,episodes:[ep]},saved=null;
const items=[['one','character','【时江晚-日常服】'],['two','character','【林秋雨-日常服】'],['hall','scene','【老旧居民楼·走廊-内】']].map(([id,category,name])=>({id,category,name,description:'已核对的美术细节',ready:true,manual:true}));
let ledger={episodes:{1:applyArtReviewCandidate(newArtReview(ep),ep,{items,inventory:'清单',complete:true,warnings:[],mapping:[{sceneId:'1-1',assets:items.map(i=>({category:i.category,name:i.name}))}]})}};
const clone=value=>structuredClone(value),empty=async()=>[];let calls=0;
const api={directorCollabListProjects:empty,collabListProjects:empty,collabIsProducer:async()=>true,promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>clone(saved),promptArtSave:async({baseRevision,data})=>{if(baseRevision!==(saved?.revision||0))throw Error('关联记录已被另一窗口更新');saved={...clone(data),revision:baseRevision+1};return clone(saved);},artReviewLoadLocal:async()=>clone(ledger),artReviewSaveLocal:async({data})=>{ledger=clone(data);},collabListAssets:empty,collabListMedia:empty,generationList:empty,collabGetProject:async()=>clone(project),aiChat:async p=>{calls++;const d=JSON.parse(p.messages[1].content),first=d.voiceCards?.[0];return JSON.stringify({assignments:d.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidenceId:d.evidenceSpans.find(s=>s.category===c.category)?.id,reason:'基础设定明确出现'})),missing:[],speakers:first?[{voiceUid:first.uid,evidence:d.dialogueSource.split('\n').find(l=>l.startsWith('D01')),kind:'dialogue'},{voiceUid:first.uid,evidence:d.dialogueSource.split('\n').find(l=>l.startsWith('D01')),kind:'dialogue'},{voiceUid:'old-wrong',evidence:'错误',kind:'dialogue'}]:[]});}};
const store=getArtReviewStore({api,projectId:project.id,accountId:'qa'});await store.load(project);
localStorage.setItem('xz-director-last-project',director.id);localStorage.setItem('xz-director-last-pane','ep');localStorage.setItem('xz-director-mode:qa:director134','quick');
function Fixture(){
 const [state,setState]=useState({directorProjects:[clone(director)],apiProfiles:[{id:'mock',name:'模拟模型',model:'mock'}],activeApiId:'mock',mediaProfiles:[],skills:[],scriptLibrary:[]}),[view,setView]=useState('director'),[live,setLive]=useState(project);
 const refresh=async()=>{project={...project,episodes:clone(state.directorProjects[0].episodes)};await store.load(project);setLive(clone(project));return clone(project);};
 window.qa134={get saved(){return saved},get calls(){return calls},get state(){return state},get project(){return project}};
 const add=()=>setState(s=>({...s,directorProjects:s.directorProjects.map(p=>({...p,episodes:p.episodes.map(e=>({...e,prompts:[...(e.prompts||[]),{id:crypto.randomUUID(),label:'1-1-'+((e.prompts?.length||0)+1),content:prompt,promptEditionId:directorEditionKey(p)}]}))}))}));
 return <><nav className="qa-toolbar" style={{display:'flex',gap:8,padding:10,flexWrap:'wrap'}}><button onClick={()=>setView('director')}>导演工作台</button><button onClick={async()=>{await refresh();setView('collab');}}>项目协作</button><button onClick={add}>模拟生成或补漏</button><button onClick={refresh}>刷新云端数据</button></nav>{view==='director'?<DirectorWorkspace state={state} setState={setState} api={api} accountId="qa"/>:<main style={{padding:20,marginLeft:220,minWidth:0}}><ArtReviewSection project={live} assets={[]} api={api} state={state} accountId="qa" canEdit refresh={refresh} onAnalyze={async()=>({})} onStop={()=>{}} onOpenArt={()=>{}}/></main>}</>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

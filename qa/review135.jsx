import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import ArtReviewSection from '../src/v06/ArtReviewSection.jsx';import {StoryboardWorkbench} from '../src/v06/StoryboardWorkbench.jsx';import {GenerationComposer} from '../src/v06/GenerationComposer.jsx';
import {newArtReview,applyArtReviewCandidate,reviewSceneSignature} from '../core/artReview.js';import {getArtReviewStore} from '../core/artReviewPersistence.js';
import {projectVoiceRoster} from '../core/characterVoices.js';import {notifyBindingSaved} from '../src/v06/useScenePromptLinks.js';
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

const ep={id:'ep135',title:'第一集',episodeNumber:1,content:'1-1 老旧居民楼走廊 夜 内\n时江晚：你能听见？\n林秋雨：我能听见。\n1-2 老旧居民楼走廊 夜 内\n时江晚：你能听见？\n林秋雨：我能听见。',prompts:[{id:'p1',label:'1-1-1',content:prompt},{id:'p2',label:'1-2-1',content:prompt.replaceAll('1-1-1','1-2-1').replace('无关键手持道具。','手机（林秋雨持有，屏幕亮）。')}]};
let project={id:'collab135',name:'音色座位与批量发布',director_project_id:'director135',episodes:[ep]},assets=[],saved=null,remote=null,calls=0,publishes=0;
const items=[['one','character','【时江晚-日常服】'],['two','character','【林秋雨-日常服】'],['unused','character','【路人-日常服】'],['hall','scene','【老旧居民楼·走廊-内】']].map(([id,category,name])=>({id,category,name,description:'已核对的美术细节',ready:true,manual:true}));
let ledger={episodes:{1:applyArtReviewCandidate(newArtReview(ep),ep,{items,inventory:'已读取',complete:true,warnings:[],mapping:['1-1','1-2'].map(sceneId=>({sceneId,assets:items.map(i=>({category:i.category,name:i.name}))}))})}};
const clone=v=>structuredClone(v),empty=async()=>[];
let projects={selectedId:'',projects:[]},created=0,submitted=[];
const model={id:'mock-video',kind:'video',name:'模拟LibTV',maxImages:8,maxAudios:4,maxVideos:1,ratios:['16:9'],durations:[5],resolutions:['480p'],schema:{properties:{modeType:{items:{text2video:[0,0]}}}}},ownerKey='test-owner';
const api={promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>clone(saved),promptArtSave:async({baseRevision,data})=>{if(baseRevision!==(saved?.revision||0))throw Error('关联记录已被另一窗口更新');saved={...clone(data),revision:baseRevision+1};return clone(saved);},artReviewLoadLocal:async()=>clone(ledger),artReviewSaveLocal:async({data})=>{ledger=clone(data);},collabListAssets:async()=>clone(assets),collabListMedia:empty,generationList:empty,collabGetProject:async()=>clone(project),aiChat:async()=>{calls++;throw Error('QA应不调用模型');},collabArtReviewSave:async p=>{remote={...clone(p.data),version:(p.baseVersion||0)+1,lastWriteId:p.writeId};return clone(remote);},collabArtReviewPublish:async p=>{publishes++;for(const id of p.sceneIds)remote.published[id]={signature:reviewSceneSignature(remote.scenes.find(s=>s.id===id))};remote.version++;return clone(remote);},collabPatchStoryboard:async({shotId,updates})=>{Object.assign(ep.prompts.find(p=>p.id===shotId),updates);return clone(project);},collabResolveAssetImage:async()=>({url:assets[0]?.images[0]?.url}),
 libtvProjects:async()=>clone(projects),libtvCreateProject:async({name})=>{const row={id:'canvas-'+(++created),name,url:'https://www.liblib.tv/canvas?projectId=canvas-'+created};projects.projects.push(row);projects.selectedId=row.id;return clone(row);},libtvUseProject:async({projectId,name})=>{let row=projects.projects.find(p=>p.id===projectId);if(!row){row={id:projectId,name:name||projectId,url:'https://www.liblib.tv/canvas?projectId='+projectId};projects.projects.push(row);}projects.selectedId=row.id;return clone(row);},libtvModelSchema:async({kind})=>({...model,kind,schema:{properties:{modeType:{items:{text2video:[0,0],image2image:[0,14],mixed2video:[0,16]},mixed2videoConfig:{imageMax:8,audioMax:4,videoMax:1}}}}}),openExternal:async()=>{}};
const store=getArtReviewStore({api,projectId:project.id,accountId:'qa'});await store.load(project);
function Fixture(){const [view,setView]=useState('review'),[live,setLive]=useState(project),[images,setImages]=useState([]),[value,setValue]=useState({profileId:'lib',model:'mock-video',prompt:'一个固定镜头。',references:[]}),[kind,setKind]=useState('video');
 const state={directorProjects:[],apiProfiles:[{id:'mock',name:'模拟模型',model:'mock'}],activeApiId:'mock',mediaProfiles:[{id:'lib',provider:'libtv',kind,libtvOwnerKey:ownerKey,model:'mock-video',name:'LibTV',endpoint:'https://www.liblib.tv',capabilities:{...model,kind},modelCatalog:[{...model,kind}]}]};
 const refresh=async()=>{await store.load(project,assets);setLive(clone(project));return clone(project);};
 const imagesReady=async()=>{assets=items.map(i=>({id:'asset-'+i.id,name:i.name,category:i.category,episodes:[1],sceneIds:['1-1','1-2'],images:[{id:'img-'+i.id,url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="lavender"/></svg>')}]}));setImages(clone(assets));notifyBindingSaved(project.id,'qa',saved);};
 const adopt=async()=>{for(const c of projectVoiceRoster(project,ledger).characters.filter(c=>c.speakingSceneIds.length))await store.setVoiceProfile(c.key,p=>({...p,confirmed:{id:'audio-'+c.key,url:'data:audio/wav;base64,UklGRg==',kind:'audio'}}));notifyBindingSaved(project.id,'qa',saved);};
 window.qa135={get saved(){return saved},get calls(){return calls},get publishes(){return publishes},get projects(){return projects},get created(){return created},get submitted(){return submitted}};
 return <><nav className="qa-toolbar" style={{display:'flex',gap:8,padding:10,flexWrap:'wrap'}}><button onClick={()=>setView('review')}>核实分发</button><button onClick={()=>setView('story')}>分镜</button><button onClick={()=>setView('lib')}>LibTV生成</button><button onClick={imagesReady}>模拟生图完成</button><button onClick={adopt}>模拟采用音色</button><button onClick={()=>setKind(kind==='video'?'image':'video')}>切换图片视频</button></nav><main style={{padding:20,marginLeft:220,minWidth:0}}>{view==='review'?<ArtReviewSection project={live} assets={images} api={api} state={state} accountId="qa" canEdit refresh={refresh} onAnalyze={async()=>({})} onStop={()=>{}} onOpenArt={()=>{}}/>:view==='story'?<StoryboardWorkbench project={live} assets={images} api={api} state={state} accountId="qa" canEdit refresh={refresh} onProjectChange={setLive}/>:<GenerationComposer api={api} state={state} kind={kind} value={value} onChange={setValue} onSubmit={async input=>{if(!projects.selectedId)await api.libtvCreateProject({name:'默认项目'});submitted.push({kind:input.kind,projectId:projects.selectedId});window.dispatchEvent(new Event('xingzhou-libtv-project-change'));}}/>}</main></>;
}createRoot(document.getElementById('root')).render(<Fixture/>);

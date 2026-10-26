import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ArtReviewSection from '../src/v06/ArtReviewSection.jsx';
import {AssetIdentity} from '../src/v06/CollabWorkspace.jsx';
import {StoryboardWorkbench} from '../src/v06/StoryboardWorkbench.jsx';
import useProjectPromptBinding from '../src/v06/useProjectPromptBinding.js';
import {newArtReview,editArtReview,reviewSceneSignature} from '../core/artReview.js';
import {bindingSnapshot,saveDistribution,entryBindingSignature} from '../core/promptArtBinding.js';
import {selectBindingVersion,saveBindingVersion} from '../core/promptBindingVersions.js';
import '../src/styles.css';
import '../src/collab.css';
import '../src/generation.css';
import '../src/brand-theme.css';
import '../src/workspace-readability.css';

const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#e6f5fa"/></svg>');
const spec=[['a','character','【李大川-日常服】'],['b','character','【法斗-宠物犬】'],['c','character','【张姐-雨衣】'],['d','character','【保镖甲-黑西装】'],['e','character','【保镖乙-黑西装】'],['s','scene','【积水道路上的面包车-夜-内外】'],['v','prop','【旧面包车-李大川】'],['p','prop','【宠物箱-李大川】'],['i','prop','【二手逆变器-李大川】'],['u1','prop','【黑色长柄雨伞-保镖甲】'],['u2','prop','【黑色长柄雨伞-保镖乙】']];
const assets=spec.map(([id,category,name])=>({id,project_id:'consumer',category,name,episodes:[1],sceneIds:['1-1'],images:[{id:id+'-img',url:image}],description:'已核实外貌与用途'}));
const prompt=n=>`1-1-${n}\n【基础设定】\n人物：李大川（参考@），32岁，身材结实偏瘦、肤色偏深、短黑发凌乱，穿灰色短袖和牛仔裤；${n===2?'': '法斗（参考@），副驾驶宠物箱内；张姐（参考@）、保镖甲（参考@）、保镖乙（参考@），车外撑伞。'}\n场景：积水道路上的面包车（参考@）。\n道具：${n===2?'二手逆变器。':'旧面包车；宠物箱；二手逆变器；黑色长柄雨伞。'}\n【画面内容】\n李大川坐在驾驶位，查看车座下的逆变器。`;
const episode={id:'ep',episodeNumber:1,title:'第1集',content:'1-1 积水道路上的面包车 夜 内/外\n李大川、法斗、张姐、保镖甲、保镖乙在车边。',prompts:Array.from({length:6},(_,i)=>({id:'p'+(i+1),label:`1-1-${i+1}`,content:prompt(i+1),generationConfig:{references:[]}}))};
let project={id:'consumer',name:'提示词下游验收',myRole:'producer',episodes:[episode]};
let record=newArtReview(episode);record.scenes[0].items=assets.map(a=>({id:'r-'+a.id,category:a.category,name:a.name,description:'原文已明确的完整客观外貌',ready:true,manual:true}));record.scenes[0].mappingReady=true;record=editArtReview(record,{type:'approve',sceneId:'1-1'});record.published={'1-1':{...structuredClone(record.scenes[0]),signature:reviewSceneSignature(record.scenes[0])}};
let ledger={episodes:{1:record}},current=bindingSnapshot(project,ledger,assets),selected=selectBindingVersion(current,null),snapshot=selected.snapshot;
let saved=saveBindingVersion(null,snapshot,Object.fromEntries(snapshot.entries.map(entry=>{
 const picked=entry.number===2?['a','s','i']:assets.map(a=>a.id),needs=snapshot.cards.filter(card=>picked.includes(card.assetId)).map(card=>({id:card.uid,category:card.category,cardUid:card.uid,visibility:'visible',reason:'已人工核对本条使用',manualReference:true,text:card.name,start:0,end:0,imageId:card.images[0].id}));
 return [entry.id,saveDistribution(snapshot,entry,{signature:entryBindingSignature(snapshot,entry),needs,origin:'scene-inventory-ai'})];
})));saved.revision=1;
window.qaConsumers={submits:[],saves:[],ai:0,source:episode.prompts.map(p=>p.content)};
const api={promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>structuredClone(saved),promptArtSave:async({baseRevision,data})=>{if(baseRevision!==saved.revision)throw Error('关联冲突');saved={...data,revision:baseRevision+1};return structuredClone(saved);},collabGetProject:async()=>structuredClone(project),collabListAssets:async()=>assets,artReviewLoadLocal:async()=>ledger,artReviewSaveLocal:async({data})=>{ledger=data;},collabListMedia:async()=>[],generationList:async()=>[],collabResolveAssetImage:async()=>({url:image}),aiChat:async()=>{qaConsumers.ai++;throw Error('验收不应调用AI');},collabPatchStoryboard:async input=>{qaConsumers.saves.push(input);const ep=project.episodes.find(ep=>ep.id===input.episodeId);Object.assign(ep.prompts.find(p=>p.id===input.shotId),input.updates);project=structuredClone(project);return project;},generationSubmit:async input=>{qaConsumers.submits.push(input);return {id:'simulated'};}};
const state={apiProfiles:[{id:'text',name:'模拟分析',model:'mock'}],activeApiId:'text',mediaProfiles:[{id:'video',kind:'video',name:'模拟视频',provider:'openai-compatible',apiKey:'mock',endpoint:'https://example.invalid',model:'mock-video',capabilities:{maxImages:20,maxAudios:0,maxVideos:0,ratios:['16:9'],durations:[5],resolutions:['720p']},models:[{id:'mock-video',name:'模拟视频',maxImages:20,ratios:['16:9'],durations:[5],resolutions:['720p']}]}],activeVideoApiId:'video'};
function Fixture(){
 const [page,setPage]=useState('review'),[live,setLive]=useState(project),binding=useProjectPromptBinding({api,project:live,assets,accountId:'qa'});
 return <main className="qa-consumer-main" style={{marginLeft:380,padding:16,minWidth:0}}><nav><button onClick={()=>setPage('review')}>清单核实</button><button onClick={()=>setPage('art')}>美术</button><button onClick={()=>setPage('story')}>分镜</button></nav>{page==='review'?<ArtReviewSection project={live} assets={assets} api={api} state={state} accountId="qa" canEdit refresh={async()=>{}} onAnalyze={async()=>{}} onStop={()=>{}} onOpenArt={()=>setPage('art')}/>:page==='art'?<div className="art-workbench"><article className="art-workbench-row"><AssetIdentity asset={assets[0]} assets={assets} promptBinding={binding.data} index={0}/><section>美术资产详情</section></article></div>:<StoryboardWorkbench project={live} assets={assets} api={api} state={state} accountId="qa" canEdit refresh={async()=>{}} onProjectChange={setLive}/>}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DirectorWorkspace} from '../src/v06/DirectorWorkspace.jsx';
import ArtReviewSection from '../src/v06/ArtReviewSection.jsx';
import {StoryboardWorkbench} from '../src/v06/StoryboardWorkbench.jsx';
import {newArtReview,applyArtReviewCandidate,editArtReview,reviewSceneSignature} from '../core/artReview.js';
import {getArtReviewStore} from '../core/artReviewPersistence.js';
import {getArtDistributionController} from '../core/artAnalysisPipeline.js';
import {notifyBindingSaved} from '../src/v06/useScenePromptLinks.js';
import '../src/styles.css';import '../src/collab.css';import '../src/generation.css';import '../src/brand-theme.css';import '../src/workspace-readability.css';
const profiles=[{id:'model-a',model:'mock-original',name:'原模型'},{id:'model-b',model:'mock-new',name:'新模型'}];
const prompt=(label,id=label,model='model-a')=>({id,label,profileId:model,content:`${label}\n【基础设定】\n人物：张三（参考@）。\n场景：客厅（参考@）。\n道具：水杯（参考@）。\n【画面内容】\n${model==='model-a'?'原模型':'新模型'}镜头 ${label}：张三端起水杯。`});
const first={id:'ep1',episodeNumber:1,title:'第一集',content:'1-1 客厅 日 内\n（1）\n张三拿杯。\n（2）\n张三喝水。\n1-2 客厅 夜 内\n张三放下水杯。',status:'已生成提示词',prompts:[prompt('1-1-1'),prompt('1-2-1')]};
const second={id:'ep2',episodeNumber:2,title:'第二集',content:'2-1 客厅 日 内\n张三拿起水杯。',status:'已生成提示词',prompts:[prompt('2-1-1')]};
const initialDirector={id:'director-129',name:'三级素材关联验收',episodes:[first,second],masterScript:first.content+'\n'+second.content};
let project={id:'workflow-129',director_project_id:initialDirector.id,name:initialDirector.name,myRole:'producer',episodes:structuredClone(initialDirector.episodes)},assets=[],saved=null;
const items=[['person','character','【张三】'],['room','scene','【客厅】'],['cup','prop','【水杯】']].map(([id,category,name])=>({id,category,name,description:'完整客观描述，保留原清单身份。',ready:true,manual:true}));
let ledger={episodes:Object.fromEntries(project.episodes.map(e=>{let r=newArtReview(e);r=applyArtReviewCandidate(r,e,{items,inventory:'已读取分集清单',complete:true,warnings:[],mapping:r.scenes.map(s=>({sceneId:s.id,assets:items.map(i=>({category:i.category,name:i.name}))}))});return [e.episodeNumber,r];}))};
window.qaSupplement={hold:false,pending:[],requests:[],get saved(){return saved},get project(){return project},get assets(){return assets}};
const clone=value=>structuredClone(value),empty=async()=>[];
const api={directorCollabListProjects:empty,collabListProjects:empty,collabIsProducer:async()=>true,
 promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>clone(saved),promptArtSave:async({baseRevision,data})=>{if(baseRevision!==(saved?.revision||0))throw Error('关联记录已被另一窗口更新');saved={...clone(data),revision:baseRevision+1};return clone(saved);},
 artReviewLoadLocal:async()=>clone(ledger),artReviewSaveLocal:async({data})=>{ledger=clone(data);},collabGetProject:async()=>clone(project),collabListAssets:async()=>clone(assets),collabListMedia:empty,generationList:empty,
 collabResolveAssetImage:async({assetId})=>({url:assets.find(a=>a.id===assetId)?.images[0]?.url}),
 aiChat:async payload=>{const input=JSON.parse(payload.messages[1].content);qaSupplement.requests.push(input.label||'mapping');if(qaSupplement.hold)await new Promise(resolve=>qaSupplement.pending.push(resolve));await new Promise(r=>setTimeout(r,40));return JSON.stringify({assignments:input.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:c.name.replace(/[【】]/g,''),reason:'基础设定明确使用'})),missing:[]});},
 collabPatchStoryboard:async({episodeId,shotId,updates})=>{Object.assign(project.episodes.find(e=>e.id===episodeId).prompts.find(p=>p.id===shotId),updates);return clone(project);},
};
const store=getArtReviewStore({api,projectId:project.id,accountId:'qa'});
const control=getArtDistributionController({api,projectId:project.id,accountId:'qa',project,store,existingAssets:assets,profile:profiles[0],onBindingSaved:data=>notifyBindingSaved(project.id,'qa',data)});
localStorage.setItem('xz-director-last-project',initialDirector.id);localStorage.setItem('xz-director-last-pane','ep1');
function Fixture(){
 const [state,setState]=useState({directorProjects:[initialDirector],apiProfiles:profiles,activeApiId:'model-a',mediaProfiles:[],skills:[],scriptLibrary:[]}),[view,setView]=useState('director'),[live,setLive]=useState(project),[images,setImages]=useState(assets),[message,setMessage]=useState('');
 const fresh=async()=>{project={...project,episodes:clone(state.directorProjects[0].episodes)};setLive(clone(project));setImages(clone(assets));await store.load(project,assets);void control.refresh({project,existingAssets:assets});return clone(project);};
 const fill=()=>setState(s=>({...s,directorProjects:s.directorProjects.map(p=>({...p,episodes:p.episodes.map(e=>e.id==='ep1'?{...e,prompts:[...e.prompts,prompt('1-1-2')]}:e)}))}));
 const regenerate=()=>setState(s=>({...s,directorProjects:s.directorProjects.map(p=>({...p,episodes:p.episodes.map(e=>({...e,activeQuickScenePlanIds:e.id==='ep1'?{'1-1':'new-plan'}:{},quickScenePlans:e.id==='ep1'?[{id:'new-plan',segments:[{index:1},{index:2},{index:3}]}]:[],prompts:(e.id==='ep1'?['1-1-1','1-1-2','1-1-3','1-2-1']:['2-1-1']).map(label=>({...prompt(label,'new-'+label,'model-b'),...(label.startsWith('1-1-')?{segmentationPlanId:'new-plan'}:{})}))}))}))}));
 const makeImages=async()=>{for(const ep of project.episodes)await store.update(ep.episodeNumber,r=>{for(const scene of r.scenes){r=editArtReview(r,{type:'approve',sceneId:scene.id},'qa');r.published[scene.id]={signature:reviewSceneSignature(r.scenes.find(s=>s.id===scene.id))};}return r;});
  assets=items.map((i,n)=>({id:'asset-'+i.id,name:i.name,category:i.category,episodes:[1,2],sceneIds:['1-1','1-2','2-1'],images:[{id:'img-'+i.id,url:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="${['#d5d2f1','#d4e8e1','#eedfc9'][n]}"/></svg>`)}]}));setImages(clone(assets));notifyBindingSaved(project.id,'qa',saved);};
 return <><nav className="qa-toolbar" style={{padding:12,display:'flex',gap:8,flexWrap:'wrap'}}>{[['director','导演工作台'],['info','信息读取'],['review','清单核实'],['story','分镜']].map(([id,name])=><button key={id} onClick={()=>setView(id)}>{name}</button>)}<button onClick={fill}>模拟补齐漏词</button><button onClick={regenerate}>模拟删词并换模型重生</button><button onClick={fresh}>刷新云端数据</button><button onClick={makeImages}>模拟素材图片完成</button><span>{message}</span></nav>
 {view==='director'?<DirectorWorkspace state={state} setState={setState} api={api} accountId="qa" onAttach={()=>{}}/>:<main style={{marginLeft:220,padding:20,minWidth:0}}>{view==='info'?<><h1>信息读取</h1><p>已按分集识别清单，后续按场景、提示词逐层关联。</p><button onClick={async()=>{await store.load(project,assets);await control.start();setMessage('信息读取与自动关联完成');}}>读取信息并自动关联</button></>:view==='review'?<ArtReviewSection project={live} assets={images} api={api} state={state} accountId="qa" canEdit refresh={fresh} onAnalyze={async()=>({})} onStop={()=>{}} onOpenArt={()=>{}}/>:<StoryboardWorkbench project={live} assets={images} api={api} state={state} accountId="qa" canEdit refresh={fresh} onProjectChange={setLive}/>}</main>}
 </>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

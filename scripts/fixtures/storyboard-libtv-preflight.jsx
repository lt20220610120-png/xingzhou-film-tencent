import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Shot} from '../../src/v06/StoryboardWorkbench.jsx';
import {invalidateLibTVReads} from '../../src/v06/libtvReads.js';
import '../../src/styles.css';
import '../../src/collab.css';
import '../../src/generation.css';
import '../../src/brand-theme.css';
import '../../canvas-app/workspace-controls.css';

const model={
 id:'fixture-model',name:'隔离视频模型',kind:'video',ratios:['16:9'],durations:[5],resolutions:['720p'],
 maxImages:8,maxAudios:2,maxVideos:2,schema:{
  properties:{modeType:{items:{text2video:[0,0],mixed2video:[1,12]}},
   ratio:{enum:['16:9'],default:'16:9'},
   duration:{min:5,max:5,default:5},
   resolution:{enum:['720p'],default:'720p'}},
  config:{settings:['ratio','duration','resolution']},
 },
};
const state={activeVideoApiId:'fixture-libtv',mediaProfiles:[{
 id:'fixture-libtv',provider:'libtv',kind:'video',name:'隔离 LibTV',
 endpoint:'https://www.liblib.tv',model:model.id,modelCatalog:[model],libtvOwnerKey:'fixture-owner',
}]};
const imageURL='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';
const shot={id:'fixture-shot',label:'1-1-1',content:'片段（参考@image1 @image2 @image3 @image4 @image5）、冷链重卡（参考@image6）、仓库（参考@image7），音色 @audio1 @audio2。',generationConfig:{
 profileId:'fixture-libtv',model:model.id,duration:5,
 references:[
  ...Array.from({length:5},(_,i)=>({id:'fixture-image-'+i,kind:'image',projectId:'fixture-project',name:'隔离参考图 '+i,url:imageURL+'#'+i})),
  {id:'old-truck-reference',assetId:'fixture-truck',kind:'image',projectId:'fixture-project',name:'冷链重卡'},
  {id:'old-warehouse-reference',assetId:'fixture-warehouse',kind:'image',projectId:'fixture-project',name:'仓库'},
  ...Array.from({length:2},(_,i)=>({id:'fixture-audio-'+i,kind:'audio',projectId:'fixture-project',name:'隔离音色 '+i,url:'data:audio/wav;base64,UklGRg==#'+i})),
 ],
}};
const episode={id:'fixture-episode',storyboardPrompts:[shot]};
const project={id:'fixture-project',storageMode:'local',episodes:[episode]};
const media=[];
const fixture=window.libTV201Fixture={projects:0,schemas:0,failProjects:false,failSchema:false};
const api={
 async libtvModelSchema(){fixture.schemas++;if(fixture.failSchema)throw Error("Error invoking remote method 'libtv-model-schema': Error: LibTV 读取模型失败（ECONNRESET）");return model;},
 async libtvProjects(){fixture.projects++;if(fixture.failProjects)throw Error("Error invoking remote method 'libtv-projects': Error: LibTV 读取项目失败（TLS_TIMEOUT）");return {projects:[{id:'fixture-canvas',name:'已核验画布'}],selectedId:'fixture-canvas'};},
 async collabPatchStoryboard({updates}){return {storyboardReceipt:{shot:{...shot,...updates}}};},
 async collabResolveAssetImage(){return {url:imageURL};},
 generationSubmit:input=>window.preflightFixture.submit(input),
 onLibTVProgress:callback=>window.preflightFixture.onProgress(callback),
 libtvCancelGeneration:input=>window.preflightFixture.cancel(input),
};
fixture.refreshProjects=()=>invalidateLibTVReads(api,{group:'projects',preserve:true});
fixture.refreshSchema=()=>invalidateLibTVReads(api,{group:'schema',preserve:true});
fixture.changeNetwork=()=>invalidateLibTVReads(api);

function Fixture(){
 const [tasks,setTasks]=useState([]);
 const [revision,setRevision]=useState(0);
 const [savedShot,setSavedShot]=useState(shot);
 const [adopted,setAdopted]=useState(false);
 const assets=[
  {id:'fixture-truck',name:'冷链重卡',noReferenceImage:!adopted,image_url:adopted?imageURL+'#truck':'',adoptedImageId:adopted?'truck-image':null},
  {id:'fixture-warehouse',name:'仓库',image_url:imageURL+'#warehouse',adoptedImageId:'warehouse-image'},
 ];
 fixture.remount=()=>setRevision(value=>value+1);
 fixture.adopt=async()=>{await window.preflightFixture.adopt();setAdopted(true);};
 fixture.savedPrompt=savedShot.content;
 api.collabPatchStoryboard=async({updates})=>{
  const next={...savedShot,...updates};
  setSavedShot(next);
  return {storyboardReceipt:{shot:next}};
 };
 const loadMedia=async()=>{setTasks(await window.preflightFixture.list());};
 useEffect(()=>{void loadMedia();},[]);
 return <main className="collab-stage collab-stage--storyboard"><Shot
  key={revision} shot={savedShot} episode={episode} epNumber={1} scene="1-1" project={project}
  api={api} state={state} assets={assets} media={media} tasks={tasks}
  canEdit loadMedia={loadMedia} onProjectChange={()=>{}} accountId="fixture-owner"
 /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

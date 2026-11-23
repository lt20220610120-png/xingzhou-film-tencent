import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Shot} from '../../src/v06/StoryboardWorkbench.jsx';
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
const shot={id:'fixture-shot',label:'1-1-1',content:'隔离提示词 @audio1',generationConfig:{
 profileId:'fixture-libtv',model:model.id,duration:5,
 references:[
  {id:'fixture-image',kind:'image',projectId:'fixture-project',name:'隔离参考图',url:'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'},
  {id:'fixture-audio',kind:'audio',projectId:'fixture-project',name:'隔离音色',url:'data:audio/wav;base64,UklGRg=='},
 ],
}};
const episode={id:'fixture-episode',storyboardPrompts:[shot]};
const project={id:'fixture-project',storageMode:'local',episodes:[episode]};
const assets=[],media=[];
const api={
 async libtvModelSchema(){return model;},
 async libtvProjects(){return {projects:[]};},
 async collabPatchStoryboard({updates}){return {storyboardReceipt:{shot:{...shot,...updates}}};},
 generationSubmit:input=>window.preflightFixture.submit(input),
};

function Fixture(){
 const [tasks,setTasks]=useState([]);
 const loadMedia=async()=>{setTasks(await window.preflightFixture.list());};
 useEffect(()=>{void loadMedia();},[]);
 return <main className="collab-stage collab-stage--storyboard"><Shot
  shot={shot} episode={episode} epNumber={1} scene="1-1" project={project}
  api={api} state={state} assets={assets} media={media} tasks={tasks}
  canEdit loadMedia={loadMedia} onProjectChange={()=>{}} accountId="fixture-owner"
 /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);

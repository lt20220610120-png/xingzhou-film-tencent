import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StoryboardWorkbench} from '../../src/v06/StoryboardWorkbench.jsx';
import '../../src/styles.css';
import '../../src/collab.css';
import '../../src/generation.css';
import '../../src/brand-theme.css';

const fixture=window.storyboardDurationFixture;
const api={
 collabPatchStoryboard:p=>fixture.patch(p),collabGetProject:()=>fixture.project(),collabListMedia:async()=>[],generationList:async()=>[],
 aiChat:p=>fixture.estimate(p),storyboardBatchStart:p=>fixture.start(p),storyboardBatchList:p=>fixture.list(p),
};
const assets=[];
function Harness(){
 const [state,setState]=useState(null),[project,setProject]=useState(null),stage=useRef(null);
 useEffect(()=>{void fixture.bootstrap().then(result=>{setState(result.state);setProject(result.project);});},[]);
 return state&&project&&<main ref={stage} className="collab-stage collab-stage--storyboard">
  <StoryboardWorkbench project={project} assets={assets} api={api} state={state} canEdit refresh={async()=>{}} onProjectChange={receipt=>{
   if(receipt.episodes){setProject(receipt);return;}
   const {episodeId,shot}=receipt.storyboardReceipt;
   setProject(value=>({...value,episodes:value.episodes.map(ep=>ep.id!==episodeId?ep:{...ep,storyboardPrompts:ep.storyboardPrompts.map(row=>row.id===shot.id?shot:row)})}));
  }} accountId="fixture-account" stageRef={stage}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);

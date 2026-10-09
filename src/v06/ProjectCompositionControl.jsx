import React,{useState,useRef}from'react';
import{CHARACTER_COMPOSITIONS,projectCharacterComposition}from'../../core/artImageComposition.js';
import{readableCloudError}from'../../core/collabAssetDrafts.js';
import'./project-composition.css';
export default function ProjectCompositionControl({project,api,refresh,canEdit,onProjectChange}){
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef(false);
 const change=async value=>{
  if(!canEdit||pending.current)return;pending.current=true;setBusy(true);setError('');
  try{const saved=await api.collabUpdateProject({projectId:project.id,scope:'art-image-settings',updates:{image_composition:value}});
   if(saved?.image_composition!==value)throw Error('云端尚未保存构图，请更新连接后重试');
   onProjectChange?.(saved);await refresh();
  }catch(e){setError(readableCloudError(e));}finally{pending.current=false;setBusy(false);}
 };
 return<div className="project-composition-control"><label><b>项目默认人物构图</b><select aria-label="项目默认人物构图" disabled={!canEdit||busy} value={projectCharacterComposition(project)} onChange={e=>change(e.target.value)}>{Object.entries(CHARACTER_COMPOSITIONS).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}</select></label><small>{busy?'正在保存到云端…':'全剧单人人物卡默认跟随；单卡选择和手写前置优先。五格建议使用 16:9 横屏。'}</small>{error&&<div className="collab-error" role="alert">构图保存失败：{error}</div>}</div>;
}

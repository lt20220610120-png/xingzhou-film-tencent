import React,{useState} from 'react';
import { splitIPScenes,replaceIPScene,formatIPScriptText,applyIPDisplayEdit } from '../../core/ipScenes.js';

export function IPSceneEditor({content='',onChange,onFocus,onBlur,readOnly=false,label='IP 剧本正文',settings=false}) {
 const [selected,setSelected]=useState(''),[whole,setWhole]=useState(false);
 const scenes=settings?[]:splitIPScenes(content),scene=scenes.find(s=>s.id===selected)||scenes[0];
 const editingScene=!whole&&!!scene;
 return <div className="ip-scene-editor">
  {!!scenes.length&&<nav className="ip-scene-rail" aria-label={`${label}场景选择`}><div className="ip-scene-rail-title">本集场景 <small>{scenes.length} 场</small></div><div className="ip-scene-strip">{scenes.map(s=><button type="button" key={s.id} className={editingScene&&scene.id===s.id?'active':''} onClick={()=>{setSelected(s.id);setWhole(false);}}><strong>场景 {s.label}</strong><small>{s.title.replace(/^(?:场景\s*)?\d+\s*[-—－]\s*\d+\s*/,'')}</small></button>)}</div><button type="button" className="ghost ip-whole-toggle" onClick={()=>setWhole(!whole)}>{whole?'返回分场':'查看整集'}</button></nav>}
  {editingScene&&<div className="ip-scene-edit-title">场景 {scene.label}<small>{readOnly?'版本只读':'编辑此场，总稿与分集同步'}</small></div>}
  <textarea aria-label={label} readOnly={readOnly} value={formatIPScriptText(editingScene?scene.content:content)} onFocus={onFocus} onBlur={onBlur} onChange={e=>onChange?.(editingScene?replaceIPScene(content,scene.id,applyIPDisplayEdit(scene.content,e.target.value),{preserveLineEndings:true}):applyIPDisplayEdit(content,e.target.value))} placeholder={settings?'设定与小传在这里，也可直接编辑…':'转写后自动识别场景，在这里逐场编辑…'}/>
 </div>;
}

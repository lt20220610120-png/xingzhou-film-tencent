import {FormattedText,FormattedEditor} from '../components/FormattedText.jsx';
import React,{useState} from 'react';
import {createPortal} from 'react-dom';
import { splitIPScenes,replaceIPScene } from '../../core/ipScenes.js';
import { ipEditorCharacterStats } from '../../core/ipTextStats.js';

export function IPSceneEditor({content='',onChange,onFocus,onBlur,readOnly=false,label='IP 剧本正文',settings=false,controlsTarget=null,compactControls=false,saveHint=''}) {
 const [selected,setSelected]=useState(''),[whole,setWhole]=useState(false);
 const scenes=settings?[]:splitIPScenes(content),scene=scenes.find(s=>s.id===selected)||scenes[0];
 const editingScene=!whole&&!!scene;
 const stats=ipEditorCharacterStats(content,editingScene?scene.content:undefined);
 const controls=!!scenes.length&&<nav className="ip-scene-rail" aria-label={`${label}场景选择`}><div className="ip-scene-rail-title">本集场景 <small>{scenes.length} 场</small></div><div className="ip-scene-strip">{scenes.map(s=><button type="button" key={s.id} title={s.title} aria-pressed={editingScene&&scene.id===s.id} className={editingScene&&scene.id===s.id?'active':''} onClick={()=>{setSelected(s.id);setWhole(false);}}><strong>场景 {s.label}</strong><small>{s.title.replace(/^(?:场景\s*)?\d+\s*[-—－]\s*\d+\s*/,'')}</small></button>)}</div><button type="button" className="ghost ip-whole-toggle" onClick={()=>setWhole(!whole)}>{whole?'返回分场':'查看整集'}</button></nav>;
 return <div className="ip-scene-editor">
  {controlsTarget?createPortal(controls,controlsTarget):controls}
  {editingScene&&!compactControls&&<div className="ip-scene-edit-title">场景 {scene.label}<small>{readOnly?'版本只读':'编辑此场，总稿与分集同步'}</small></div>}
  <FormattedEditor aria-label={label} readOnly={readOnly} value={editingScene?scene.content:content} onFocus={onFocus} onBlur={onBlur} onChange={e=>onChange?.(editingScene?replaceIPScene(content,scene.id,e.target.value,{preserveLineEndings:true}):e.target.value)} placeholder={settings?'设定与小传在这里，也可直接编辑…':'转写后自动识别场景，在这里逐场编辑…'}/>
  <div className="ip-text-stats" aria-label={`${label}字符统计`}><span>{readOnly?'所选版本 · ':''}{settings?'设定与小传':'整集'} <strong>{stats.total.toLocaleString()}</strong> 字符{stats.scene!==null&&<> · 当前场景 <strong>{stats.scene.toLocaleString()}</strong> 字符</>}</span><small>{saveHint||'含空白，不计标题格式标记'}</small></div>
 </div>;
}

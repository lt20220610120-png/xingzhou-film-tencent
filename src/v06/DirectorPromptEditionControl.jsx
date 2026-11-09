import React,{useState} from 'react';
import {Plus,PencilLine} from 'lucide-react';
import {Dialog} from './GlobalTools.jsx';
import {activeDirectorEditionId,directorPromptEditions} from '../../core/directorPromptEditions.js';

export function DirectorPromptEditionControl({project,disabled,onCreate,onSwitch,onRename}){
 const rows=directorPromptEditions(project),active=activeDirectorEditionId(project)||'original:'+project.id;
 const [dialog,setDialog]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const act=async fn=>{setBusy(true);setError('');try{await fn();setDialog('');}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="director-prompt-edition-control">
  <label>版本<select aria-label="导演提示词版本" value={active} disabled={disabled||busy} onChange={e=>void act(()=>onSwitch(e.target.value))}>
   {(rows.length?rows:[{id:active,name:'原始版本'}]).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
  </select></label>
  <button className="secondary" disabled={disabled||busy} onClick={()=>{setDialog('new');setName('');setError('');}}><Plus size={14}/>新建版本</button>
  {rows.length>0&&<button className="secondary" aria-label="重命名提示词版本" title="重命名版本" disabled={disabled||busy} onClick={()=>{setDialog('rename');setName(rows.find(row=>row.id===active)?.name||'');setError('');}}><PencilLine size={14}/></button>}
  {!dialog&&error&&<span role="alert">{error}</span>}
  {dialog&&<Dialog open title={dialog==='new'?'新建提示词版本':'重命名提示词版本'} onClose={()=>!busy&&setDialog('')}>
   <label>版本名称<input autoFocus aria-label="版本名称" maxLength={80} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&name.trim()&&!busy)void act(()=>dialog==='new'?onCreate(name):onRename(active,name));}}/></label>
   {dialog==='new'&&<p>新版本从空提示词开始，当前版本的提示词和创作内容会保留。</p>}
   {error&&<p role="alert">{error}</p>}
   <div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>setDialog('')}>取消</button><button className="primary" disabled={busy||disabled||!name.trim()} onClick={()=>void act(()=>dialog==='new'?onCreate(name):onRename(active,name))}>{busy?'保存中…':dialog==='new'?'创建版本':'保存名称'}</button></div>
  </Dialog>}
 </div>;
}

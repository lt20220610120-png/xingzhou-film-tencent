import React,{useState} from 'react';
import {Dialog} from './GlobalTools.jsx';
import {voiceStageLabels} from '../../core/characterVoices.js';

export default function AddCharacterVoiceDialog({characters,profiles,scenes,disabled,pending,error,onClose,onSelect,onManual}){
 const [manual,setManual]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const [fields,setFields]=useState({name:'',characterName:'',description:'',ageStage:'default',sceneIds:[]});
 const options=characters.filter(c=>!c.manual&&`${c.name} ${c.characterName} ${c.description}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <Dialog open title={manual?'手动补录人物音色':'添加人物音色'} onClose={()=>!pending&&onClose()} className="voice-add-dialog">
  {error&&<p className="collab-error" role="alert">{error}</p>}
  {manual?<form onSubmit={e=>{e.preventDefault();onManual({...fields,name:fields.name.trim(),characterName:fields.characterName.trim()});}}>
   <div className="voice-manual-fields">
    <label>卡片名称<input required maxLength={120} disabled={disabled} value={fields.name} onChange={e=>setFields({...fields,name:e.target.value})}/></label>
    <label>人物名称<input required maxLength={120} disabled={disabled} value={fields.characterName} onChange={e=>setFields({...fields,characterName:e.target.value})}/></label>
    <label>年龄阶段<select disabled={disabled} value={fields.ageStage} onChange={e=>setFields({...fields,ageStage:e.target.value})}>{Object.entries(voiceStageLabels).map(([key,label])=><option key={key} value={key}>{label||'默认'}</option>)}</select></label>
    <label className="voice-wide">人物介绍<textarea rows={2} disabled={disabled} value={fields.description} onChange={e=>setFields({...fields,description:e.target.value})}/></label>
    <fieldset className="voice-wide"><legend>选择关联场景</legend><div className="voice-scene-picker">{scenes.map(s=><label key={s.id}><input type="checkbox" disabled={disabled} checked={fields.sceneIds.includes(s.id)} onChange={e=>setFields({...fields,sceneIds:e.target.checked?[...fields.sceneIds,s.id]:fields.sceneIds.filter(id=>id!==s.id)})}/>{s.id}</label>)}</div></fieldset>
   </div>
   <footer><button type="button" className="ghost" disabled={disabled} onClick={()=>setManual(false)}>返回选择人物</button><button type="submit" className="primary" disabled={disabled||!fields.name.trim()||!fields.characterName.trim()}>添加</button></footer>
  </form>:<>
   <label className="voice-add-search">选择人物<input type="search" aria-label="搜索已读取人物" placeholder="搜索人物" value={search} disabled={disabled} onChange={e=>setSearch(e.target.value)}/></label>
   <div className="voice-add-options" role="radiogroup" aria-label="已读取人物">
    {options.map(c=><label key={c.key} className={selected===c.key?'selected':''}><input type="radio" name="voice-character" value={c.key} checked={selected===c.key} disabled={disabled} onChange={()=>setSelected(c.key)}/><span><strong>{c.name}</strong><small>{c.episodes.length} 集 · {c.speakingSceneIds.length} 个对白场景</small></span><small>{profiles[c.key]?.confirmed?'已采用音色':profiles[c.key]?.candidates?.length?'待采用音色':'未生成音色'}</small></label>)}
    {!options.length&&<p role="status">{search?'没有匹配的人物':'暂无已读取人物'}</p>}
   </div>
   <footer><button className="ghost" disabled={disabled} onClick={()=>setManual(true)}>未找到人物？手动补录</button><button className="primary" disabled={disabled||!options.some(c=>c.key===selected)} onClick={()=>onSelect(selected)}>添加</button></footer>
  </>}
 </Dialog>;
}

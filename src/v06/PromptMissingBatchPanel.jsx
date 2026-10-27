import React,{useState} from 'react';
import {ChevronDown} from 'lucide-react';

const keyOf=({entry,need})=>JSON.stringify([entry.id,need.id]);
export default function PromptMissingBatchPanel({items,disabled,isBusy,onSkip,onSupplement,canSupplement,progress,onBackScene}){
 const [selected,setSelected]=useState([]);
 if(!items.length)return null;
 const chosen=items.filter(row=>selected.includes(keyOf(row)));
 const blocked=rows=>disabled||rows.some(row=>isBusy(row.entry.id));
 return <details className="art-review-prompt-missing-batch">
  <summary><strong>提示词待处理</strong><span>全剧 {items.length} 项未确认</span><ChevronDown size={16}/></summary>
  <div className="art-review-prompt-missing-body">
   <header><label><input type="checkbox" aria-label="选择全部待处理项" checked={chosen.length===items.length} disabled={disabled} onChange={e=>setSelected(e.target.checked?items.map(keyOf):[])}/>全选<span>已选 {chosen.length} 项</span></label><div><button className="art-review-primary" disabled={!chosen.length||!canSupplement||blocked(chosen)} onClick={()=>onSupplement(chosen)}>一键补充勾选项</button><button disabled={!chosen.length||blocked(chosen)} onClick={()=>onSkip(chosen)}>一键确认所选无需参考图</button><button disabled={blocked(items)} onClick={()=>onSkip(items)}>一键确认全部无需参考图</button></div></header>
   {progress&&<p className="art-review-supplement-progress" role="status">{progress}</p>}
   <div className="art-review-prompt-missing-list">{items.map(row=>{const {entry,need}=row,key=keyOf(row);return <article key={key}><label><input type="checkbox" aria-label={`选择 ${entry.label} ${need.text}`} checked={selected.includes(key)} disabled={disabled} onChange={e=>setSelected(old=>e.target.checked?[...old,key]:old.filter(k=>k!==key))}/><strong>{entry.label}</strong><span>{need.category==='character'?'人物':need.category==='scene'?'场景':'道具'} · {need.text}</span></label><div><button className="art-review-primary" disabled={!canSupplement||blocked([row])} onClick={()=>onSupplement([row])}>一键补充</button><button disabled={blocked([row])} onClick={()=>onSkip([row])}>确认无需参考图</button><button disabled={disabled} onClick={()=>onBackScene(entry)}>返回场景补充</button></div></article>})}</div>
  </div>
 </details>;
}

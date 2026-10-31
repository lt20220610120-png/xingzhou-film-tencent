import React from 'react';
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react';
import {ChoiceField} from './ProductionControls.jsx';
import {videoFallbackSteps} from '../../core/productionVideoPolicy.js';
export function VideoRetrySettings({config,onChange,models,disabled=false}){
 const steps=videoFallbackSteps(config);
 const update=next=>onChange({videoFallbacks:next,videoFallbackEnabled:next.length>0,fallbackVideoModel:next[0]?.modelId||'',fallbackVideoAttempts:next[0]?.attempts??2});
 const edit=(i,patch)=>update(steps.map((s,k)=>k===i?{...s,...patch}:s));
 const move=(i,offset)=>{const next=[...steps];[next[i],next[i+offset]]=[next[i+offset],next[i]];update(next);};
 const count=(label,value,onSelect)=><label>{label}<select aria-label={label} value={value??2} disabled={disabled} onChange={e=>onSelect(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} 次（含首次）</option>)}</select></label>;
 return <section className="furnace-video-retry" aria-label="视频失败处理"><div className="furnace-retry-heading"><h4>失败重试与备用模型</h4><button type="button" disabled={disabled} onClick={()=>update([...steps,{id:crypto.randomUUID(),modelId:'',attempts:2}])}><Plus size={16}/>添加备用模型</button></div><div className="furnace-form two">{count('主模型尝试次数',config.videoAttempts,n=>onChange({videoAttempts:n}))}</div><ol className="furnace-retry-chain">{steps.map((s,i)=><li key={s.id||i}><span className="furnace-retry-number">{i+1}</span><ChoiceField label={`备用 ${i+1} 视频模型`} options={models} value={s.modelId} onChange={v=>edit(i,{modelId:v})} disabled={disabled}/>{count(`备用 ${i+1} 尝试次数`,s.attempts,n=>edit(i,{attempts:n}))}<div className="furnace-retry-actions"><button type="button" aria-label={`上移备用 ${i+1}`} title="上移" disabled={disabled||i===0} onClick={()=>move(i,-1)}><ArrowUp size={16}/></button><button type="button" aria-label={`下移备用 ${i+1}`} title="下移" disabled={disabled||i===steps.length-1} onClick={()=>move(i,1)}><ArrowDown size={16}/></button><button type="button" aria-label={`移除备用 ${i+1}`} title="移除" disabled={disabled} onClick={()=>update(steps.filter((_,k)=>k!==i))}><Trash2 size={16}/></button></div></li>)}</ol></section>;
}

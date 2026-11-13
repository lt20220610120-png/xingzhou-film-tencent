import React,{useEffect,useRef,useState} from 'react';
import {Bot,RefreshCw,Check,ArrowRight} from 'lucide-react';
export const effortNames={none:'关闭',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'超高',max:'最高',ultra:'极高'};
const readable=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
export function LocalCodexModels({model='',reasoningEffort='',onChange,onImport,profiles=[],imageOnly=false}){
 const [catalog,setCatalog]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState([]),[query,setQuery]=useState(''),[efforts,setEfforts]=useState({});
 const sequence=useRef(0),changeRef=useRef(onChange);changeRef.current=onChange;
 const selectionRef=useRef({model,reasoningEffort});selectionRef.current={model,reasoningEffort};
 const refresh=async()=>{const id=++sequence.current;setBusy(true);setError('');try{
  if(!window.xingzhou?.codexLocalCatalog)throw Error('请在桌面应用中连接本机 Codex');
  const result=await window.xingzhou.codexLocalCatalog();if(id!==sequence.current)return;
  setCatalog(result);setEfforts(previous=>Object.fromEntries(result.models.map(m=>{const saved=profiles.find(p=>p.provider==='codexLocal'&&p.model===m.id)?.reasoningEffort;const value=[previous[m.id],saved,m.defaultEffort,m.efforts?.[0]].find(e=>m.efforts?.includes(e))||'';return [m.id,value];})));setSelected(s=>s.filter(id=>result.models.some(m=>m.id===id)));
  const current=selectionRef.current,chosen=result.models.find(m=>m.id===current.model);
  // Preserve a missing saved model until the user explicitly selects a replacement.
  if(!current.model){const first=result.models.find(m=>m.isDefault)||result.models[0];if(first)changeRef.current?.({model:first.id,reasoningEffort:first.defaultEffort||first.efforts?.[0]||''});}
  else if(chosen?.efforts?.length&&!chosen.efforts.includes(current.reasoningEffort))changeRef.current?.({reasoningEffort:chosen.defaultEffort||chosen.efforts[0]});
 }catch(e){if(id===sequence.current){setError(readable(e));setCatalog(null);setSelected([]);}}finally{if(id===sequence.current)setBusy(false);}};
 useEffect(()=>{void refresh();return()=>{sequence.current++;};},[]);
 const rows=catalog?.models||[],current=rows.find(m=>m.id===model);
 const choose=id=>{const row=rows.find(m=>m.id===id);onChange?.({model:id,reasoningEffort:row?.efforts?.includes(reasoningEffort)?reasoningEffort:row?.defaultEffort||row?.efforts?.[0]||''});};
 return <section className="local-codex-panel full" aria-label="本机 Codex 连接">
  <header><span className="access-icon"><Bot size={22}/></span><div><strong>连接你电脑上的 Codex</strong><small>使用已登录的 ChatGPT 账号额度</small></div><button type="button" className="secondary" onClick={refresh} disabled={busy}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'正在读取…':'刷新模型'}</button></header>
  {catalog&&<><div className="codex-account"><span><i/>{catalog.account?.email||'ChatGPT 已登录'}</span><b>{catalog.account?.plan||'ChatGPT'}</b><small>{rows.length} 个模型 · {new Date(catalog.checkedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} 更新</small></div>
   {!!catalog.windows.length&&<div className="codex-quota">{catalog.windows.map(w=><div key={w.id}><span>{w.bucket} · {w.minutes? w.minutes<1440?`${w.minutes/60} 小时窗口`:`${Math.round(w.minutes/1440)} 天窗口`:'使用窗口'}<b>剩余 {Math.round(100-w.usedPercent)}%</b></span><progress max="100" value={100-w.usedPercent}/>{w.resetsAt&&<small>重置时间：{new Date(w.resetsAt*1000).toLocaleString('zh-CN')}</small>}</div>)}</div>}
   {catalog.quotaError&&<p className="codex-hint">模型已读取，额度暂时不可读取。</p>}
  </>}
  {error&&<p className="auth-error" role="alert">{error}</p>}
  {onImport&&catalog?.imageGeneration&&<div className="codex-import-actions"><button type="button" className="secondary" onClick={()=>onImport([{kind:'image',provider:'codexLocalImage',name:'本机 Codex · GPT Image 2',model:'gpt-image-2',capabilities:{maxImages:5}}])}>导入生图 · GPT Image 2</button></div>}
  {imageOnly&&catalog&&!catalog.imageGeneration&&<p role="status">当前 Codex 未启用内置生图能力。</p>}
  {!imageOnly&&(onImport?<>{!!rows.length&&<><input type="search" aria-label="搜索 Codex 模型" placeholder="搜索模型名称或 ID" value={query} onChange={e=>setQuery(e.target.value)}/><div className="codex-import-list">{rows.filter(m=>`${m.name} ${m.id}`.toLowerCase().includes(query.toLowerCase())).map(m=><div className="codex-import-row" key={m.id}><label><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,m.id]:s.filter(id=>id!==m.id))}/><span><strong>{m.name}</strong><small>{m.id}{m.hidden?' · 目录隐藏模型':''}</small></span>{m.isDefault&&<b>推荐</b>}</label><label className="codex-effort-choice">思考强度<select aria-label={`${m.id} 思考强度`} disabled={busy||!m.efforts?.length} value={efforts[m.id]||''} onChange={e=>setEfforts(values=>({...values,[m.id]:e.target.value}))}>{!m.efforts?.length&&<option value="">模型默认</option>}{m.efforts?.map(e=><option key={e} value={e}>{effortNames[e]||e}（{e}）</option>)}</select></label></div>)}</div><div className="codex-import-actions"><button type="button" onClick={()=>setSelected(rows.map(m=>m.id))}>选择全部</button><button type="button" className="primary" disabled={busy||!selected.length} onClick={()=>onImport(rows.filter(m=>selected.includes(m.id)).map(m=>({provider:'codexLocal',kind:'chat',name:`本机 Codex · ${m.id}`,endpoint:'',model:m.id,apiKey:'',requiresApiKey:false,reasoningEffort:efforts[m.id]||m.defaultEffort||m.efforts?.[0]||'',codexEfforts:m.efforts||[],codexEffortSelected:true})))}><Check size={15}/>导入所选（{selected.length}）</button></div></>}</>:<div className="codex-model-fields"><label>Codex 模型<select aria-label="Codex 模型" value={model} onChange={e=>choose(e.target.value)} disabled={busy||!rows.length}>{!current&&<option value={model}>{model?`${model} · 当前目录未确认，请重新选择`:'连接后选择模型'}</option>}{rows.map(m=><option key={m.id} value={m.id}>{m.name}{m.isDefault?' · 推荐':''}{m.hidden?' · 目录隐藏模型':''}</option>)}</select></label><label>思考强度<select aria-label="Codex 推理档位" value={reasoningEffort} disabled={busy||!current?.efforts?.length} onChange={e=>onChange({reasoningEffort:e.target.value})}>{!current?.efforts?.includes(reasoningEffort)&&<option value={reasoningEffort}>{reasoningEffort?effortNames[reasoningEffort]||reasoningEffort:'模型默认'}</option>}{current?.efforts?.map(id=><option key={id} value={id}>{effortNames[id]||id}（{id}）</option>)}</select></label></div>)}
  {!imageOnly&&<p className="codex-hint"><ArrowRight size={14}/>Codex 更新或切换账号后，点击“刷新模型”读取最新目录；每个模型可独立选择思考强度，导入时保存所选档位。</p>}
 </section>;
}

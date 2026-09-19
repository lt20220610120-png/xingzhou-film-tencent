import React, {useState} from 'react';
import {discoveredModelKind, normalizeCapabilities} from '../../core/modelCapabilities.js';
export const MODEL_KIND_NAMES = {chat:'文本对话',image:'图片生成',video:'视频生成',audio:'语音模型'};
export function ModelImport({onSave,onCancel}) {
  const [config,setConfig]=useState({endpoint:'',apiKey:'',protocol:'auto'});
  const [models,setModels]=useState([]),[selected,setSelected]=useState([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const update=(key,value)=>{setConfig(c=>({...c,[key]:value}));setModels([]);setSelected([]);};
  const read=async()=>{setBusy(true);setError('');try{
    const rows=await window.xingzhou.discoverModels(config);
    setModels(rows.map(m=>({...m,kind:discoveredModelKind(m),capabilities:normalizeCapabilities(m.capabilities)})));
    setSelected([]); if(!rows.length)setError('没有返回可用模型，可通过添加接口手动配置');
  }catch(e){setError(e.message);}finally{setBusy(false);}};
  const visible=models.filter(m=>`${m.id} ${m.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="api-config-form"><p>填写一个接口即可拉取模型。勾选所需模型并确认用途，每个模型保存为独立配置，各窗口互不影响。</p>
    <label>接口地址<input disabled={busy} value={config.endpoint} placeholder="https://服务商域名/v1" onChange={e=>update('endpoint',e.target.value)}/></label>
    <label>API Key<input disabled={busy} type="password" autoComplete="off" value={config.apiKey} onChange={e=>update('apiKey',e.target.value)}/></label>
    <label>列表协议<select disabled={busy} value={config.protocol} onChange={e=>update('protocol',e.target.value)}><option value="auto">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select></label>
    <button className="secondary" disabled={busy||!config.endpoint.trim()} onClick={read}>{busy?'读取中…':'拉取模型'}</button>
    {!!models.length&&<><input aria-label="搜索模型" placeholder="搜索模型 ID" value={query} onChange={e=>setQuery(e.target.value)}/><small>用途可修改；未返回参数的模型，保存后可在编辑中补充。语音模型可保存配置，当前版本暂无独立语音生成工作台。</small>
      <div style={{maxHeight:320,overflowY:'auto'}}>{visible.map(m=><div key={m.id} style={{display:'flex',gap:10,alignItems:'center',padding:'8px 0'}}><input type="checkbox" style={{width:18}} checked={selected.includes(m.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,m.id]:s.filter(id=>id!==m.id))}/><span style={{flex:1,minWidth:0,overflowWrap:'anywhere'}}>{m.id}</span><select aria-label={`${m.id} 用途`} style={{width:130}} value={m.kind} onChange={e=>setModels(rows=>rows.map(row=>row.id===m.id?{...row,kind:e.target.value}:row))}>{Object.entries(MODEL_KIND_NAMES).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>)}</div></>}
    {error&&<p role="alert" className="collab-error">{error}</p>}<div className="modal-actions"><button className="ghost" onClick={onCancel}>取消</button><button className="primary" disabled={!selected.length||busy} onClick={()=>onSave(models.filter(m=>selected.includes(m.id)).map(m=>({...config,endpoint:m.endpoint||config.endpoint.trim(),apiKey:config.apiKey.trim(),provider:'custom',name:m.name,model:m.id,kind:m.kind,capabilities:m.capabilities})))}>导入所选（{selected.length}）</button></div>
  </div>;
}

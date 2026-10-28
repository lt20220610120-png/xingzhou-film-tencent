import React, {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Bot, Check, ChevronDown, FolderOpen, Monitor, Search, X} from 'lucide-react';

// Native modal supplies focus containment, Escape and focus restoration.
export function ChoiceField({label, value, options = [], onChange, disabled = false, placeholder = '点击选择', hint}) {
 const [open, setOpen] = useState(false), [query, setQuery] = useState('');
 const dialog = useRef(null), trigger = useRef(null), titleId = useId();
 const choices = options.map(o => typeof o === 'string' ? {id:o, name:o} : o);
 const selected = choices.find(o => String(o.id) === String(value));
 useEffect(() => {
  if (!open) return;
  dialog.current?.showModal();
  return () => { dialog.current?.close(); trigger.current?.focus(); };
 }, [open]);
 const close = () => setOpen(false);
 const filtered = choices.filter(o => `${o.name} ${o.id}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="furnace-field"><span className="furnace-label">{label}</span>
  <button ref={trigger} type="button" className="furnace-choice" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} title={selected?.name || ''} onClick={() => {setQuery(''); setOpen(true);}}>
   <span className={!selected ? 'placeholder' : ''}>{selected?.name || (value ? '原选择暂不可用，请重新选择' : placeholder)}</span><ChevronDown size={16}/>
  </button>{hint && <small className="furnace-field-hint">{hint}</small>}
  {open && createPortal(<dialog ref={dialog} className="furnace-picker" aria-labelledby={titleId} onCancel={close} onClick={e => {if(e.target === dialog.current) close();}}>
   <div className="furnace-picker-head"><div><small>制作设置</small><h3 id={titleId}>{label}</h3></div><button type="button" aria-label="关闭选择窗口" onClick={close}><X size={20}/></button></div>
   <div className="furnace-search"><Search size={18}/><input autoFocus aria-label={`搜索${label}`} placeholder="搜索名称…" value={query} onChange={e=>setQuery(e.target.value)}/>{query && <button type="button" aria-label="清除搜索" onClick={()=>setQuery('')}><X size={16}/></button>}</div>
   <div className="furnace-picker-options">{filtered.map(o=><button type="button" key={o.id} className={String(o.id)===String(value)?'selected':''} onClick={()=>{onChange(o.id);close();}}><span>{o.name}</span>{String(o.id)===String(value)&&<Check size={18}/>}</button>)}{!filtered.length&&<p>{choices.length?'没有找到匹配项，换个关键词试试。':'暂无可选项，请先完成连接或配置对应模型。'}</p>}</div>
   <div className="furnace-picker-foot"><span>{filtered.length} 个可选项</span><button type="button" onClick={close}>取消</button></div>
  </dialog>,document.body)}
 </div>;
}

export function PathField({label, value, kind='folder', onPick, onClear, disabled=false}) {
 const Icon=kind==='folder'?FolderOpen:Monitor;
 const name=value?.split(/[\\/]/).filter(Boolean).pop();
 return <div className="furnace-field furnace-path"><span className="furnace-label">{label}</span><div className="furnace-path-row">
  <button type="button" className={`furnace-path-button ${value?'has-value':''}`} disabled={disabled} onClick={onPick} aria-label={`选择${label}`} title={value||label}>
   <span className="furnace-path-icon"><Icon size={20}/></span><span className="furnace-path-copy"><strong>{name||(kind==='folder'?'选择或新建文件夹':'选择已安装的软件')}</strong><small>{value||(kind==='folder'?'点击打开文件夹窗口':'点击浏览本机应用程序')}</small></span><span className="furnace-path-action">{value?'更换':'浏览'}</span>
  </button>{value&&onClear&&<button className="furnace-icon-button" type="button" disabled={disabled} aria-label={`清空${label}`} onClick={onClear}><X size={16}/></button>}
 </div></div>;
}

export function AgentCard({editing, config, connection, busy, onChange, onPick, onConnect, onDiscover, onReuse}) {
 const pathKey=editing?'editAgentPath':'agentPath', protocolKey=editing?'editAgentProtocol':'agentProtocol', modelKey=editing?'editModel':'agentModel';
 const matches=connection?.path===config[pathKey]&&connection?.protocol===config[protocolKey];
 const connected=matches&&connection?.connected===true;
 const error=matches?connection?.error:'';
 return <div className="furnace-agent-card">
  <div className="furnace-agent-heading"><span className="furnace-agent-icon"><Bot size={24}/></span><div><h4>{editing?'剪辑智能体':'制作智能体'}</h4><p>{editing?'按你的剪辑指令逐集制作':'负责检查、关联与制作调度'}</p></div><span className={`furnace-status ${connected?'connected':error?'failed':''}`}>{connected?'已连接':connection?.pending&&matches?'连接中':error?'连接失败':'待连接'}</span></div>
  <div className="furnace-agent-types">{[{id:'codex',name:'Codex'},{id:'acp',name:'其他 Agent · ACP'}].map(o=><button type="button" key={o.id} disabled={busy} aria-pressed={config[protocolKey]===o.id} onClick={()=>{if(config[protocolKey]!==o.id)onChange({[protocolKey]:o.id,[pathKey]:'',[modelKey]:''});}}>{o.name}{config[protocolKey]===o.id&&<Check size={16}/>}</button>)}</div>
  <div className="furnace-agent-body"><PathField label={editing?'剪辑 Agent 连接组件':'制作 Agent 连接组件'} kind="file" value={config[pathKey]} disabled={busy} onPick={onPick}/>
   <div className="furnace-agent-actions"><button type="button" disabled={busy||config[protocolKey]!=='codex'} onClick={onDiscover}>自动查找 Codex</button>{editing&&<button type="button" disabled={busy||!config.agentPath} onClick={onReuse}>沿用制作智能体</button>}<button type="button" className="primary" disabled={busy||!config[pathKey]} onClick={onConnect}>{connection?.pending?'正在连接…':connected?'重新检查':'连接智能体'}</button></div>
   {error&&<p className="furnace-inline-error" role="alert">{error}</p>}
   <ChoiceField label={editing?'剪辑 Agent 模型':'制作 Agent 模型'} value={config[modelKey]} options={connected?connection.models||[]:[]} disabled={busy||!connected} onChange={v=>onChange({[modelKey]:v})} placeholder={connected?'点击选择模型':'连接后选择模型'} hint={connected&&!connection.models?.length?'此连接未返回模型列表，请检查连接组件。':config[protocolKey]==='codex'?'使用本机 Codex 的登录状态，无需填写密钥。':'仅支持提供 ACP 协议的连接组件。'}/>
  </div>
 </div>;
}

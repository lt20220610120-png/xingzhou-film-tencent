import {useWorkspacePolling} from './useWorkspacePolling.js';
import {useWorkspaceActive} from '../components/WorkspacePresence.jsx';
import LibTVProjectControl from './LibTVProjectControl.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {saveLibTVProfiles} from '../../core/libtv.js';
import {libTVNetworkReport,libTVNetworkReportLine} from './libtvNetworkDiagnostics.js';
import {invalidateLibTVReads} from './libtvReads.js';
import {libTVError} from './libtvError.js';

function proxyAddress(value){
 const input=value.trim(),address=/^(https?|socks(?:4|5h?)?):\/\/([^/?#\\\s]+)\/?$/i.exec(input);
 if(!address)throw Error('请输入 HTTP、HTTPS 或 SOCKS5 代理地址。');
 if(address[2].includes('@'))throw Error('代理地址不能包含用户名或密码。');
 try{
  const url=new URL(input);
  if(!url.hostname||url.port==='0'||url.username||url.password||!['','/'].includes(url.pathname))throw Error();
 }catch{throw Error('请核对代理主机和端口。');}
 return input;
}

function LibTVNetworkSettings({api,disabled,onTestingChange,onAccountCheck}){
 const [saved,setSaved]=useState(null),[mode,setMode]=useState('system'),[proxy,setProxy]=useState('');
 const [saving,setSaving]=useState(false),[testing,setTesting]=useState(false),[report,setReport]=useState(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(true),pending=useRef(null);
 const active=useWorkspaceActive();
 const supported=typeof api.libtvNetworkSettings==='function';

 const cancel=async(announce=false)=>{
  if(!pending.current)return;
  pending.current=null;
  try{await api.libtvCancelConnectionTest?.();}
  catch{if(announce&&alive.current)setError('停止测试失败，请关闭连接设置后重试。');}
  finally{if(alive.current){setTesting(false);onTestingChange(false);if(announce)setNotice('连接测试已停止。');}}
 };
 useEffect(()=>{
  let current=true;
  alive.current=true;
  if(supported)api.libtvNetworkSettings().then(value=>{
   if(!current)return;
   setSaved(value);setMode(value.mode);setProxy(value.proxyUrl||'');
  }).catch(()=>{if(current)setError('读取本机网络设置失败。');});
  return()=>{current=false;alive.current=false;void cancel();};
 },[api,supported]);
 useEffect(()=>{if(!active)void cancel();},[active]);

 const save=async(nextMode)=>{
  setError('');setNotice('');setReport(null);
  let proxyUrl='';
  try{if(nextMode==='custom')proxyUrl=proxyAddress(proxy);}
  catch(reason){setError(reason.message);return;}
  setSaving(true);
  try{
   const value=await api.libtvSaveNetworkSettings({mode:nextMode,proxyUrl});
   invalidateLibTVReads(api);
   if(alive.current){setSaved(value);setMode(value.mode);setProxy(value.proxyUrl||'');setNotice('已应用本机网络设置。');onAccountCheck('unchecked');}
  }catch{if(alive.current){if(nextMode!=='custom')setMode(saved.mode);setError('应用网络设置失败，请检查配置或等待当前任务结束。');}}
  finally{if(alive.current)setSaving(false);}
 };
 const startTest=async()=>{
  if(pending.current)return;
  const ticket={};pending.current=ticket;
  setError('');setNotice('');setReport(null);setTesting(true);onTestingChange(true);
  let response;
  try{response=await api.libtvTestConnection();}
  catch{response={ok:false,steps:[{stage:'account',ok:false,code:'NETWORK_ERROR'}]};}
  if(!alive.current||pending.current!==ticket)return;
  pending.current=null;
  const result=libTVNetworkReport(response);
  onAccountCheck(result.steps.find(step=>step.key==='account')?.ok===true);
  setReport(result);setTesting(false);onTestingChange(false);
 };
 const copy=async()=>{
  setNotice('');setError('');
  try{
   await navigator.clipboard.writeText([report.summary,...report.steps.map(libTVNetworkReportLine),report.suggestion].filter(Boolean).join('\n'));
   setNotice('已复制诊断信息。');
  }catch{setError('复制未完成，可选择诊断文字后复制。');}
 };
 const edited=mode!==saved?.mode||(mode==='custom'&&proxy.trim()!==saved?.proxyUrl);
 const locked=disabled||!saved||saving||testing;
 if(!supported)return null;
 return <section className="libtv-network-settings" aria-label="本机网络设置">
  <div className="libtv-network-fields">
   <label>网络模式<select aria-label="LibTV 网络模式" value={mode} disabled={locked} onChange={event=>{
    const next=event.target.value;setMode(next);setError('');setNotice('');setReport(null);
    if(next!=='custom')void save(next);
   }}>
    <option value="system">跟随系统（默认）</option>
    <option value="direct">直连（不走系统代理）</option>
    <option value="custom">自定义代理</option>
   </select></label>
   {mode==='custom'&&<label>代理地址<input aria-label="自定义代理地址" autoComplete="off" spellCheck={false} maxLength={320}
    placeholder="例如 socks5://127.0.0.1:7897" value={proxy} disabled={locked} onChange={event=>{
     setProxy(event.target.value);setError('');setNotice('');setReport(null);
    }}/></label>}
  </div>
  <div className="libtv-connection-actions">
   {mode==='custom'&&<button type="button" className="secondary" disabled={locked||!edited||!proxy.trim()} onClick={()=>void save('custom')}>{saving?'应用中…':'应用代理'}</button>}
   <button type="button" className="secondary" title="连接测试不消耗积分" disabled={locked||edited} onClick={()=>void startTest()}>{testing?'正在测试…':'连接测试'}</button>
   {testing&&<button type="button" className="ghost" onClick={()=>void cancel(true)}>停止测试</button>}
   {report&&<button type="button" className="ghost" onClick={()=>void copy()}>复制诊断信息</button>}
  </div>
  {report&&<div className="libtv-network-report" role="status">
   <strong>{report.summary}</strong>
   <ul>{report.steps.map(step=><li key={step.key}>{libTVNetworkReportLine(step)}</li>)}</ul>
   {report.suggestion&&<small>{report.suggestion}</small>}
  </div>}
  {notice&&<small role="status">{notice}</small>}
  {error&&<p role="alert" className="collab-error">{error}</p>}
 </section>;
}

export function LibTVConnection({state,setState,onClose,api=window.xingzhou}){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[accounts,setAccounts]=useState([]),[notice,setNotice]=useState(''),[networkTesting,setNetworkTesting]=useState(false);
 const [accountCheck,setAccountCheck]=useState(null);
 const live=useRef(true),statusEpoch=useRef(0),locked=Boolean(busy)||networkTesting,configured=status?.loggedIn||status?.configured;
 const reachable=accountCheck??status?.loggedIn;
 const recordAccountCheck=next=>{statusEpoch.current++;setAccountCheck(next);};
 const refresh=async(readModels=false,knownStatus)=>{
  const expected=statusEpoch.current,info=knownStatus||await api.libtvStatus();if(!live.current||expected!==statusEpoch.current)return;setStatus(info);setAccountCheck(null);
  if(info.loggedIn){setAccounts(await api.libtvAccounts());if(readModels){const directory=await api.libtvModels();for(const [kind,key] of [['image','imageModels'],['video','videoModels']]){const old=(state.mediaProfiles||[]).find(p=>p.provider==='libtv'&&p.kind===kind&&p.libtvOwnerKey===info.ownerKey),selected=directory[key].find(m=>m.id===old?.model)||directory[key][0];if(selected){try{const full=await api.libtvModelSchema({model:selected.id,kind});directory[key]=directory[key].map(m=>m.id===selected.id?full:m);}catch(e){if(live.current)setError(libTVError(e));}}}if(!live.current)return;setState(s=>saveLibTVProfiles(s,directory));setNotice(`已接入 ${directory.imageModels.length} 个图片模型、${directory.videoModels.length} 个视频模型，可在图视生成和协作分镜选择。`);}}
 };
 const action=async(name,fn)=>{setBusy(name);setError('');setAccountCheck(null);try{await fn();}catch(e){if(live.current)setError(libTVError(e));}finally{if(live.current)setBusy('');}};
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useWorkspacePolling(async current=>{
  if(status)return;
  try{await refresh();}
  catch(reason){if(current())setStatus({loggedIn:false,message:libTVError(reason)});}
 },{repeat:false});
 useWorkspacePolling(async current=>{
  try{
   const info=await api.libtvStatus();
   if(!current())return;
   setStatus(info);
   if(info.loggedIn){invalidateLibTVReads(api);await action('读取模型',()=>refresh(true,info));}
  }catch(e){if(current())setStatus(previous=>({...previous,message:libTVError(e)}));}
 },{enabled:Boolean(status?.pendingLogin)&&!locked,delay:2000,immediate:false});
 const selectModel=async(profile,id)=>action('读取模型参数',async()=>{const model=await api.libtvModelSchema({model:id,kind:profile.kind});setState(s=>({...s,mediaProfiles:s.mediaProfiles.map(p=>p.id===profile.id?{...p,model:id,capabilities:model,modelCatalog:p.modelCatalog.map(m=>m.id===id?model:m)}:p)}));});
 return <div className="libtv-connection">
  <div className="libtv-connection-status" role="status"><strong>{busy?busy+'…':status?.pendingLogin?'等待浏览器授权':reachable==='unchecked'?'LibTV 通道待测试':reachable?'LibTV 已连接':configured?'本机已授权 · 连接暂不可用':status?'LibTV 未连接':'检查授权状态…'}</strong>
   <span>{status?.loggedIn&&reachable===true?`${status.userName} · ${status.accountName}`:accountCheck===null&&status?.message?libTVError(status.message):''}</span>
  </div>
  <div className="libtv-connection-actions">
   <button type="button" className="primary" disabled={locked||status?.pendingLogin||status?.running} onClick={()=>action('打开授权页面',async()=>{setStatus(await api.libtvLogin());invalidateLibTVReads(api);})}>{configured?'重新登录 / 更换账号':'连接 LibTV 账号'}</button>
   <button type="button" className="secondary" disabled={locked} onClick={()=>action('刷新连接',()=>refresh(true))}>刷新连接与模型</button>
   {status?.pendingLogin?<button type="button" className="secondary" disabled={locked} onClick={()=>action('取消授权',async()=>setStatus(await api.libtvCancelLogin()))}>取消等待</button>
    :configured&&<button type="button" className="secondary" disabled={locked||status.running} onClick={()=>action('断开连接',async()=>{setStatus(await api.libtvLogout());setAccounts([]);invalidateLibTVReads(api);})}>断开本机连接</button>}
  </div>
  <LibTVNetworkSettings api={api} disabled={Boolean(busy)||status?.running} onTestingChange={setNetworkTesting} onAccountCheck={recordAccountCheck}/>
  {status?.loggedIn&&accounts.length>0&&<label>LibTV 个人 / 团队空间<select aria-label="LibTV 空间" disabled={locked||status.running} value={status.accountId} onChange={e=>action('切换空间',async()=>{const next=await api.libtvUseAccount({accountId:e.target.value});setStatus(next);invalidateLibTVReads(api);await refresh(true,next);})}>{accounts.map(account=><option key={account.accountId} value={account.accountId}>{account.accountName}</option>)}</select></label>}
  {status?.loggedIn&&(state.mediaProfiles||[]).filter(profile=>profile.provider==='libtv'&&profile.libtvOwnerKey===status.ownerKey).map(profile=><label key={profile.id}>{profile.kind==='image'?'默认图片型号':'默认视频型号'}<select aria-label={profile.kind==='image'?'LibTV 默认图片型号':'LibTV 默认视频型号'} value={profile.model} disabled={locked} onChange={e=>selectModel(profile,e.target.value)}>{(profile.modelCatalog||[]).map(model=><option key={model.id} value={model.id}>{model.name}</option>)}</select></label>)}
  {status?.loggedIn&&<LibTVProjectControl api={api} ownerKey={status.ownerKey} disabled={locked||status.running}/>}
  <small>生成按 LibTV 官网规则消耗积分。</small>
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="collab-error">{error}</p>}
  <footer className="modal-actions"><button type="button" className="primary" onClick={onClose}>完成</button></footer>
 </div>;
}

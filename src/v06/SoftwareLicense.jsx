import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {RegistrationScreen} from './AccountAccess.jsx';
import {SoftwareUpdatePrompt} from './SoftwareUpdatePrompt.jsx';
import companyLogo from '../assets/company-logo.png';
import './software-license.css';
import './startup-access.css';
import {RefreshCw,KeyRound,Ticket,ShieldCheck,Clock3,Users,ClipboardList,Plus,Download,Copy,ArrowRight,X} from 'lucide-react';
import './license-admin.css';
const readable=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
const fmt=x=>x?new Date(x).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';

export function SoftwareLicenseBoundary({children,api=window.xingzhou}){
 const [state,setState]=useState({status:'unchecked',allowed:false}),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[savedCode,setSavedCode]=useState('');
 const sequence=useRef(0),mounted=useRef(false),supported=Boolean(api?.licenseCheck),cardInput=useRef(null),retryTimer=useRef(null),retryDelay=useRef(5000);
 const apply=next=>{setState(next);if(next.error)setError(readable(next.error));else if(next.allowed||['unchecked','prepared'].includes(next.status))setError('');};
 const scheduleRetry=()=>{if(!mounted.current||retryTimer.current)return;const delay=retryDelay.current;retryDelay.current=Math.min(30000,delay*2);retryTimer.current=setTimeout(()=>{retryTimer.current=null;if(mounted.current)void check();},delay);};
 const check=async()=>{const id=++sequence.current;try{const next=await api.licenseCheck();retryDelay.current=5000;if(retryTimer.current){clearTimeout(retryTimer.current);retryTimer.current=null;}if(mounted.current&&id===sequence.current)apply(next);return next;}catch(e){if(mounted.current&&id===sequence.current){setError(readable(e));setState({status:'error',allowed:false});scheduleRetry();}}};
 useEffect(()=>{mounted.current=true;if(supported)void check();
  if(supported)Promise.resolve(api.licenseRememberedCard?.()).then(value=>{if(mounted.current&&value)setSavedCode(String(value));}).catch(()=>{});
  const off=api?.onLicenseState?.(next=>{if(mounted.current){sequence.current++;apply(next);if(next.allowed){retryDelay.current=5000;if(retryTimer.current){clearTimeout(retryTimer.current);retryTimer.current=null;}}if(next.status==='unchecked')void check();}});return()=>{mounted.current=false;sequence.current++;if(retryTimer.current)clearTimeout(retryTimer.current);retryTimer.current=null;off?.();};},[supported]);
 const accountReady=state.allowed||['prepared','account'].includes(state.status);
 const workspaceReady=Boolean(state.allowed&&state.authenticated!==false);
 const stage=workspaceReady?'workspace':accountReady?'account':'lock';
 useEffect(()=>{if(supported)Promise.resolve(api.appAccessStage?.(stage)).catch(()=>{});},[stage,supported]);
 if(!supported)return children;
 const entered=code.trim(),pending=entered||savedCode;
 const activate=async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{
  if(!pending){await check();return;}
  await api.licensePrepare({code:pending});setCode('');
  const account=await api.authSession();
  if(account)apply(await api.licenseRedeem());else apply({status:'prepared',allowed:false,authenticated:false});
 }catch(e){setError(readable(e));}finally{if(mounted.current)setBusy(false);}};
 const forget=async()=>{setSavedCode('');setError('');setCode('');try{await api.licenseForgetCard?.();}catch{}requestAnimationFrame(()=>cardInput.current?.focus());};
 const authenticated=async()=>{setError('');await check();};
 const checking=state.status==='unchecked';
 return <>
  {workspaceReady?children:accountReady?<RegistrationScreen initialMode="login" allowRegistration onClose={()=>api.closeAccessWindow?.()} onRegistered={authenticated} onLogin={authenticated}/>:<main className="startup-license-lock" aria-label="软件启动锁">
   <section className="startup-lock-card"><div className="startup-lock-brand"><img src={companyLogo} alt=""/><span>行舟影视<small>XINGZHOU FILM</small></span></div>
    <h1>激活行舟影视</h1>
    {checking&&<p>正在验证设备授权…</p>}
    <form onSubmit={activate}><label htmlFor="startup-card">卡密</label>
     <div className={`startup-card-field${savedCode?' is-remembered':''}`}>
      <input id="startup-card" ref={cardInput} autoFocus={!savedCode} autoComplete="off" spellCheck={false} maxLength={65} type={savedCode?'password':'text'} readOnly={Boolean(savedCode)} value={savedCode||code} disabled={busy||checking} aria-invalid={!!error} aria-describedby={error?'startup-card-error':undefined} onChange={e=>{setCode(e.target.value);setError('');}} placeholder="请输入卡密"/>
      {savedCode?<button type="button" className="startup-card-clear" aria-label="更换卡密" title="更换卡密" onClick={forget}><X size={15}/></button>:null}
     </div>
     {error&&<p className="startup-lock-error" role="alert" id="startup-card-error">{error}</p>}
     <button type="submit" disabled={checking||busy||(!pending&&state.status!=='error')}>{checking?'正在验证…':busy?'正在激活…':<>验证并激活<ArrowRight size={17}/></>}</button>
    </form>
   </section>
  </main>}
  <SoftwareUpdatePrompt api={api}/>
 </>;
}

export function SoftwareLicenseAdmin({api=window.xingzhou}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[newCard,setNewCard]=useState(null),[saved,setSaved]=useState(false);
 const [orderId,setOrderId]=useState(''),[month,setMonth]=useState(1),[change,setChange]=useState(null),[reason,setReason]=useState('');
 const refresh=async()=>{try{setData(await api.licenseAdmin({operation:'overview'}));}catch(e){setError(readable(e));}};
 useEffect(()=>{void refresh();},[]);
 const run=async fn=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e){setError(readable(e));}finally{setBusy(false);}};
 const issue=()=>run(async()=>{const row=await api.licenseAdmin({operation:'issue',note,orderId:orderId||undefined,monthNumber:orderId?Number(month):undefined});setNewCard(row);setSaved(false);});
 // The inner operation is named changeAction on the wire to keep the RPC action distinct.
 const performChange=()=>run(async()=>{await api.licenseAdmin({operation:'change',changeAction:change.action,target:change.target,reason,confirmed:true});setChange(null);setReason('');});
 const grants=data?.grants||[],cards=data?.cards||[],exemptions=data?.exemptions||[],audit=data?.audit||[];
 const statistics=[['有效授权',grants.filter(g=>!g.revoked&&Date.parse(g.expires_at)>Date.now()).length,ShieldCheck,'有效期内的月卡授权'],['7天内到期',grants.filter(g=>!g.revoked&&Date.parse(g.expires_at)>Date.now()&&Date.parse(g.expires_at)<Date.now()+7*86400000).length,Clock3,'及时跟进续卡'],['未兑换卡',cards.filter(c=>!c.disabled&&!c.redeemed_by).length,Ticket,'最近500张中的可用卡'],['老用户豁免',exemptions.length,Users,'固定老账号继续使用']];
 const grantStatus=g=>g.revoked?'已撤销':!g.device_key?'待绑定':Date.parse(g.expires_at)>Date.now()?'有效':'已到期';
 return <section className="license-admin" aria-label="软件授权管理">
  <header className="license-admin-heading"><div><span className="license-eyebrow">ACCESS MANAGEMENT</span><h2><KeyRound size={23}/>软件授权 / 卡密</h2></div><button className="license-refresh" onClick={refresh} disabled={busy}><RefreshCw size={16}/>刷新数据</button></header>
  {error&&<p className="auth-error" role="alert">{error}</p>}
  <div className="license-summary" aria-label="授权概览">{statistics.map(([title,count,Icon,description])=><article key={title}><div className="license-stat-label"><Icon size={17}/><span>{title}</span></div><strong>{data?count:'—'}</strong><small>{data?description:'正在读取数据'}</small></article>)}</div>
  <section className="license-block license-issue"><header><div><h3><Ticket size={18}/>发放月卡</h3></div><span className="license-panel-tag">按月授权</span></header>
   <div className="license-issue-form"><label className="license-note-field">发放备注<input aria-label="发放备注" value={note} maxLength={300} onChange={e=>setNote(e.target.value)} placeholder="填写收卡人或订单备注"/></label><label>发卡方式<select aria-label="发卡方式" value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">单月卡</option>{data?.orders.map(o=><option key={o.id} value={o.id}>{o.note}（已发{o.issued}/12）</option>)}</select></label>{orderId&&<label>订单月份<select aria-label="订单月份" value={month} onChange={e=>setMonth(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>第{i+1}月</option>)}</select></label>}
    <div className="license-issue-buttons"><button className="license-secondary" disabled={busy||!note.trim()} onClick={()=>run(()=>api.licenseAdmin({operation:'order',note}))}><Plus size={16}/>建立年度订单</button><button className="license-primary" disabled={busy||!!newCard&&!saved} onClick={issue}><KeyRound size={16}/>生成一张月卡</button></div></div>
   <p className="license-form-hint">年度订单每月发一张，不一次性开通全年。月卡授予软件使用权，注册身份与管理员权限由邀请码决定。</p>
   {newCard&&<div className="license-issued"><strong>请立即保存：完整卡密只显示这一次</strong><textarea readOnly value={newCard.code} aria-label="新生成卡密"/><div className="license-actions"><button onClick={()=>run(async()=>{await navigator.clipboard.writeText(newCard.code);setSaved(true);})}><Copy size={15}/>复制卡密</button><button onClick={()=>run(async()=>{const path=await api.saveTxt({name:'行舟影视月卡-'+newCard.hint,content:newCard.code+'\n'+note});if(path)setSaved(true);})}><Download size={15}/>导出卡密</button><label><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>已保存或发给用户</label></div><small>切换页面后无法重新显示。如未保存，请作废原卡再补发。</small></div>}
  </section>
  <section className="license-legacy"><div className="license-legacy-icon"><ShieldCheck size={21}/></div><div><h3>老用户豁免</h3></div><div className="license-legacy-users">{exemptions.map(e=><span key={e.username}>{e.username}</span>)}{!data&&<small>正在读取…</small>}{data&&!exemptions.length&&<small>暂无豁免账号</small>}</div></section>
  <section className="license-block"><header><div><h3><Users size={18}/>设备授权</h3></div><span className="license-panel-count">{data?grants.length:'—'} 个账号</span></header><div className="license-table" tabIndex={0} role="region" aria-label="设备授权列表"><table><thead><tr><th>账号</th><th>到期时间</th><th>状态</th><th className="license-operation">操作</th></tr></thead><tbody>{grants.map(g=><tr key={g.user_id}><td className="license-account">{g.username}</td><td>{fmt(g.expires_at)}</td><td><span className={`license-state ${grantStatus(g)==='有效'?'is-active':'is-muted'}`}>{grantStatus(g)}</span></td><td className="license-operation">{[['unbind','后台解绑'],[g.revoked?'restore':'revoke',g.revoked?'恢复授权':'撤销授权']].map(([action,text])=><button key={action} disabled={busy} onClick={()=>setChange({action,target:g.user_id,label:g.username+' · '+text})}>{text}</button>)}</td></tr>)}{!grants.length&&<tr><td colSpan={4} className="license-empty">{data?'暂无月卡设备授权；用户激活后会显示在这里。':'正在读取设备授权…'}</td></tr>}</tbody></table></div></section>
  <section className="license-block"><header><div><h3><KeyRound size={18}/>卡密库存</h3></div><span className="license-panel-count">{data?cards.length:'—'} 张卡</span></header><div className="license-table" tabIndex={0} role="region" aria-label="卡密库存列表"><table><thead><tr><th>卡尾号</th><th>备注</th><th>月份</th><th>状态</th><th className="license-operation">操作</th></tr></thead><tbody>{cards.map(c=><tr key={c.id}><td className="license-card-hint">…{c.hint}</td><td>{c.note||'—'}</td><td>{c.month_number?'第 '+c.month_number+' 月':'单月卡'}</td><td><span className={`license-state ${!c.disabled&&!c.redeemed_by?'is-active':'is-muted'}`}>{c.disabled?'已作废':c.redeemed_by?'已兑换':'未兑换'}</span></td><td className="license-operation">{!c.disabled&&!c.redeemed_by?<button disabled={busy} onClick={()=>setChange({action:'disable-card',target:c.id,label:'作废卡尾号 '+c.hint})}>作废</button>:<span className="license-no-action">—</span>}</td></tr>)}{!cards.length&&<tr><td colSpan={5} className="license-empty">{data?'暂无卡密。生成月卡后，可在这里查看兑换状态。':'正在读取卡密库存…'}</td></tr>}</tbody></table></div></section>
  <section className="license-block"><header><div><h3><ClipboardList size={18}/>最近操作记录</h3></div></header><div className="license-table" tabIndex={0} role="region" aria-label="授权操作记录"><table><thead><tr><th>操作时间</th><th>操作</th><th>原因 / 备注</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{fmt(a.created_at)}</td><td>{({issue:'发卡',redeem:'兑换',unbind:'解绑',revoke:'撤销',restore:'恢复','disable-card':'作废卡','create-order':'年度订单'})[a.action]||a.action}</td><td>{a.reason||'—'}</td></tr>)}{!audit.length&&<tr><td colSpan={3} className="license-empty">{data?'暂无操作记录':'正在读取操作记录…'}</td></tr>}</tbody></table></div></section>
  {change&&createPortal(<div className="license-overlay"><div className="license-confirm" role="dialog" aria-modal="true" aria-label="确认授权操作"><h3>{change.label}</h3><p>操作立即生效并记录审计；解绑不会延长有效期。</p><label>原因<input maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason.trim()} onClick={performChange}>确认操作</button><button disabled={busy} onClick={()=>{setChange(null);setReason('');}}>取消</button></div></div>,document.body)}
 </section>;
}

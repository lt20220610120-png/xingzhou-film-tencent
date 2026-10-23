import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {RegistrationScreen} from './AccountAccess.jsx';
import {interpretUpdateResult} from '../../core/appServices.js';
import './software-license.css';
import {RefreshCw,KeyRound,Ticket,ShieldCheck,Clock3,Users,ClipboardList,Plus,Download,Copy} from 'lucide-react';
import './license-admin.css';
const label={unchecked:'正在联网校验…',required:'请输入月卡，激活这台电脑',active:'设备授权有效',exempt:'老用户授权 · 无需卡密',expired:'月卡已到期',revoked:'授权已撤销，请联系管理员',unbound:'设备已解绑，请通过账号恢复入口登录', 'other-device':'账号已绑定其他电脑，请联系管理员解绑',error:'暂时无法完成联网校验',banned:'账号已停用'};
const readable=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
const fmt=x=>x?new Date(x).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';

export function SoftwareLicenseBoundary({children,api=window.xingzhou}){
 const [state,setState]=useState({status:'unchecked',allowed:false}),[entered,setEntered]=useState(false),[locked,setLocked]=useState(true);
 const [code,setCode]=useState(''),[prepared,setPrepared]=useState(false),[auth,setAuth]=useState(false),[role,setRole]=useState('director'),[username,setUsername]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(''),[update,setUpdate]=useState(null),[updatePhase,setUpdatePhase]=useState('checking'),[updateError,setUpdateError]=useState(''),[progress,setProgress]=useState(0),[dismissed,setDismissed]=useState(false);
 const sequence=useRef(0),[renewing,setRenewing]=useState(false);
 const supported=Boolean(api?.licenseCheck),legacy=state.status==='exempt';
 const applyState=next=>{setState(next);if(!next.allowed)setLocked(true);if(next.status==='exempt'){setEntered(true);setLocked(false);setAuth(false);}if(next.status==='unchecked'){setEntered(false);setPrepared(false);setAuth(false);}};
 const check=async()=>{const request=++sequence.current;setBusy(true);setError('');try{const next=await api.licenseCheck();if(request===sequence.current)applyState(next);return next;}catch(e){if(request===sequence.current){setError(readable(e));setState(current=>({...current,status:['unchecked','unknown','login','account-error'].includes(current.status)?'account-error':'error',allowed:false}));}}finally{if(request===sequence.current)setBusy(false);}};
 useEffect(()=>{if(!supported)return;void check();api.appVersion().then(setVersion).catch(()=>{});
  let alive=true;api.checkUpdate().then(value=>{if(alive){const next=interpretUpdateResult(value);setUpdate(next);setUpdatePhase(next.available?'available':'idle');}}).catch(e=>{if(alive){setUpdateError(readable(e));setUpdatePhase('error');}});
  const off=api.onLicenseState?.(next=>{applyState(next);if(next.status==='unchecked')void check();});
  const offProgress=api.onUpdateProgress?.(next=>setProgress(next.percent||0));return()=>{alive=false;off?.();offProgress?.();};
 },[supported]);
 if(!supported)return children;
 const authenticated=async()=>{setAuth(false);setPrepared(false);await check();};
 const changeAccount=async()=>{setBusy(true);setError('');try{await api.authLogout();sequence.current++;setEntered(false);setAuth(false);setPrepared(false);setRenewing(false);setUsername('');setCode('');setState({status:'unknown',allowed:false});}catch(e){setError(readable(e));}finally{setBusy(false);}};
 const identify=async event=>{event.preventDefault();setBusy(true);setError('');try{const next=await api.licenseRoute({username});applyState(next);if(next.status==='login')setAuth(true);else await check();}catch(e){setError(readable(e));}finally{setBusy(false);}};
 const activate=async event=>{event.preventDefault();setBusy(true);setError('');try{await api.licensePrepare({code});setCode('');
   const account=await api.authSession();if(account){applyState(await api.licenseRedeem());setPrepared(false);setRenewing(false);}else{setPrepared(true);setAuth(true);}
  }catch(e){setError(readable(e));}finally{setBusy(false);}};
 const download=async()=>{setUpdatePhase('downloading');setUpdateError('');try{await api.downloadUpdate({version:update.version});setUpdatePhase('ready');}catch(e){setUpdateError(readable(e));setUpdatePhase('available');}};
 const install=async()=>{setUpdatePhase('installing');try{await api.installUpdate();}catch(e){setUpdateError(readable(e));setUpdatePhase('ready');}};
 const updatePanel=<section className="license-update"><h2>软件更新</h2><p>{updatePhase==='checking'?'正在检查更新…':update?.available?`发现新版本 ${update.version}`:'当前版本 '+version}</p>
   {updateError&&<p role="alert">{updateError}</p>}{updatePhase==='downloading'&&<p>正在下载 {progress}% <progress max="100" value={progress}/></p>}
   {updatePhase==='available'&&<button onClick={download}>下载更新</button>}{updatePhase==='ready'&&<button onClick={install}>安装并重启</button>}{updatePhase==='installing'&&<p>正在启动安装程序…</p>}
  </section>;
 const neutral=['unknown','login','account-error','unchecked'].includes(state.status),showGate=locked||!entered||!state.allowed;
 return <>
  {entered&&<div hidden={showGate} inert={showGate?true:undefined} aria-hidden={showGate?true:undefined}>{children}</div>}
  {legacy&&update?.available&&!dismissed&&<aside className="ordinary-update-notice" aria-label="软件更新提示">{updatePanel}<button disabled={['downloading','installing'].includes(updatePhase)} onClick={()=>setDismissed(true)}>稍后更新</button></aside>}
  {showGate&&<div className={entered?'license-overlay':''}>
   {auth?<RegistrationScreen requestedRole={role} initialMode={prepared?'register':'login'} initialUsername={username} allowRegistration={prepared} onClose={()=>setAuth(false)} onRegistered={authenticated} onLogin={authenticated}/>:neutral?<main className="account-start">
    <div className="license-brand">行舟影视 <small>v{version||'…'}</small></div>
    {state.status==='unchecked'?<p>正在连接账号服务…</p>:<section className="license-start-card"><h1>欢迎使用行舟影视</h1><p>使用你的账号继续。</p><form onSubmit={identify}><label>账号<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="请输入账号"/></label><button className="auth-submit" disabled={busy||!username.trim()}>继续</button></form><button onClick={()=>{setState({status:'required',allowed:false});setError('');}}>创建账号</button>{error&&<p role="alert">{error}</p>}{state.status==='account-error'&&<button disabled={busy} onClick={check}>重新连接</button>}</section>}
    {update?.available&&updatePanel}
   </main>:<main className="license-start">
    <div className="license-brand">行舟影视 <small>v{version||'…'}</small></div>
    <section className="license-start-card"><span className="license-kicker">软件使用授权</span><h1>{label[state.status]||'设备授权'}</h1>
     {state.expiresAt&&<p>有效期至 {fmt(state.expiresAt)}（北京时间）</p>}
     <p>每次启动联网校验；授权有效才能进入软件。已激活无需重复输入，到期请续卡。</p>
     {state.allowed&&<button disabled={busy} onClick={()=>setRenewing(!renewing)}>{renewing?'取消续卡':'提前续卡'}</button>}
     {(!state.allowed||renewing)&&<form onSubmit={activate}><label>月卡卡密<input autoComplete="off" value={code} onChange={e=>setCode(e.target.value)} placeholder="XZ-…" maxLength={65}/></label><label>注册身份<select value={role} onChange={e=>setRole(e.target.value)}><option value="director">导演</option><option value="creator">内容创作者</option></select></label><button className="primary" disabled={busy||!code.trim()}>{busy?'正在验证…':'验证卡密 / 续卡'}</button></form>}
     {prepared&&<p>卡密已预验，15分钟内完成登录或注册；关闭窗口不会消耗卡密。</p>}
     {error&&<p className="auth-error" role="alert">{error}</p>}
     <div className="license-actions"><button disabled={busy} onClick={check}>重新联网校验</button>{prepared&&<button disabled={busy} onClick={()=>setAuth(true)}>继续登录 / 注册</button>}{!prepared&&!state.allowed&&<button disabled={busy} onClick={()=>setAuth(true)}>恢复已购授权</button>}<button disabled={busy} onClick={changeAccount}>切换账号</button></div>
     {state.allowed&&<button className="auth-submit" disabled={busy||['downloading','installing'].includes(updatePhase)} onClick={()=>{if(state.authenticated===false){setAuth(true);return;}setEntered(true);setLocked(false);}}>{update?.available?'继续使用当前版本':'进入行舟影视'}</button>}
    </section>
    {updatePanel}
   </main>}
  </div>}
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
  <header className="license-admin-heading"><div><span className="license-eyebrow">ACCESS MANAGEMENT</span><h2><KeyRound size={23}/>软件授权 / 卡密</h2><p>管理月卡发放、设备授权与卡密库存。</p></div><button className="license-refresh" onClick={refresh} disabled={busy}><RefreshCw size={16}/>刷新数据</button></header>
  {error&&<p className="auth-error" role="alert">{error}</p>}
  <div className="license-summary" aria-label="授权概览">{statistics.map(([title,count,Icon,description])=><article key={title}><div className="license-stat-label"><Icon size={17}/><span>{title}</span></div><strong>{data?count:'—'}</strong><small>{data?description:'正在读取数据'}</small></article>)}</div>
  <section className="license-block license-issue"><header><div><h3><Ticket size={18}/>发放月卡</h3><p>首次激活起算，对应日满一个月；提前续卡顺延。</p></div><span className="license-panel-tag">按月授权</span></header>
   <div className="license-issue-form"><label className="license-note-field">发放备注<input aria-label="发放备注" value={note} maxLength={300} onChange={e=>setNote(e.target.value)} placeholder="填写收卡人或订单备注"/></label><label>发卡方式<select aria-label="发卡方式" value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">单月卡</option>{data?.orders.map(o=><option key={o.id} value={o.id}>{o.note}（已发{o.issued}/12）</option>)}</select></label>{orderId&&<label>订单月份<select aria-label="订单月份" value={month} onChange={e=>setMonth(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>第{i+1}月</option>)}</select></label>}
    <div className="license-issue-buttons"><button className="license-secondary" disabled={busy||!note.trim()} onClick={()=>run(()=>api.licenseAdmin({operation:'order',note}))}><Plus size={16}/>建立年度订单</button><button className="license-primary" disabled={busy||!!newCard&&!saved} onClick={issue}><KeyRound size={16}/>生成一张月卡</button></div></div>
   <p className="license-form-hint">年度订单每月发一张，不一次性开通全年。月卡授予软件使用权，注册身份与管理员权限由邀请码决定。</p>
   {newCard&&<div className="license-issued"><strong>请立即保存：完整卡密只显示这一次</strong><textarea readOnly value={newCard.code} aria-label="新生成卡密"/><div className="license-actions"><button onClick={()=>run(async()=>{await navigator.clipboard.writeText(newCard.code);setSaved(true);})}><Copy size={15}/>复制卡密</button><button onClick={()=>run(async()=>{const path=await api.saveTxt({name:'行舟影视月卡-'+newCard.hint,content:newCard.code+'\n'+note});if(path)setSaved(true);})}><Download size={15}/>导出卡密</button><label><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>已保存或发给用户</label></div><small>切换页面后无法重新显示。如未保存，请作废原卡再补发。</small></div>}
  </section>
  <section className="license-legacy"><div className="license-legacy-icon"><ShieldCheck size={21}/></div><div><h3>老用户豁免</h3><p>重装或换机后，继续凭原账号使用；与月卡授权分开管理。</p></div><div className="license-legacy-users">{exemptions.map(e=><span key={e.username}>{e.username}</span>)}{!data&&<small>正在读取…</small>}{data&&!exemptions.length&&<small>暂无豁免账号</small>}</div></section>
  <section className="license-block"><header><div><h3><Users size={18}/>设备授权</h3><p>查看有效期与设备绑定，处理续卡和售后。</p></div><span className="license-panel-count">{data?grants.length:'—'} 个账号</span></header><div className="license-table" tabIndex={0} role="region" aria-label="设备授权列表"><table><thead><tr><th>账号</th><th>到期时间</th><th>状态</th><th className="license-operation">操作</th></tr></thead><tbody>{grants.map(g=><tr key={g.user_id}><td className="license-account">{g.username}</td><td>{fmt(g.expires_at)}</td><td><span className={`license-state ${grantStatus(g)==='有效'?'is-active':'is-muted'}`}>{grantStatus(g)}</span></td><td className="license-operation">{[['unbind','后台解绑'],[g.revoked?'restore':'revoke',g.revoked?'恢复授权':'撤销授权']].map(([action,text])=><button key={action} disabled={busy} onClick={()=>setChange({action,target:g.user_id,label:g.username+' · '+text})}>{text}</button>)}</td></tr>)}{!grants.length&&<tr><td colSpan={4} className="license-empty">{data?'暂无月卡设备授权；用户激活后会显示在这里。':'正在读取设备授权…'}</td></tr>}</tbody></table></div></section>
  <section className="license-block"><header><div><h3><KeyRound size={18}/>卡密库存</h3><p>最近 500 张卡密；完整卡密仅在生成时提供一次。</p></div><span className="license-panel-count">{data?cards.length:'—'} 张卡</span></header><div className="license-table" tabIndex={0} role="region" aria-label="卡密库存列表"><table><thead><tr><th>卡尾号</th><th>备注</th><th>月份</th><th>状态</th><th className="license-operation">操作</th></tr></thead><tbody>{cards.map(c=><tr key={c.id}><td className="license-card-hint">…{c.hint}</td><td>{c.note||'—'}</td><td>{c.month_number?'第 '+c.month_number+' 月':'单月卡'}</td><td><span className={`license-state ${!c.disabled&&!c.redeemed_by?'is-active':'is-muted'}`}>{c.disabled?'已作废':c.redeemed_by?'已兑换':'未兑换'}</span></td><td className="license-operation">{!c.disabled&&!c.redeemed_by?<button disabled={busy} onClick={()=>setChange({action:'disable-card',target:c.id,label:'作废卡尾号 '+c.hint})}>作废</button>:<span className="license-no-action">—</span>}</td></tr>)}{!cards.length&&<tr><td colSpan={5} className="license-empty">{data?'暂无卡密。生成月卡后，可在这里查看兑换状态。':'正在读取卡密库存…'}</td></tr>}</tbody></table></div></section>
  <section className="license-block"><header><div><h3><ClipboardList size={18}/>最近操作记录</h3><p>发卡、兑换与授权变更均留有记录。</p></div></header><div className="license-table" tabIndex={0} role="region" aria-label="授权操作记录"><table><thead><tr><th>操作时间</th><th>操作</th><th>原因 / 备注</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{fmt(a.created_at)}</td><td>{({issue:'发卡',redeem:'兑换',unbind:'解绑',revoke:'撤销',restore:'恢复','disable-card':'作废卡','create-order':'年度订单'})[a.action]||a.action}</td><td>{a.reason||'—'}</td></tr>)}{!audit.length&&<tr><td colSpan={3} className="license-empty">{data?'暂无操作记录':'正在读取操作记录…'}</td></tr>}</tbody></table></div></section>
  {change&&createPortal(<div className="license-overlay"><div className="license-confirm" role="dialog" aria-modal="true" aria-label="确认授权操作"><h3>{change.label}</h3><p>操作立即生效并记录审计；解绑不会延长有效期。</p><label>原因<input maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason.trim()} onClick={performChange}>确认操作</button><button disabled={busy} onClick={()=>{setChange(null);setReason('');}}>取消</button></div></div>,document.body)}
 </section>;
}

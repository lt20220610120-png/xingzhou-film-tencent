import React,{useState,useEffect} from 'react';
import {UserRound,Camera,PenLine,Copy} from 'lucide-react';
import {Dialog} from './GlobalTools.jsx';
import '../profile.css';
import '../profile-overrides.css';
const tags=['制片','导演','美术','分镜','编剧','内容策划','配音','剪辑','发行'];
export function UserProfile({account,api,onUpdate,role}){
 const [open,setOpen]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const begin=()=>{setDraft({displayName:account.displayName||account.username,bio:account.bio||'',tags:account.tags||[],avatarData:account.avatarData||''});setEditing(true);setError('');};
 const show=async()=>{setOpen(true);setError('');try{const latest=await api.authSession();if(latest)onUpdate(latest);}catch{}};
 const avatar=(data,size)=>data?<img className={size} src={data} alt="用户头像"/>:<span className={size}><UserRound size={size==='profile-avatar-large'?44:20}/></span>;
 const upload=async()=>{try{const data=await api.selectProfileAvatar();if(data)setDraft(d=>({...d,avatarData:data}));}catch(e){setError(e.message);}};
 const save=async()=>{if(busy)return;setBusy(true);setError('');try{onUpdate(await api.authUpdateProfile(draft));setEditing(false);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <><div className="sidebar-account"><span className="account-role">{role==='director'?'导演':'创作者'}</span><div className="account-hover-zone">
 <button className="account-trigger" aria-label="个人资料" onClick={show}>{avatar(account.avatarData,'profile-avatar-small')}<span>{account.displayName||account.username}</span></button>
 <div className="account-hover-card"><b>{account.displayName||account.username}</b><span>@{account.username}</span><small>{account.email}</small><p>{account.bio||'还没有填写个人介绍'}</p><button onClick={show}>个人主页 · 编辑资料</button></div>
 </div></div>
 <Dialog open={open} title="个人主页" onClose={()=>{if(!busy){setOpen(false);setEditing(false);}}}>
 <div className="profile-hero"><div className="profile-avatar-wrap">{avatar(editing?draft.avatarData:account.avatarData,'profile-avatar-large')}{editing&&<button aria-label="上传头像" disabled={busy} onClick={upload}><Camera size={18}/></button>}</div><div className="profile-identity">{editing?<label>昵称<input maxLength={40} value={draft.displayName} onChange={e=>setDraft(d=>({...d,displayName:e.target.value}))}/></label>:<h2>{account.displayName||account.username}</h2>}<p>账号 @{account.username}</p><small>行舟 ID：{account.id}</small></div>{!editing&&<button className="secondary" onClick={begin}><PenLine size={15}/>编辑资料</button>}</div>
 <div className="profile-fields"><label>邮箱<span>{account.email||'未填写'}</span></label><label>个人介绍{editing?<textarea maxLength={160} value={draft.bio} onChange={e=>setDraft(d=>({...d,bio:e.target.value}))} placeholder="介绍一下你的创作方向"/>:<p>{account.bio||'还没有填写个人介绍'}</p>}</label><label>创作标签<div className="profile-tags">{editing?[...new Set([...tags,...draft.tags])].map(t=><button key={t} aria-pressed={draft.tags.includes(t)} onClick={()=>setDraft(d=>({...d,tags:d.tags.includes(t)?d.tags.filter(x=>x!==t):[...d.tags,t].slice(0,8)}))}>{t}</button>):(account.tags||[]).map(t=><span key={t}>{t}</span>)}{!editing&&!account.tags?.length&&<small>暂无标签</small>}</div></label>{editing&&<label>自定义标签<input maxLength={20} placeholder="输入后按回车添加" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const t=e.currentTarget.value.trim();if(t)setDraft(d=>({...d,tags:[...new Set([...d.tags,t])].slice(0,8)}));e.currentTarget.value='';}}}/></label>}</div>
 {error&&<p role="alert" className="collab-error">{error}</p>}{editing&&<div className="modal-actions"><button disabled={busy} onClick={()=>setEditing(false)}>取消</button><button className="primary" disabled={busy||!draft.displayName?.trim()} onClick={save}>{busy?'保存中…':'保存资料'}</button></div>}
 </Dialog></>;
}

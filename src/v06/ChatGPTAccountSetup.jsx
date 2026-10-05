import React,{useEffect,useState} from 'react';
export function ChatGPTAccountSetup(){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const call=async(action)=>{setBusy(action);setError('');try{const method=action==='login'?'chatgptWebOpenLogin':'chatgptWebStatus';if(!window.xingzhou?.[method])throw new Error('请在行舟影视桌面应用中连接');setStatus(await window.xingzhou[method]());}catch(e){setError(e.message);}finally{setBusy('');}};
 useEffect(()=>{call('refresh');},[]);
 return <div className="gemini-account-setup full"><div className="gemini-account-top"><strong>ChatGPT 网页账号</strong><span role="status" className={status?.loggedIn?'connected':''}>{busy==='refresh'?'检查登录中…':status?.loggedIn?'已登录，待测试正文':status?.message||'等待登录'}</span></div><p>首次在独立窗口登录，关闭窗口后刷新连接，再测试正文。会话保存在本机；调用时使用后台浏览器及网页当前默认模型。网站要求验证时需要重新打开登录窗口。</p><div className="gemini-account-actions"><button type="button" className="secondary" disabled={!!busy} onClick={()=>call('login')}>打开 ChatGPT 登录窗口</button><button type="button" className="secondary" disabled={!!busy} onClick={()=>call('refresh')}>刷新连接</button></div><label>网页模型<select aria-label="ChatGPT 网页模型" value="auto" disabled><option value="auto">自动 · 网页当前默认模型</option></select></label>{error&&<p role="alert" className="auth-error">{error}</p>}</div>;
}

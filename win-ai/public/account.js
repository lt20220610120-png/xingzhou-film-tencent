(()=>{
 try{sessionStorage.removeItem('winai_admin_entry');}catch{}
 const mode=location.pathname==='/register'?'register':location.pathname==='/recover'?'recover':'login';
 const names={login:'登录 Win AI',register:'注册 Win AI',recover:'找回密码'};
 document.title=names[mode]+' · Win AI';document.querySelector('#form-title').textContent=names[mode];
 document.querySelector('#form-subtitle').textContent=mode==='register'?'注册后可管理自己的 API 账户，无需邀请码。':mode==='recover'?'验证绑定邮箱，更新同一账号的密码。':'使用你的行舟影视或 Win AI 账号。';
 document.querySelectorAll('[data-mode]').forEach(a=>{if(a.dataset.mode===mode)a.setAttribute('aria-current','page');});
 const form=document.querySelector('#account-form'),message=document.querySelector('#account-message'),submit=form.querySelector('[type=submit]');
 submit.textContent=mode==='login'?'登录':mode==='register'?'注册并登录':'更新密码';
 for(const name of ['email','emailCode','confirmPassword']){const label=document.querySelector(`[data-field="${name}"]`);label.hidden=mode==='login';label.querySelector('input').required=mode!=='login';}
 if(mode!=='login')form.elements.password.autocomplete='new-password';
 const info=(text,ok=false)=>{message.textContent=text;message.dataset.ok=String(ok);};
 async function post(action,data){
  const response=await fetch('/api/win-ai/web/'+action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});
  let result;try{result=await response.json();}catch{throw Error('暂时无法连接账号服务，请稍后再试。');}
  if(!response.ok||!result.ok)throw Error(result.error||'操作未完成，请稍后重试。');return result;
 }
 const code=document.querySelector('#send-code');let timer;
 code.addEventListener('click',async()=>{
  const input=form.elements.email;if(!input.reportValidity())return;code.disabled=true;info('正在发送验证码…',true);
  try{await post('email-code',{email:input.value});info('验证码已发送，请查收邮箱（也请检查垃圾邮件）。',true);let left=60;code.textContent=`${left}秒后重发`;timer=setInterval(()=>{left--;code.textContent=left?`${left}秒后重发`:'发送验证码';if(!left){clearInterval(timer);code.disabled=false;}},1000);}catch(e){info(e.message);code.disabled=false;}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;submit.disabled=true;info('正在处理…',true);
  try{const data=Object.fromEntries(new FormData(form));if(mode==='recover'){data.newPassword=data.password;delete data.password;}await post(mode,data);form.reset();
   if(mode==='recover'){info('密码已更新。请使用新密码登录，原登录会话已失效。',true);submit.textContent='更新密码';}
   else{info('正在进入控制台…',true);location.replace('/api/win-ai/start');}
  }catch(e){info(e.message);}finally{submit.disabled=false;}
 });
 window.addEventListener('pagehide',()=>{clearInterval(timer);form.reset();});
})();

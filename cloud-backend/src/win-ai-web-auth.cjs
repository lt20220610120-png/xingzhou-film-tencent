// Browser entry for the existing Xingzhou identity. Never returns source tokens.
const {login,recover,sendEmailCode,tokenHash}=require('./auth.cjs');
const {hashPassword}=require('./password.cjs');
const {hashEmailCode}=require('./email-code.cjs');
const {cookieValue}=require('./win-ai-identity.cjs');
const ORIGIN='https://winai.xingzhoufilm.cn';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function forwardNativeLogout(headers){return new Promise((resolve,reject)=>{
 const allowed={Host:'winai.xingzhoufilm.cn',Origin:ORIGIN,'Content-Length':'0'};
 for(const key of ['cookie','authorization','x-auth-session','user-agent'])if(headers[key])allowed[key]=headers[key];
 const req=require('node:http').request({host:'127.0.0.1',port:8317,path:'/api/user/auth/logout',method:'POST',headers:allowed},res=>{
  let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(text.length>8192)res.destroy(new Error('Native logout response too large'));});res.on('error',reject);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text),cookies:res.headers['set-cookie']||[]});}catch{reject(new Error('Native logout unavailable'));}});
 });req.setTimeout(10000,()=>req.destroy(new Error('Native logout timeout')));req.on('error',reject);req.end();
});}
function createWinAIWebAuth({repository,identity,mailer,now=Date.now,nativeLogout=forwardNativeLogout}){
 const limits=new Map();let swept=0;
 function limit(key,max,window){
  const time=now();if(time-swept>60000){for(const [k,v]of limits)if(v.until<=time)limits.delete(k);swept=time;}
  let entry=limits.get(key);if(!entry||entry.until<=time){if(limits.size>=10000&&!entry)fail(429,'请求过于频繁，请稍后再试');entry={used:0,until:time+window};limits.set(key,entry);}
  if(entry.used>=max)fail(429,'请求过于频繁，请稍后再试');entry.used++;
 }
 const reply=(res,status,value,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(value));};
 return async(req,res)=>{
  try{
   const name=new URL(req.url,ORIGIN).pathname.slice('/api/win-ai/web/'.length);
   if(!['login','register','email-code','recover','logout','native-logout'].includes(name))return reply(res,404,{error:'not_found'});
   if(req.method!=='POST')return reply(res,405,{error:'请使用页面提交'},{allow:'POST'});
   if(req.headers.origin!==ORIGIN||(!(name==='native-logout'&&!req.headers['content-type'])&&!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))||req.headers['sec-fetch-site']==='cross-site')fail(403,'请从 Win AI 网页提交');
   // Nginx replaces this header with the actual peer address.
   const ip=String(req.headers['x-real-ip']||req.socket.remoteAddress||'unknown').slice(0,100);
   limit('request:'+ip,60,60000);
   const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>16384)fail(413,'请求内容过大');chunks.push(Buffer.from(chunk));}
   let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{fail(400,'请求格式不正确');}
   if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'请求格式不正确');
   const username=String(b.username||'').trim().toLowerCase(),email=String(b.email||'').trim().toLowerCase();
   if(username.length>32||email.length>254||String(b.password||b.newPassword||'').length>128)fail(400,'输入内容过长');
   const cookie=value=>`__Host-winai_identity=${value}; Path=/; Max-Age=${value?604800:0}; HttpOnly; Secure; SameSite=Lax`;
   if(name==='native-logout'){
    const native=await nativeLogout(req.headers);
    if(native.status===200&&native.body.success){await identity.signout(cookieValue(req.headers.cookie,'__Host-winai_identity'));native.cookies=[...native.cookies,cookie('')];}
    return reply(res,native.status,native.body,native.cookies.length?{'set-cookie':native.cookies}:{});
   }
   if(name==='logout'){await identity.signout(cookieValue(req.headers.cookie,'__Host-winai_identity'));return reply(res,200,{ok:true},{'set-cookie':cookie('')});}
   if(name==='email-code'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))fail(400,'请输入有效的邮箱地址');
    limit('mail-ip:'+ip,5,600000);limit('mail:'+tokenHash(email),1,60000);
    const result=await sendEmailCode({email},repository,mailer);return reply(res,result.status,result.status===200?{ok:true}:result.body);
   }
   limit('auth:'+ip,20,600000);
   if(name==='recover'){
    if(!/^[a-z0-9_]{3,32}$/.test(username)||!/^\d{8}$/.test(String(b.emailCode||''))||String(b.newPassword||'').length<6||b.newPassword!==b.confirmPassword)fail(400,'请填写账号、邮箱验证码和两次一致的新密码（至少6位）');
    const result=await recover({...b,username,email},repository);return reply(res,result.status,result.status===200?{ok:true}:result.body);
   }
   let payload={username,password:String(b.password||'')};
   if(name==='register'){
    limit('signup:'+ip,8,3600000);
    if(!/^[a-z0-9_]{3,32}$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||payload.password.length<6||payload.password!==b.confirmPassword||!/^\d{8}$/.test(String(b.emailCode||'')))fail(400,'请填写有效账号、邮箱、验证码和两次一致的密码（至少6位）');
    await repository.winAIRegister({username,email,passwordHash:hashPassword(payload.password),emailCodeHash:hashEmailCode(b.emailCode)});
   }
   const result=await login(payload,repository);if(result.status!==200)return reply(res,result.status,result.body);
   const hash=tokenHash(result.body.token);
   let grant;try{grant=await identity.forSession(hash);}catch(error){await repository.deleteSession(hash);throw error;}
   reply(res,200,{ok:true,next:'/api/win-ai/start'},{'set-cookie':cookie(grant)});
  }catch(error){reply(res,error.status||503,{error:error.status?error.message:'账号服务暂时不可用，请稍后重试'},error.status===429?{'retry-after':'60'}:{});}
 };
}
module.exports={createWinAIWebAuth};

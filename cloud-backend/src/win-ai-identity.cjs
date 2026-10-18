const crypto=require('node:crypto');
const ORIGIN='https://winai.xingzhoufilm.cn',CLIENT='xingzhou-win-ai',CALLBACK=ORIGIN+'/oauth/xingzhou';
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const proof=value=>crypto.createHash('sha256').update(String(value)).digest('base64url');
const deny=()=>{throw Object.assign(new Error('请从已登录的行舟影视重新进入 Win AI'),{status:403});};
const opaque=()=>crypto.randomBytes(32).toString('base64url');
function cookieValue(cookie,name){return String(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
function createWinAIIdentity({repository:r,clientSecret,lookup=async()=>null,now=Date.now}){
 const configured=()=>{if(typeof clientSecret!=='string'||clientSecret.length<16)throw Object.assign(new Error('统一登录服务尚未配置'),{status:503});};
 async function put(kind,source,ttl=60000){const raw=opaque();if(!await r.winAIStoreGrant({kind,hash:digest(raw),expires:now()+ttl},source))deny();return raw;}
 return {
  async forSession(sessionHash){configured();const raw=opaque();if(!await r.winAIGrant({hash:digest(raw),kind:'identity',challenge:'web',expires:now()+7*86400000,sessionHash}))deny();return raw;},
  async signout(identity){configured();if(/^[-\w]{43}$/.test(identity||''))await r.winAIRevokeIdentity(digest(identity));},
  async paymentAmount(parameters,kind='wallet'){configured();if(!parameters.out_trade_no||!parameters.money)return false;return (await lookup({paymentOrder:parameters.out_trade_no,paymentMoney:parameters.money,paymentKind:kind}))?.amountMatches===true;},
  async issue(sessionHash,challenge){configured();if(!/^[A-Za-z0-9_-]{43}$/.test(challenge||''))deny();const raw=opaque();if(!await r.winAIGrant({hash:digest(raw),kind:'entry',challenge,expires:now()+60000,sessionHash}))deny();return raw;},
  async bootstrap(ticket,verifier){configured();if(!/^[A-Za-z0-9_-]{43,128}$/.test(verifier||'')||!/^[-\w]{43}$/.test(ticket||''))deny();const source=await r.winAIGetGrant('entry',digest(ticket),proof(verifier),true);if(!source)deny();return put('identity',source,3600000);},
  async authorize({identity,clientId,redirectUri,state}){configured();if(clientId!==CLIENT||redirectUri!==CALLBACK||!state||state.length>2048)deny();const source=await r.winAIGetGrant('identity',digest(identity));if(!source)deny();const code=await put('code',source);const url=new URL(CALLBACK);url.searchParams.set('code',code);url.searchParams.set('state',state);return url.href;},
  async exchange({clientId,clientSecret:secret,code,redirectUri,grantType}){configured();const incoming=Buffer.from(String(secret||'')),expected=Buffer.from(clientSecret);if(clientId!==CLIENT||redirectUri!==CALLBACK||grantType!=='authorization_code'||incoming.length!==expected.length||!crypto.timingSafeEqual(incoming,expected))deny();const source=await r.winAIGetGrant('code',digest(code),undefined,true);if(!source)deny();return {access_token:await put('access',source),token_type:'Bearer',expires_in:60};},
  async userinfo(token){configured();const source=await r.winAIGetGrant('access',digest(token));if(!source)deny();return {sub:source.id,preferred_username:'xz_'+digest(source.id).slice(0,16),name:source.display_name||source.username||'行舟用户'};},
  async guard(input){configured();const native=await lookup(input);if(!native)return true;if(native.invalid)return false;const bound=await r.winAISourceForNative(native.id,native.source_id);if(native.source_id&&bound!==native.source_id)return false;native.source_id=bound;if(!bound)return true;if(!await r.winAIUserActive(bound))return false;if(!native.sid)return true;
   if(await r.winAILinkValid(native.sid,native.source_id))return true;
   const identity=cookieValue(input.cookie,'__Host-winai_identity');if(!identity)return false;
   const source=await r.winAIGetGrant('identity',digest(identity));if(!source||source.id!==native.source_id)return false;
   await r.winAILink(native.sid,source);return r.winAILinkValid(native.sid,native.source_id);
  },
 };
}
function createWinAIHttpHandler(service,{forwardPayment=require('./win-ai-payment.cjs').forwardNativePayment}={}){
 const send=(res,status,data,headers={})=>{res.writeHead(status,{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',...headers,...(data===undefined?{}:{'content-type':'application/json; charset=utf-8'})});res.end(data===undefined?'':JSON.stringify(data));};
 const read=async req=>{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw Object.assign(new Error('请求过大'),{status:413});}if(String(req.headers['content-type']).startsWith('application/json'))return JSON.parse(body||'{}');return Object.fromEntries(new URLSearchParams(body));};
 return async(req,res)=>{
  const url=new URL(req.url,ORIGIN),name=url.pathname.slice('/api/win-ai/'.length);
  try{
   if(['epay-notify','epay-subscription-notify'].includes(name)&&['GET','POST'].includes(req.method)){let params;if(req.method==='GET')params=url.searchParams;else{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw Object.assign(new Error('请求过大'),{status:413});}params=new URLSearchParams(body);}const unique=new Set();for(const key of params.keys()){if(unique.has(key))throw Object.assign(new Error('参数重复'),{status:400});unique.add(key);}const payment=Object.fromEntries(params),subscription=name==='epay-subscription-notify';const result=await service.paymentAmount(payment,subscription?'subscription':'wallet')?await forwardPayment(payment,req.headers['x-real-ip'],8317,subscription?'/api/subscription/epay/notify':'/api/user/epay/notify'):'fail';res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});res.end(result);return;}
   if(name==='bootstrap'&&req.method==='POST'){const b=await read(req);const identity=await service.bootstrap(b.ticket,b.verifier);res.writeHead(303,{'location':'/api/win-ai/start','cache-control':'no-store','set-cookie':`__Host-winai_identity=${identity}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`});res.end();return;}
   if(name==='start'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'"});res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>正在进入 Win AI</title><body style="font-family:system-ui;padding:48px"><h2>正在进入 Win AI…</h2><p id="status">使用当前行舟影视账号，无需再次注册。</p><script src="/api/win-ai/start.js"></script></body></html>');return;}
   if(name==='start.js'&&req.method==='GET'){res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'});res.end(`fetch('/api/oauth/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'xingzhou',intent:'login'})}).then(r=>r.json()).then(r=>{if(!r.success)throw Error();const u=new URL('/api/win-ai/authorize',location.origin);u.search=new URLSearchParams({client_id:'${CLIENT}',redirect_uri:'${CALLBACK}',response_type:'code',scope:'profile',state:r.data.flow_token});location.replace(u.href)}).catch(()=>{document.getElementById('status').textContent='连接失败，请回到行舟影视重新打开 Win AI。'})`);return;}
   if(name==='authorize'&&req.method==='GET'){
    let location;try{location=await service.authorize({identity:cookieValue(req.headers.cookie,'__Host-winai_identity'),clientId:url.searchParams.get('client_id'),redirectUri:url.searchParams.get('redirect_uri'),state:url.searchParams.get('state')});}catch(error){if(error.status!==403||url.searchParams.get('client_id')!==CLIENT||url.searchParams.get('redirect_uri')!==CALLBACK||!url.searchParams.get('state'))throw error;location='/login';}
    res.writeHead(303,{'location':location,'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
   }
   if(name==='token'&&req.method==='POST'){const b=await read(req);let clientId=b.client_id,clientSecret=b.client_secret;if(req.headers.authorization?.startsWith('Basic ')){const value=Buffer.from(req.headers.authorization.slice(6),'base64').toString();const pos=value.indexOf(':');clientId=value.slice(0,pos);clientSecret=value.slice(pos+1);}send(res,200,await service.exchange({clientId,clientSecret,code:b.code,redirectUri:b.redirect_uri,grantType:b.grant_type}));return;}
   if(name==='userinfo'&&req.method==='GET'){send(res,200,await service.userinfo(String(req.headers.authorization||'').replace(/^Bearer /i,'')));return;}
   if(name==='guard'&&req.method==='GET'){const allowed=await service.guard({authorization:req.headers.authorization,cookie:req.headers.cookie,apiKey:req.headers['x-api-key'],googleKey:req.headers['x-goog-api-key'],mjKey:req.headers['mj-api-secret'],websocketProtocol:req.headers['sec-websocket-protocol'],uri:req.headers['x-winai-original-uri']||'/'});send(res,allowed?204:403);return;}
   send(res,404,{error:'not_found'});
  }catch(error){send(res,error.status||503,{error:error.status?error.message:'Win AI 统一登录暂时不可用，请稍后重试'});}
 };
}
module.exports={createWinAIIdentity,createWinAIHttpHandler,cookieValue};

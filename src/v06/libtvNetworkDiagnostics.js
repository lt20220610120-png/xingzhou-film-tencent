const stages=new Map([['account','读取账号'],['models','读取模型列表']]);
const protocols=new Map([['http','HTTP'],['https','HTTPS'],['socks4','SOCKS4'],['socks5','SOCKS5']]);
const causes=new Map([
 ['NO_CREDENTIALS','缺少本机授权'],
 ['ACCOUNT_UNAVAILABLE','账号读取失败'],
 ['MODELS_UNAVAILABLE','模型列表读取失败'],
 ['CANCELLED','测试已停止'],
 ['NETWORK_ERROR','网络连接异常'],
 ['FETCH_FAILED','请求未收到有效响应'],
 ['ECONNRESET','连接被重置'],
 ['ECONNABORTED','连接已中断'],
 ['ECONNREFUSED','连接被拒绝'],
 ['EPIPE','连接提前断开'],
 ['ENETUNREACH','网络不可达'],
 ['EHOSTUNREACH','目标主机不可达'],
 ['ENETDOWN','网络已断开'],
 ['ENOTFOUND','域名解析失败'],
 ['EAI_AGAIN','域名暂时无法解析'],
 ['ETIMEDOUT','连接超时'],
 ['CONNECT_TIMEOUT','建立连接超时'],
 ['TUNNEL_CONNECT_FAILED','本机转发未能建立连接'],
 ['TLS_TIMEOUT','TLS 握手超时'],
 ['UND_ERR_CONNECT_TIMEOUT','建立连接超时'],
 ['UND_ERR_HEADERS_TIMEOUT','等待响应头超时'],
 ['UND_ERR_BODY_TIMEOUT','读取响应超时'],
 ['UND_ERR_SOCKET','连接提前断开'],
 ['ERR_TLS_CERT_ALTNAME_INVALID','TLS 证书域名不匹配'],
 ['CERT_HAS_EXPIRED','TLS 证书已过期'],
 ['CERT_NOT_YET_VALID','TLS 证书尚未生效'],
 ['DEPTH_ZERO_SELF_SIGNED_CERT','TLS 证书不受信任'],
 ['SELF_SIGNED_CERT_IN_CHAIN','TLS 证书不受信任'],
 ['UNABLE_TO_VERIFY_LEAF_SIGNATURE','无法验证 TLS 证书'],
 ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','无法验证 TLS 证书链'],
 ['ERR_SSL_UNEXPECTED_EOF_WHILE_READING','TLS 连接提前断开'],
 ['ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR','TLS 握手失败'],
 ['ERR_SSL_WRONG_VERSION_NUMBER','TLS 协议不兼容'],
 ['ERR_SSL_UNSUPPORTED_PROTOCOL','目标端不支持 TLS 协议'],
 ['BLOCKED_HOST','目标域名被安全规则拦截'],
 ['SOCKS_AUTH_REQUIRED','SOCKS 代理需要认证'],
 ['SOCKS_PROTOCOL','SOCKS 代理协议不匹配'],
 ['SOCKS_REPLY_1','SOCKS5 暂时无法转发'],
 ['SOCKS_REPLY_2','SOCKS5 代理规则拒绝连接'],
 ['SOCKS_REPLY_3','SOCKS5 代理无法到达网络'],
 ['SOCKS_REPLY_4','SOCKS5 代理无法到达目标'],
 ['SOCKS_REPLY_5','SOCKS5 目标连接被拒绝'],
 ['SOCKS_REPLY_6','SOCKS5 连接超时'],
 ['SOCKS_REPLY_7','SOCKS5 代理不支持连接指令'],
 ['SOCKS_REPLY_8','SOCKS5 代理不支持目标地址类型'],
 ['SOCKS4_REPLY_91','SOCKS4 代理拒绝连接'],
 ['SOCKS4_REPLY_92','SOCKS4 代理需要认证'],
 ['SOCKS4_REPLY_93','SOCKS4 认证失败'],
]);

function describeRoute(route){
 if(route==='direct')return '直连';
 const match=/^(system|custom)-(http|https|socks4|socks5)$/.exec(typeof route==='string'?route:'');
 return match?(match[1]==='system'?'系统代理':'自定义代理')+' · '+protocols.get(match[2]):'路径未确认';
}

function describeFailure(code){
 if(causes.has(code))return {code,cause:causes.get(code)};
 const match=/^(PROXY_HTTP|HTTP)_([45]\d{2})$/.exec(typeof code==='string'?code:'');
 if(!match)return {code:'',cause:'暂时无法确认错误类型'};
 if(match[1]==='PROXY_HTTP')return {code,cause:match[2]==='407'?'代理需要认证':'代理网关异常'};
 return {code,cause:match[2]==='429'?'请求暂时受限':'服务返回错误'};
}

export function libTVNetworkReport(response){
 const raw=Array.isArray(response?.steps)?response.steps:[];
 const steps=[...stages].flatMap(([key,label])=>{
  const step=raw.find(item=>item?.stage===key);
  if(!step)return [];
  const ok=step.ok===true;
  return [{key,label,ok,route:describeRoute(step.route),...(ok?{code:'',cause:''}:describeFailure(step.code))}];
 });
 if(!steps.length)steps.push({key:'account',label:stages.get('account'),ok:false,route:'路径未确认',code:'',cause:'未收到测试结果'});
 const ok=response?.ok===true&&steps.length===stages.size&&steps.every(step=>step.ok);
 const failure=steps.find(step=>!step.ok);
 const suggestion=ok?'':failure?.code==='NO_CREDENTIALS'?'请先连接 LibTV 账号。'
  : failure?.code==='ACCOUNT_UNAVAILABLE'?'请核对 LibTV 授权，再测试连接。'
  : failure?.code==='MODELS_UNAVAILABLE'?'请稍后重试，并核对 LibTV 官网模型列表。'
  : failure?.code==='BLOCKED_HOST'?'请联系行舟影视客服核对连接路径。'
  : ['PROXY_HTTP_407','SOCKS_AUTH_REQUIRED','SOCKS4_REPLY_92','SOCKS4_REPLY_93'].includes(failure?.code)?'请核对代理认证设置，或尝试直连。'
  : failure?.code==='SOCKS_PROTOCOL'?'请核对代理地址的协议和端口。'
  : failure?.code==='CANCELLED'?'可以重新测试连接。'
  : '请检查网络或代理是否可用，再测试连接。';
 return {summary:ok?'连接测试通过':'连接测试未通过',steps,suggestion};
}

export function libTVNetworkReportLine(step){
 return [step.label,step.ok?'通过':'失败',step.route,step.cause,step.code].filter(Boolean).join(' · ');
}

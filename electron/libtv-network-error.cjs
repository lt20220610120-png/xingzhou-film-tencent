const transientCodes=new Map(Object.entries({
 FETCH_FAILED:'请求失败，连接器未返回错误码',
 TUNNEL_CONNECT_FAILED:'本机转发未能建立连接，具体原因未确认',
 ECONNRESET:'连接被重置',
 ECONNABORTED:'网络连接中断',
 ECONNREFUSED:'连接被拒绝',
 EPIPE:'上传连接中断',
 ENETUNREACH:'网络不可达',
 EHOSTUNREACH:'目标主机不可达',
 ENETDOWN:'网络已断开',
 ENOTFOUND:'域名解析失败',
 EAI_AGAIN:'域名暂时无法解析',
 ETIMEDOUT:'连接或等待响应超时',
 CONNECT_TIMEOUT:'建立连接超时',
 TLS_TIMEOUT:'TLS 握手超时',
 UND_ERR_CONNECT_TIMEOUT:'建立连接超时',
 UND_ERR_HEADERS_TIMEOUT:'等待响应头超时',
 UND_ERR_BODY_TIMEOUT:'上传或读取响应超时',
 UND_ERR_SOCKET:'上传连接中断',
 ERR_SSL_UNEXPECTED_EOF_WHILE_READING:'TLS 连接提前断开',
 ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR:'TLS 握手暂时失败',
 SOCKS_REPLY_1:'SOCKS5 代理暂时无法转发',
 SOCKS_REPLY_3:'SOCKS5 代理无法到达网络',
 SOCKS_REPLY_4:'SOCKS5 代理无法到达目标',
 SOCKS_REPLY_5:'SOCKS5 目标连接被拒绝',
 SOCKS_REPLY_6:'SOCKS5 连接超时',
}));
const permanentCodes=new Map(Object.entries({
 BLOCKED_HOST:'目标域名被安全规则拦截',
 SOCKS_PROTOCOL:'SOCKS 端口协议不匹配',
 SOCKS_AUTH_REQUIRED:'SOCKS5 代理要求认证',
 SOCKS_REPLY_2:'SOCKS5 代理规则拒绝连接',
 SOCKS_REPLY_7:'SOCKS5 代理不支持连接指令',
 SOCKS_REPLY_8:'SOCKS5 代理不支持目标地址类型',
 SOCKS4_REPLY_91:'SOCKS4 代理拒绝连接',
 SOCKS4_REPLY_92:'SOCKS4 代理要求认证',
 SOCKS4_REPLY_93:'SOCKS4 认证失败',
 ERR_TLS_CERT_ALTNAME_INVALID:'TLS 证书与目标域名不匹配',
 ERR_SSL_WRONG_VERSION_NUMBER:'代理或目标端 TLS 协议不兼容',
 ERR_SSL_UNSUPPORTED_PROTOCOL:'目标端 TLS 协议不受支持',
 CERT_HAS_EXPIRED:'TLS 证书已过期',
 CERT_NOT_YET_VALID:'TLS 证书尚未生效',
 DEPTH_ZERO_SELF_SIGNED_CERT:'TLS 证书不受信任',
 SELF_SIGNED_CERT_IN_CHAIN:'TLS 证书不受信任',
 UNABLE_TO_VERIFY_LEAF_SIGNATURE:'无法验证 TLS 证书签名',
 UNABLE_TO_GET_ISSUER_CERT_LOCALLY:'无法验证 TLS 证书链',
}));
const transientHTTP=new Set([408,429,500,502,503,504]);
const routeLabels={'system-proxy':'系统代理','custom-proxy':'自定义代理',direct:'直连'};
function routeLabel(mode,protocol){
 return (routeLabels[mode]||'')+(protocol&&protocol!=='direct'?' '+protocol.toUpperCase():'');
}

function describe(code){
 if(transientCodes.has(code))return {label:transientCodes.get(code),retryable:true};
 if(permanentCodes.has(code))return {label:permanentCodes.get(code),retryable:false};
 const status=/^(PROXY_HTTP|HTTP)_(\d{3})$/.exec(code);
 if(status){
  const number=Number(status[2]);
  const label=status[1]==='PROXY_HTTP'
   ? number===407?'代理需要认证':'代理网关返回 HTTP '+number
   : number===429?'LibTV 请求暂时受限（HTTP 429）':number>=500?'LibTV 服务端返回 HTTP '+number:'LibTV 返回 HTTP '+number;
  return {label,retryable:transientHTTP.has(number)};
 }
 return {label:'网络连接异常，连接器未返回可识别错误码',retryable:false};
}

function failure(code='FETCH_FAILED',{host='',mode='',protocol='',routeHint=null,attempts=[]}={}){
 const {label,retryable}=describe(code);
 const detail=attempts.length>1?'，'+attempts.map(row=>routeLabel(row.mode,row.protocol)+' '+describe(row.code).label).join(' / '):'';
 return Object.assign(Error('LibTV 网络连接失败'+(host?' · '+host:'')+'，'+(routeLabels[mode]?routeLabel(mode,protocol)+'：':'')+label+'（'+code+'）'+detail),{
  code:'LIBTV_NETWORK',networkCode:code,retryable,...(host?{host}:{}),...(routeHint?{routeHint}:{}),
 });
}

function codeOf(error){
 const code=String(error?.cause?.code||error?.code||'').toUpperCase();
 return transientCodes.has(code)||permanentCodes.has(code)||/^PROXY_HTTP_[1-5]\d{2}$/.test(code)?code:'NETWORK_ERROR';
}

function codeFromCLI(text){
 // Undici distinguishes a rejected CONNECT from the subsequent origin response.
 // A body can mention a proxy or gateway, so those words alone are not evidence.
 const tunnel=/\bProxy response \(([45]\d{2})\)\s*!={1,2}\s*200 when HTTP Tunneling\b/i.exec(text);
 if(tunnel)return tunnel[1]==='599'?'TUNNEL_CONNECT_FAILED':'PROXY_HTTP_'+tunnel[1];
 const response=/\b(?:request fail(?:ed)?|status(?:Code)?|response (?:code|status)|HTTP\/\d(?:\.\d)?|HTTP)[:\s]+([45]\d{2})\b/i.exec(text)||/^\s*(502) Bad Gateway\s*$/im.exec(text);
 if(response)return 'HTTP_'+response[1];
 const explicit=String(text).match(/\b[A-Z][A-Z0-9_]{3,}\b/g)?.find(code=>transientCodes.has(code)||permanentCodes.has(code)||/^(?:PROXY_HTTP|HTTP)_[45]\d{2}$/.test(code));
 if(explicit)return explicit;
 if(/\b(?:certificate has expired|certificate is not trusted|self[- ]signed certificate|unable to verify the first certificate)\b/i.test(text))return 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
 if(/TLS.*(?:timed? ?out|timeout)/i.test(text))return 'TLS_TIMEOUT';
 if(/timed? ?out|timeout/i.test(text))return 'ETIMEDOUT';
 if(/fetch failed|network|socket|TLS|net::ERR_|request fail/i.test(text))return 'FETCH_FAILED';
 return null;
}

module.exports={failure,codeOf,codeFromCLI};

// 腾讯云版公开客户端配置。服务端密钥只保存在腾讯云服务器环境变量。
//
// 为什么要有多个端点：xingzhoufilm.cn 的 ICP 备案未完成期间，
// 腾讯云会拦截该域名，Electron/Node 的 TLS 连接被 RST（浏览器可能仍可访问）。
// 客户端因此必须能自动回退到服务器 IP，否则一退出登录就再也连不上。
const PRIMARY = 'https://xingzhoufilm.cn';
// 备案/网络策略可能会重置 .cn 域名的 TLS，明文 IP 也可能被运营商转发到
// 其它 404 服务。IP 入口现在有独立的长期 TLS 证书，客户端只信任随包附带的
// 公共证书，因此回退仍然是加密连接，不会把账号密码发到 HTTP。
const FALLBACK = 'https://106.55.41.128';
const IP_TLS_CA_FILE = 'cloud-ip-ca.pem';
const IP_TLS_CERT_FINGERPRINT = '87BC0A0AF6E764E7D1ED9DA15AD631C0C3070875F6B2709A8F0789C6CD7B00F3';

// 按顺序尝试；首个可用的端点会被缓存复用。
const ENDPOINTS = [PRIMARY, FALLBACK];

module.exports = {
  SUPABASE_URL: PRIMARY,
  PUBLISHABLE_KEY: '',
  EDGE_FUNCTION_URL: PRIMARY + '/api/gateway',
  ENDPOINTS,
  GATEWAY_PATH: '/api/gateway',
  IP_TLS_CA_FILE,
  IP_TLS_CERT_FINGERPRINT,
  gatewayUrls: () => ENDPOINTS.map((base) => base + '/api/gateway'),
};

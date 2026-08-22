// 腾讯云版公开客户端配置。服务端密钥只保存在腾讯云服务器环境变量。
//
// 为什么要有多个端点：xingzhoufilm.cn 的 ICP 备案未完成期间，
// 腾讯云会拦截该域名，Electron/Node 的 TLS 连接被 RST（浏览器可能仍可访问）。
// 客户端因此必须能自动回退到服务器 IP，否则一退出登录就再也连不上。
const PRIMARY = 'https://xingzhoufilm.cn';
const FALLBACK = 'http://106.55.41.128';

// 按顺序尝试；首个可用的端点会被缓存复用。
const ENDPOINTS = [PRIMARY, FALLBACK];

module.exports = {
  SUPABASE_URL: PRIMARY,
  PUBLISHABLE_KEY: '',
  EDGE_FUNCTION_URL: PRIMARY + '/api/gateway',
  ENDPOINTS,
  GATEWAY_PATH: '/api/gateway',
  gatewayUrls: () => ENDPOINTS.map((base) => base + '/api/gateway'),
};

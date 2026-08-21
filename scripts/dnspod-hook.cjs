// certbot DNS-01 钩子的实际执行体：调用腾讯云 DNSPod API 管理 TXT 记录。
const crypto = require('crypto');
const HOST = 'dnspod.tencentcloudapi.com';
const SERVICE = 'dnspod';
const VERSION = '2021-03-23';
const SECRET_ID = process.env.SECRET_ID;
const SECRET_KEY = process.env.SECRET_KEY;
const ROOT = process.env.ROOT_DOMAIN;
const MODE = process.env.MODE || 'add';
const VALUE = process.env.CERTBOT_VALIDATION || '';
// 子域名要按 certbot 当前验证的域名推导：
//   xingzhoufilm.cn      -> _acme-challenge
//   www.xingzhoufilm.cn  -> _acme-challenge.www
const DOMAIN = process.env.CERTBOT_DOMAIN || ROOT;
const prefix = DOMAIN === ROOT ? '' : DOMAIN.slice(0, -(ROOT.length + 1));
const SUB = prefix ? '_acme-challenge.' + prefix : '_acme-challenge';

function tc3(action, payload) {
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
  const canonical = ['POST', '/', '', 'content-type:application/json; charset=utf-8\n' + 'host:' + HOST + '\n', 'content-type;host', hash(body)].join('\n');
  const scope = date + '/' + SERVICE + '/tc3_request';
  const sts = ['TC3-HMAC-SHA256', ts, scope, hash(canonical)].join('\n');
  const signing = hmac(hmac(hmac('TC3' + SECRET_KEY, date), SERVICE), 'tc3_request');
  const sig = crypto.createHmac('sha256', signing).update(sts).digest('hex');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    Host: HOST,
    Authorization: 'TC3-HMAC-SHA256 Credential=' + SECRET_ID + '/' + scope + ', SignedHeaders=content-type;host, Signature=' + sig,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(ts),
    'X-TC-Version': VERSION,
  };
  return { body, headers };
}

const call = async (action, payload) => {
  const { body, headers } = tc3(action, payload);
  const r = await fetch('https://' + HOST, { method: 'POST', headers, body });
  const data = await r.json();
  if (data.Response && data.Response.Error) throw new Error(action + ': ' + data.Response.Error.Message);
  return data.Response;
};

(async () => {
  const listed = await call('DescribeRecordList', { Domain: ROOT, Subdomain: SUB, RecordType: 'TXT' }).catch(() => ({ RecordList: [] }));
  const existing = (listed.RecordList || []).filter((x) => x.Name === SUB);
  if (MODE === 'clean') {
    for (const rec of existing) await call('DeleteRecord', { Domain: ROOT, RecordId: rec.RecordId });
    console.log('cleaned ' + existing.length);
    return;
  }
  if (!VALUE) throw new Error('CERTBOT_VALIDATION 为空');
  // 同一次签发可能要求多个 TXT（主域名 + www），保留已有记录并追加。
  const dup = existing.find((x) => x.Value === VALUE);
  if (dup) { console.log('exists'); return; }
  await call('CreateRecord', { Domain: ROOT, SubDomain: SUB, RecordType: 'TXT', RecordLine: '默认', Value: VALUE, TTL: 600 });
  console.log('added');
})().catch((error) => { console.error(String(error.message || error)); process.exit(1); });

const crypto = require('node:crypto');

const MAX_TTL_SECONDS = 15 * 60;
const EXT_WHITELIST = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'pdf']);

const hmacSha1 = (key, value) => crypto.createHmac('sha1', key).update(value).digest('hex');
const sha1 = (value) => crypto.createHash('sha1').update(value).digest('hex');

// 只保留安全字符，杜绝路径穿越与奇怪文件名。
function safeSegment(value, fallback) {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || fallback;
}

function safeExtension(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return EXT_WHITELIST.has(ext) ? ext : 'bin';
}

function buildObjectKey({ projectId, kind, filename }) {
  const project = safeSegment(projectId, 'shared');
  const category = ['image', 'video', 'audio', 'doc'].includes(kind) ? kind : 'file';
  const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  return `projects/${project}/${category}/${unique}-asset.${safeExtension(filename)}`;
}

// 腾讯云 COS 请求签名：https://cloud.tencent.com/document/product/436/7778
function signRequest({ secretId, secretKey, method, objectKey, ttlSeconds, maxTtlSeconds=MAX_TTL_SECONDS, headers={} }) {
  const now = Math.floor(Date.now() / 1000) - 60;
  const expire = now + Math.min(Number(ttlSeconds) || MAX_TTL_SECONDS, maxTtlSeconds);
  const keyTime = `${now};${expire}`;
  const signKey = hmacSha1(secretKey, keyTime);
  const pathname = '/' + String(objectKey).replace(/^\/+/, '');
  const keys=Object.keys(headers).sort(),headerString=keys.map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(headers[k]))).join('&');
  const httpString = `${method.toLowerCase()}\n${pathname}\n\n${headerString}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  const authorization = [
    'q-sign-algorithm=sha1',
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${keys.join(';')}`,
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
  return { authorization, expiresAt: expire * 1000, pathname };
}

function createCosSigner(env = {}) {
  const secretId = String(env.secretId || env.cosSecretId || env.COS_SECRET_ID || '').trim();
  const secretKey = String(env.secretKey || env.cosSecretKey || env.COS_SECRET_KEY || '').trim();
  const bucket = String(env.bucket || env.COS_BUCKET || '').trim();
  const region = String(env.region || env.COS_REGION || '').trim();
  if (!secretId || !secretKey || !bucket || !region) return null;
  const host = `${bucket}.cos.${region}.myqcloud.com`;

  const sign = (method, objectKey, ttlSeconds, extra={}) => {
    const { authorization, expiresAt, pathname } = signRequest({ secretId, secretKey, method, objectKey, ttlSeconds,...extra });
    return { method, authorization, expiresAt, url: `https://${host}${pathname}`, host };
  };

  return {
    host,
    bucket,
    region,
    signUpload({ objectKey, contentType, ttlSeconds, contentLength }) {
      const headers=contentLength===undefined?{}:{'content-length':String(contentLength),'content-type':String(contentType||'application/octet-stream')};
      return { ...sign('PUT', objectKey, ttlSeconds,{headers}), objectKey, contentType: String(contentType || 'application/octet-stream') };
    },
    signDownload({ objectKey, ttlSeconds }) {
      const signed = sign('GET', objectKey, ttlSeconds);
      // 下载地址把签名放进查询串，客户端可直接使用。
      return { ...signed, objectKey, url: `${signed.url}?${signed.authorization}` };
    },
    signDelete({ objectKey, ttlSeconds }) {
      return { ...sign('DELETE', objectKey, ttlSeconds), objectKey };
    },
    signGenerationReference({objectKey}) {
      if(!/^temporary\/generation\/[a-f0-9]{32}\/[a-f0-9-]+\.(?:png|jpg|jpeg|webp|gif|mp4|mov|webm|mp3|wav|m4a)$/.test(objectKey))throw Error('临时素材路径无效');
      const signed=sign('GET',objectKey,48*3600,{maxTtlSeconds:48*3600});return {...signed,objectKey,url:`${signed.url}?${signed.authorization}`};
    },
  };
}

module.exports = { createCosSigner, buildObjectKey, MAX_TTL_SECONDS, EXT_WHITELIST };

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('a proven pinned IP fallback skips repeated system TLS failures on the same IP',async()=>{
 const {createGatewayTransport}=require('./cloud-access-service.cjs');
 let platform=0,pinned=0,now=0;
 const system=async()=>{platform++;throw Object.assign(Error('certificate'),{code:'DEPTH_ZERO_SELF_SIGNED_CERT'});};
 const transport=createGatewayTransport({platformFetch:system,pinnedFetch:async()=>{pinned++;return new Response('{}');},clock:()=>now});
 const ip='https://106.55.41.128/api/gateway';
 await transport(ip,{method:'POST'},{read:true});
 await transport(ip,{method:'POST'},{read:false});
 assert.equal(platform,1);
 assert.equal(pinned,2);
 now+=600001;await transport(ip,{method:'POST'},{read:true});
 assert.equal(platform,2);
});

test('IP 备用入口使用随包证书和固定指纹，不关闭全局 TLS 校验', () => {
  const source = fs.readFileSync(path.join(__dirname, 'cloud-access-service.cjs'), 'utf8');
  assert.match(source, /requestPinnedHttps/);
  assert.match(source, /rejectUnauthorized:\s*true/);
  assert.match(source, /servername:\s*''/);
  assert.match(source, /IP_TLS_CERT_FINGERPRINT/);
  assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED/);
});

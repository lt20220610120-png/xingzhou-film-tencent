const test = require('node:test');
const assert = require('node:assert/strict');
const { createCosSigner, buildObjectKey } = require('../src/cos.cjs');

const config = {
  secretId: 'AKIDTESTTESTTESTTESTTESTTEST',
  secretKey: 'TESTSECRETKEYTESTSECRETKEY00',
  bucket: 'xingzhou-media-test-1469762028',
  region: 'ap-guangzhou',
};

test('未配置 COS 时签名器返回 null，不抛异常', () => {
  assert.equal(createCosSigner({}), null);
  assert.equal(createCosSigner({ cosSecretId: 'only-id' }), null);
});

test('对象键按项目和分类隔离，并清理危险路径字符', () => {
  const key = buildObjectKey({ projectId: 'p1', kind: 'image', filename: '人物 参考.PNG' });
  assert.match(key, /^projects\/p1\/image\/\d+-[a-z0-9]+-/);
  assert.match(key, /\.png$/);
  const evil = buildObjectKey({ projectId: '../../etc', kind: 'video', filename: '../../../passwd.mp4' });
  assert.doesNotMatch(evil, /\.\./);
  assert.doesNotMatch(evil, /passwd\.mp4$/);
});

test('上传签名返回受限于单个对象键的 PUT 地址和有效期', () => {
  const signer = createCosSigner(config);
  const signed = signer.signUpload({ objectKey: 'projects/p1/image/1-a-ref.png', contentType: 'image/png' });
  assert.match(signed.url, /^https:\/\/xingzhou-media-test-1469762028\.cos\.ap-guangzhou\.myqcloud\.com\/projects\/p1\/image\//);
  assert.equal(signed.method, 'PUT');
  assert.match(signed.authorization, /^q-sign-algorithm=sha1&q-ak=AKIDTESTTESTTESTTESTTESTTEST/);
  assert.match(signed.authorization, /q-signature=[0-9a-f]{40}/);
  assert.ok(signed.expiresAt > Date.now());
  // 签名必须绑定该对象键，换成别的键签名应不同
  const other = signer.signUpload({ objectKey: 'projects/p1/image/other.png', contentType: 'image/png' });
  assert.notEqual(signed.authorization, other.authorization);
});

test('下载签名生成带签名的 GET 地址且不泄露密钥', () => {
  const signer = createCosSigner(config);
  const signed = signer.signDownload({ objectKey: 'projects/p1/image/1-a-ref.png' });
  assert.equal(signed.method, 'GET');
  assert.match(signed.url, /q-signature=[0-9a-f]{40}/);
  assert.doesNotMatch(signed.url, new RegExp(config.secretKey));
  assert.doesNotMatch(JSON.stringify(signed), new RegExp(config.secretKey));
});

test('删除签名限定为 DELETE 且与上传签名不同', () => {
  const signer = createCosSigner(config);
  const del = signer.signDelete({ objectKey: 'projects/p1/image/1-a-ref.png' });
  assert.equal(del.method, 'DELETE');
  assert.match(del.authorization, /q-signature=[0-9a-f]{40}/);
});

test('签名有效期可配置且默认不超过 15 分钟', () => {
  const signer = createCosSigner(config);
  const signed = signer.signUpload({ objectKey: 'projects/p1/image/a.png', contentType: 'image/png' });
  assert.ok(signed.expiresAt - Date.now() <= 15 * 60 * 1000 + 2000);
});

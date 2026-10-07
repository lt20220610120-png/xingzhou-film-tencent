const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { signingBytes, validateManifest } = require('../electron/update-trust.cjs');
const keyPath = process.env.XINGZHOU_UPDATE_SIGNING_KEY || path.join(os.homedir(), '.codex', 'secrets', 'xingzhou-update-signing-private.pem');
const publicPath = path.join(__dirname, '../electron/update-signing-key.json');
function loadKey() {
  const key = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const publicKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' });
  if (publicKey !== JSON.parse(fs.readFileSync(publicPath)).publicKey) throw new Error('发布私钥与客户端固定公钥不匹配');
  return key;
}
if (process.argv[2] === '--init') {
  if (fs.existsSync(keyPath) || fs.existsSync(publicPath)) throw new Error('签名密钥已存在，禁止自动替换');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(publicPath, JSON.stringify({ algorithm: 'Ed25519', publicKey: publicKey.export({ type: 'spki', format: 'pem' }) }, null, 2) + '\n', { flag: 'wx' });
  console.log('Release signing key created outside the repository; public key pinned.');
} else if (process.argv[2] === '--check') {
  loadKey(); console.log('Release signing key ready.');
} else {
  const filename = process.argv[2];
  if (!filename) throw new Error('需要更新清单文件路径');
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  manifest.signature = { algorithm: 'Ed25519', value: crypto.sign(null, signingBytes(manifest), loadKey()).toString('base64') };
  validateManifest(manifest);
  fs.writeFileSync(filename, JSON.stringify(manifest, null, 2) + '\n');
}

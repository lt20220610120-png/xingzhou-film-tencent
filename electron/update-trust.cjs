const crypto = require('node:crypto');
const TRUSTED_MANIFEST_URL = 'https://raw.githubusercontent.com/lt20220610120-png/xingzhou-film-tencent/main/latest.json';
const RELEASE_REPO = 'lt20220610120-png/xingzhou-film-updates';
const MAX_INSTALLER_SIZE = 512 * 1024 * 1024;
const fields = ['version', 'installerUrl', 'notes', 'sha256', 'size', 'publishedAt'];
function signingBytes(manifest) {
  return Buffer.from(JSON.stringify(Object.fromEntries(fields.map(key => [key, manifest[key]]))), 'utf8');
}
function validateManifest(manifest, publicKey = require('./update-signing-key.json').publicKey) {
  if (!manifest || !/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.version.split('.').some(n => !Number.isSafeInteger(Number(n)))) throw new Error('更新版本格式无效');
  const expected = `https://github.com/${RELEASE_REPO}/releases/download/v${manifest.version}/Xingzhou-Film-Tencent-Setup-${manifest.version}.exe`;
  if (manifest.installerUrl !== expected) throw new Error('安装包不是行舟官方发布地址');
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.size) || manifest.size < 64 || manifest.size > MAX_INSTALLER_SIZE) throw new Error('更新清单缺少有效的文件校验信息');
  if (typeof manifest.notes !== 'string' || manifest.notes.length > 100000 || typeof manifest.publishedAt !== 'string' || !Number.isFinite(Date.parse(manifest.publishedAt)) || Date.parse(manifest.publishedAt) > Date.now() + 300000) throw new Error('更新清单格式无效');
  const signature = manifest.signature;
  // A checksum alone is not publisher authentication: verify the pinned release key.
  if (signature?.algorithm !== 'Ed25519' || typeof signature.value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature.value) || !crypto.verify(null, signingBytes(manifest), publicKey, Buffer.from(signature.value, 'base64'))) throw new Error('更新清单签名无效，请勿安装');
  return Object.freeze({ ...Object.fromEntries(fields.map(key => [key, manifest[key]])), signature: Object.freeze({ ...signature }) });
}
function assertDownloadUrl(value) {
  const url = new URL(value);
  if(['xingzhoufilm.cn','106.55.41.128'].includes(url.hostname)&&url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&!url.search&&!url.hash&&/^\/api\/updates\/Xingzhou-Film-Tencent-Setup-\d+\.\d+\.\d+\.exe$/.test(url.pathname))return url.toString();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)) throw new Error('更新下载跳转到非可信地址');
  return url.toString();
}
function newerVersion(a,b) {
  const left=a.split('.').map(Number),right=b.split('.').map(Number);
  for(let i=0;i<3;i++){if(left[i]!==right[i])return left[i]>right[i];}return false;
}
module.exports = { TRUSTED_MANIFEST_URL, RELEASE_REPO, MAX_INSTALLER_SIZE, signingBytes, validateManifest, assertDownloadUrl, newerVersion };

const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMediaAction } = require('../src/media.cjs');

const owner = { id: 'u1', username: 'boss', display_name: '行舟', is_admin: true, is_producer: true };
const outsider = { id: 'u9', username: 'stranger', display_name: '路人', is_admin: false, is_producer: false };

function createRepo() {
  const media = [];
  return {
    media,
    async getProject(id, uid) {
      if (id !== 'p1') return null;
      return ['u1', 'u2'].includes(uid) ? { id: 'p1', owner_id: 'u1' } : null;
    },
    async createMedia(pid, row, uid) { const saved = { id: `m${media.length + 1}`, project_id: pid, user_id: uid, ...row }; media.push(saved); return saved; },
    async findMedia(id, uid) { const found = media.find((m) => m.id === id); return found && ['u1', 'u2'].includes(uid) ? found : null; },
    async listMedia(pid, uid) { return ['u1', 'u2'].includes(uid) ? media.filter((m) => m.project_id === pid) : []; },
    async deleteMedia(id, uid) { const i = media.findIndex((m) => m.id === id && m.user_id === uid); if (i < 0) return null; return media.splice(i, 1)[0]; },
  };
}

const signer = {
  signUpload: ({ objectKey }) => ({ method: 'PUT', url: `https://bucket.example/${objectKey}`, authorization: 'q-signature=deadbeef', objectKey, expiresAt: Date.now() + 60000 }),
  signDownload: ({ objectKey }) => ({ method: 'GET', url: `https://bucket.example/${objectKey}?q-signature=deadbeef`, objectKey, expiresAt: Date.now() + 60000 }),
  signDelete: ({ objectKey }) => ({ method: 'DELETE', url: `https://bucket.example/${objectKey}`, authorization: 'q-signature=deadbeef', objectKey, expiresAt: Date.now() + 60000 }),
};

test('未配置 COS 时上传请求返回可读错误而不是崩溃', async () => {
  const result = await handleMediaAction('media-upload-url', { projectId: 'p1', filename: 'a.png', kind: 'image' }, owner, createRepo(), null);
  assert.equal(result.status, 503);
  assert.match(result.body.error, /媒体存储/);
});

test('项目成员可获得上传签名，且签名绑定该项目路径', async () => {
  const result = await handleMediaAction('media-upload-url', { projectId: 'p1', filename: '参考图.png', kind: 'image' }, owner, createRepo(), signer);
  assert.equal(result.status, 200);
  assert.equal(result.body.method, 'PUT');
  assert.match(result.body.objectKey, /^projects\/p1\/image\//);
  assert.match(result.body.url, /^https:\/\/bucket\.example\/projects\/p1\/image\//);
});

test('非项目成员不能获得上传签名', async () => {
  const result = await handleMediaAction('media-upload-url', { projectId: 'p1', filename: 'a.png', kind: 'image' }, outsider, createRepo(), signer);
  assert.equal(result.status, 403);
});

test('上传完成后登记媒体记录，返回可下载地址', async () => {
  const repo = createRepo();
  const created = await handleMediaAction('media-commit', { projectId: 'p1', objectKey: 'projects/p1/image/1-a-asset.png', filename: '参考图.png', kind: 'image', mime: 'image/png' }, owner, repo, signer);
  assert.equal(created.status, 200);
  assert.equal(repo.media.length, 1);
  assert.equal(repo.media[0].object_path, 'projects/p1/image/1-a-asset.png');
  const listed = await handleMediaAction('media-download-url', { mediaId: created.body.id }, owner, repo, signer);
  assert.equal(listed.status, 200);
  assert.match(listed.body.url, /q-signature=/);
});

test('登记媒体时拒绝越权的对象键，防止写入他人项目目录', async () => {
  const result = await handleMediaAction('media-commit', { projectId: 'p1', objectKey: 'projects/p2/image/evil.png', filename: 'evil.png', kind: 'image' }, owner, createRepo(), signer);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /路径/);
});

test('上传者可以删除自己上传的媒体，他人不能', async () => {
  const repo = createRepo();
  const created = await handleMediaAction('media-commit', { projectId: 'p1', objectKey: 'projects/p1/image/1-a-asset.png', filename: 'a.png', kind: 'image' }, owner, repo, signer);
  const denied = await handleMediaAction('media-delete', { mediaId: created.body.id }, { ...outsider, id: 'u2' }, repo, signer);
  assert.equal(denied.status, 404);
  const ok = await handleMediaAction('media-delete', { mediaId: created.body.id }, owner, repo, signer);
  assert.equal(ok.status, 200);
  assert.equal(repo.media.length, 0);
});

test('媒体响应不包含 COS 密钥字段', async () => {
  const repo = createRepo();
  const created = await handleMediaAction('media-commit', { projectId: 'p1', objectKey: 'projects/p1/image/1-a-asset.png', filename: 'a.png', kind: 'image' }, owner, repo, signer);
  const raw = JSON.stringify(created.body);
  assert.doesNotMatch(raw, /secretKey|SecretKey|COS_SECRET/);
});

test('媒体列表为每条记录附带可直接显示的签名地址', async () => {
  const repo = createRepo();
  await handleMediaAction('media-commit', { projectId: 'p1', objectKey: 'projects/p1/image/1-a-asset.png', filename: 'a.png', kind: 'image' }, owner, repo, signer);
  const listed = await handleMediaAction('media-list', { projectId: 'p1' }, owner, repo, signer);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.match(listed.body[0].url, /q-signature=/);
  const denied = await handleMediaAction('media-list', { projectId: 'p1' }, outsider, repo, signer);
  assert.equal(denied.status, 403);
});

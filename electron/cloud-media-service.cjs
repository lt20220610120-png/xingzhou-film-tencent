const fs = require('node:fs');
const path = require('node:path');
const { gateway } = require('./cloud-access-service.cjs');

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf',
};
const KIND_BY_MIME = (mime) => mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'doc';

function createCloudMediaService(readToken, userDataDir) {
  const cacheDir = path.join(userDataDir, 'media-cache');

  const upload = async ({ projectId, filePath, assetId, episode, scene, note }) => {
    if (!fs.existsSync(filePath)) throw new Error('文件不存在');
    const filename = path.basename(filePath);
    const mime = MIME_BY_EXT[path.extname(filename).toLowerCase()] || 'application/octet-stream';
    const kind = KIND_BY_MIME(mime);
    const token = readToken();
    const signed = await gateway('media-upload-url', { projectId, filename, kind, mime }, token);
    const body = fs.readFileSync(filePath);
    const put = await fetch(signed.url, {
      method: 'PUT',
      headers: { Authorization: signed.authorization, 'Content-Type': signed.contentType || mime, 'Content-Length': String(body.length) },
      body,
    });
    if (!put.ok) throw new Error(`媒体上传失败（${put.status}）`);
    return gateway('media-commit', { projectId, objectKey: signed.objectKey, filename, kind, mime, assetId, episode, scene, note }, token);
  };

  const download = async ({ mediaId }) => {
    const token = readToken();
    const signed = await gateway('media-download-url', { mediaId }, token);
    const response = await fetch(signed.url);
    if (!response.ok) throw new Error(`媒体下载失败（${response.status}）`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const target = path.join(cacheDir, `${mediaId}-${signed.filename || 'media'}`);
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    return { filePath: target, filename: signed.filename, mime: signed.mime };
  };

  const remove = async ({ mediaId }) => {
    const token = readToken();
    const result = await gateway('media-delete', { mediaId }, token);
    // 服务端返回受限签名，由客户端完成对象删除。
    if (result?.remove?.url) {
      await fetch(result.remove.url, { method: 'DELETE', headers: { Authorization: result.remove.authorization } }).catch(() => {});
    }
    return { ok: true };
  };

  const list = async ({ projectId }) => gateway('media-list', { projectId }, readToken());

  return { upload, download, remove, list };
}

module.exports = { createCloudMediaService, MIME_BY_EXT };

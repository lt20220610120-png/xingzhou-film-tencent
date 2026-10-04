const fs = require('node:fs/promises');
const path = require('node:path');

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'ts', 'mts', 'm2ts'];

function xmlText(value) {
  // XML 1.0 permits these characters; for-of retains complete Unicode code points.
  return Array.from(value).filter(character => {
    const point = character.codePointAt(0);
    return point === 9 || point === 10 || point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
      (point >= 0x10000 && point <= 0x10ffff);
  }).join('');
}

function validateFormat(format) {
  if (format !== 'txt' && format !== 'docx') throw new Error('请选择 TXT 或 DOCX 文档格式');
}

function validateDocument(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('导出文档参数无效');
  validateFormat(payload.format);
  if (typeof payload.content !== 'string' || !xmlText(payload.content).trim()) throw new Error('没有可导出的正文');
}

function creatorDocumentFileName(name, format) {
  validateFormat(format);
  let safe = (typeof name === 'string' ? xmlText(name) : '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim().replace(/[. ]+$/, '')
    .replace(/\.(?:txt|docx)$/i, '')
    .trim().replace(/[. ]+$/, '');
  safe = Array.from(safe).slice(0, 120).join('').replace(/[. ]+$/, '') || '创作稿';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return `${safe}.${format}`;
}

function escapeXml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  // OPC requires a normal ZIP archive. Stored entries avoid a runtime ZIP dependency.
  const localParts = [], centralParts = [];
  let localOffset = 0;
  for (const [fileName, content] of entries) {
    const name = Buffer.from(fileName, 'utf8'), bytes = Buffer.from(content, 'utf8'), checksum = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x0021, 12); // 1980-01-01, the earliest ZIP date.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + bytes.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildCreatorDocument(payload) {
  validateDocument(payload);
  if (payload.format === 'txt') return Buffer.from(`\ufeff${payload.content.replace(/^\ufeff/, '')}`, 'utf8');
  const paragraphs = xmlText(payload.content).split(/\r\n|\r|\n/).map(line => {
    const runs = line.split('\t').map((part, index) =>
      `${index ? '<w:tab/>' : ''}${part ? `<w:t xml:space="preserve">${escapeXml(part)}</w:t>` : ''}`).join('');
    return `<w:p><w:r>${runs}</w:r></w:p>`;
  }).join('');
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return storedZip([
    ['[Content_Types].xml', `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', `${declaration}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`],
  ]);
}

async function showDialog(dialog, method, window, options) {
  return window ? dialog[method](window, options) : dialog[method](options);
}

async function saveCreatorDocument(payload, { dialog, window } = {}) {
  const bytes = buildCreatorDocument(payload);
  const chosen = await showDialog(dialog, 'showSaveDialog', window, {
    title: '导出创作稿',
    defaultPath: creatorDocumentFileName(payload.name, payload.format),
    filters: [{ name: payload.format === 'docx' ? 'Word 剧本文档' : 'TXT 剧本文档', extensions: [payload.format] }],
  });
  if (chosen.canceled || !chosen.filePath) return null;
  await fs.writeFile(chosen.filePath, bytes);
  return chosen.filePath;
}

async function importCreatorVideo({ dialog, window } = {}) {
  const chosen = await showDialog(dialog, 'showOpenDialog', window, {
    title: '导入创作参考视频',
    properties: ['openFile'],
    filters: [{ name: '视频素材', extensions: VIDEO_EXTENSIONS }],
  });
  const filePath = chosen.filePaths?.[0];
  if (chosen.canceled || !filePath) return null;
  if (!VIDEO_EXTENSIONS.includes(path.extname(filePath).slice(1).toLowerCase())) throw new Error('请选择支持的视频素材');
  return { fileName: path.basename(filePath), filePath };
}

const creatorStateLoads = new Map();
const parseStateBytes = bytes => JSON.parse(bytes.toString('utf8').replace(/^\ufeff/, ''));

async function readCreatorStateWithBackup(filePath) {
  let bytes;
  try { bytes = await fs.readFile(filePath); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw Object.assign(new Error('本地资料读取失败，已停止保存，请检查资料目录权限后重试'), { code: 'CREATOR_STATE_LOAD_FAILED' });
  }
  let state;
  try { state = parseStateBytes(bytes); }
  catch {
    throw Object.assign(new Error('本地资料文件无法解析，已停止保存，请保留原文件并检查资料后重试'), { code: 'CREATOR_STATE_LOAD_FAILED' });
  }
  const legacy = ['fruitProjects', 'scriptProjects'].some(key => Array.isArray(state?.[key]) &&
    state[key].some(project => project && typeof project === 'object' && !Array.isArray(project) && !project.creator?.schemaVersion));
  if (!legacy) return state;

  const backupPath = path.join(path.dirname(filePath), 'state.pre-creator-v260.backup.json');
  let handle;
  try {
    try { handle = await fs.open(backupPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // A directory or incomplete backup must not count as a preserved original.
      if (!(await fs.stat(backupPath)).isFile()) throw new Error('Invalid backup file');
      parseStateBytes(await fs.readFile(backupPath));
      return state;
    }
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
    } catch (error) {
      await handle?.close().catch(() => {});
      handle = null;
      // Remove only this failed exclusive creation; the source remains untouched.
      await fs.unlink(backupPath).catch(() => {});
      throw error;
    }
    return state;
  } catch {
    throw Object.assign(new Error('旧创作资料备份失败，已停止迁移，请检查资料目录权限后重试'), { code: 'CREATOR_BACKUP_FAILED' });
  }
}

function loadCreatorStateWithBackup(filePath) {
  const resolved = path.resolve(filePath);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  if (creatorStateLoads.has(key)) return creatorStateLoads.get(key);
  const pending = readCreatorStateWithBackup(resolved).finally(() => creatorStateLoads.delete(key));
  creatorStateLoads.set(key, pending);
  return pending;
}

module.exports = { buildCreatorDocument, creatorDocumentFileName, saveCreatorDocument, importCreatorVideo, loadCreatorStateWithBackup };

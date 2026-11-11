const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {renameWithRetry, writeJsonAtomic} = require('./atomic-json.cjs');

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TYPES = {
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif',
  '.mp4':'video/mp4', '.mov':'video/quicktime', '.webm':'video/webm',
  '.wav':'audio/wav', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.aac':'audio/aac', '.ogg':'audio/ogg', '.flac':'audio/flac',
  '.pdf':'application/pdf',
};
const MIB = 1024 * 1024;
const LIMITS = {image:64*MIB, audio:128*MIB, video:1024*MIB, doc:64*MIB};
const sourceKeys = new Set(['filePath','localPath','url','imageUrl','image_url','objectKey','objectPath','object_path','previewDataUrl','dataUrl','expiresAt']);
const secretKeys = /^(?:__proto__|constructor|prototype|_license.*|api[_-]?key|access[_-]?key|(?:client[_-]?)?secret(?:[_-]?(?:id|key))?|access[_-]?token|refresh[_-]?token|token|authorization|credentials?|password|headers|cookie|endpoint|privateKey|directory)$/i;
const textFields = /^(?:script|content|source|sourceContent|prompt|originalPrompt|bindingSourcePrompt|bindingCompiledPrompt|description|analysis_output|quote|text)$/i;

function projectIdentifier(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw Error('项目编号无效');
  return value;
}
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
function stableId(projectId, source) {
  const hex = digest(projectId + '\0' + source);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
function cloudKey(value, projectId) {
  const prefix = `projects/${projectId}/`;
  if (typeof value !== 'string' || !value.startsWith(prefix) || value.length > 1024) return '';
  return /^(?:image|audio|video|doc|file)\/[a-z0-9_-]+\.[a-z0-9]+$/i.test(value.slice(prefix.length)) ? value : '';
}
function originalKey(row, projectId) {
  return cloudKey(row?.objectKey || row?.objectPath || row?.object_path, projectId);
}
function remoteIdentity(value) {
  if (!/^https?:\/\//i.test(String(value || ''))) return '';
  try {
    const url = new URL(value);
    return url.username || url.password ? '' : url.origin + url.pathname;
  } catch { return ''; }
}
function family(mime) {
  return mime === 'application/pdf' ? 'doc' : mime.split('/')[0];
}
function filenameOf(value) {
  return String(value || '').split(/[\\/]/).at(-1).replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(-180);
}
function typeOf({filename, mime, kind, filePath}, local = false) {
  const declared = kind === 'asset-image' ? 'image' : kind;
  const names = local ? [filePath] : [filename, filePath];
  let ext = names.map(name => path.extname(String(name || '')).toLowerCase()).find(ext => TYPES[ext]);
  if (!ext && !local) ext = Object.keys(TYPES).find(ext => TYPES[ext] === mime);
  if (!ext) throw Error('素材文件格式不受支持');
  const contentType = TYPES[ext];
  const type = family(contentType);
  if (LIMITS[declared] && declared !== type) throw Error('素材文件类型与选择的类型不一致');
  return {ext, mime:contentType, type, limit:LIMITS[type]};
}
function withoutSource(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !sourceKeys.has(key) && !secretKeys.test(key)));
}
function scrubShare(value, projectId, field = '') {
  if (Array.isArray(value)) return value.map(item=>scrubShare(item,projectId,field));
  if (typeof value === 'string') {
    if (textFields.test(field)) return value;
    if (/^(?:xzmedia|file):/i.test(value) || /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value)) return '';
    return /^https?:\/\//i.test(value) ? remoteIdentity(value) : value;
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key,item]) => !secretKeys.test(key) && !['filePath','localPath','objectPath','object_path','expiresAt','previewDataUrl','dataUrl'].includes(key)
      && (key !== 'objectKey' || cloudKey(item,projectId)))
    .map(([key,item]) => [key,scrubShare(item,projectId,key)]));
}
function inProject(row, projectId) {
  return (!row?.projectId || row.projectId === projectId) && (!row?.project_id || row.project_id === projectId);
}
function assertProject(row, projectId) {
  if (!inProject(row, projectId)) throw Error('素材不属于当前项目');
}
function isReference(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (row.localUnavailable || row.localPath || row.filePath || row.objectKey || row.objectPath || row.object_path) return Boolean(row.id || row.mediaId || row.kind);
  return Boolean((row.id || row.mediaId || row.imageId) && (row.url || ['image','audio','video','asset-image'].includes(row.kind)));
}
function assetImage(asset) {
  const images = asset.images || [];
  const pointer = remoteIdentity(asset.image_url) || asset.image_url;
  return images.find(row => row.id === asset.adoptedImageId) || images.find(row => [row.url, remoteIdentity(row.url), row.objectKey].includes(pointer)) || images.at(-1);
}
function makeIndex(assets, rows, projectId) {
  const ids = new Map();
  const sources = new Map();
  const adopted = new Map();
  const storage = row => [originalKey(row, projectId), row.localPath, row.filePath, remoteIdentity(row.url), row.url].filter(Boolean);
  function add(row, result) {
    if (row.id) ids.set(row.id, result);
    for (const key of storage(row)) if (!sources.has(key)) sources.set(key, result);
  }
  for (const row of rows) add(row, row);
  for (const asset of assets) {
    for (const image of asset.images || []) add(image, ids.get(image.id) || image);
    const image = assetImage(asset);
    if (image) adopted.set(asset.id, ids.get(image.id) || image);
  }
  return {
    add,
    find(row) {
      if (!inProject(row, projectId)) return null;
      const exact = ids.get(row.mediaId) || ids.get(row.imageId);
      if (exact) return exact;
      if (row.assetId && (row.imageId === 'legacy' || row.id === row.assetId)) return adopted.get(row.assetId) || null;
      return ids.get(row.id) || storage(row).map(key => sources.get(key)).find(Boolean) || null;
    },
  };
}
function materializePath(root, value, projectId) {
  const relative = String(value || '');
  if (!/^[0-9a-f-]+\/media\/[0-9a-f]{64}\.[a-z0-9]+$/i.test(relative)) throw Error('本机素材路径无效');
  const [id] = relative.split('/');
  if (!UUID.test(id) || (projectId && id !== projectId)) throw Error('本机素材不属于当前项目');
  return path.join(root, ...relative.split('/'));
}
function playback(root, localPath, projectId) {
  const filePath = materializePath(root, localPath, projectId);
  return {localPath,filePath,url:`xzmedia://local/${encodeURIComponent(filePath)}`};
}
async function isRegular(filename) {
  try { return (await fsp.lstat(filename)).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function trustedManagedPath(root, localPath, projectId) {
  const filename = materializePath(root,localPath,projectId);
  const realRoot = await fsp.realpath(root);
  const realFile = await fsp.realpath(filename);
  if (realFile !== materializePath(realRoot,localPath,projectId) || !await isRegular(filename)) throw Error('本机素材路径超出项目范围');
  return filename;
}
async function openMediaDirectory(root, projectId) {
  const directory = path.join(root,projectId,'media');
  await fsp.mkdir(directory,{recursive:true});
  const realRoot = await fsp.realpath(root);
  if (await fsp.realpath(directory) !== path.join(realRoot,projectId,'media')) throw Error('本机素材目录超出项目范围');
}
async function saveBlob(filename, source, limit, expected) {
  const temp = `${filename}.${randomUUID()}.tmp`;
  const hash = createHash('sha256');
  let size=0;
  const meter = new Transform({transform(chunk, encoding, callback) {
    size += chunk.length;
    if (size > limit) return callback(Error('素材文件超过大小限制'));
    hash.update(chunk);
    callback(null,chunk);
  }});
  try {
    await pipeline(source, meter, fs.createWriteStream(temp,{flags:'wx',mode:0o600}));
    if (!size || (expected !== undefined && size !== expected)) throw Error('素材下载不完整');
    const file = await fsp.open(temp,'r+');
    try { await file.sync(); } finally { await file.close(); }
    await renameWithRetry(temp, filename);
    return {size,sha256:hash.digest('hex')};
  } finally { await fsp.unlink(temp).catch(() => {}); }
}
async function verifiedFile(filename, limit) {
  try {
    if (!await isRegular(filename) || !await isRegular(`${filename}.verified.json`)) return false;
    const info = JSON.parse(await fsp.readFile(`${filename}.verified.json`,'utf8'));
    const stat = await fsp.stat(filename);
    if (!stat.size || stat.size > limit || info.size !== stat.size || !/^[0-9a-f]{64}$/.test(info.sha256)) return false;
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
    return hash.digest('hex') === info.sha256;
  } catch { return false; }
}
function streamFrom(result) {
  const bytes = Buffer.isBuffer(result) || result instanceof Uint8Array ? result : result?.bytes;
  if (bytes instanceof Uint8Array) return Readable.from([bytes]);
  if (result?.body?.getReader) return Readable.fromWeb(result.body);
  if (result?.body?.pipe) return result.body;
  throw Error('素材下载未返回文件');
}
function checkDownloadType(result, expectedType) {
  const mime = String(result?.mime || result?.headers?.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const generic = ['application/octet-stream','binary/octet-stream','application/x-download'];
  if (mime && !generic.includes(mime) && family(mime) !== expectedType) throw Error('云端返回的素材格式与项目记录不符');
}
function activeReference(field, previous) {
  return field === 'references' || field === 'confirmed' || (field === 'reference' && previous === 'voiceCards');
}
async function transformReferences(value, transform, field = '', previous = '') {
  if (Array.isArray(value)) return Promise.all(value.map(item => transformReferences(item,transform,field,previous)));
  if (!value || typeof value !== 'object') return value;
  if (isReference(value)) return transform(value,activeReference(field,previous));
  const rows = await Promise.all(Object.entries(value).filter(([key])=>!sourceKeys.has(key)&&!secretKeys.test(key)).map(async ([key,item])=>[key,await transformReferences(item,transform,key,field)]));
  return Object.fromEntries(rows);
}
function projectRows(assets, media, projectId) {
  const rows = new Map();
  for (const row of media) {
    assertProject(row,projectId);
    if (!row.id || rows.has(row.id)) throw Error('项目素材记录编号无效');
    rows.set(row.id,row);
  }
  const withImages = assets.map(asset => {
    assertProject(asset,projectId);
    let images = asset.images || [];
    if (!images.length && remoteIdentity(asset.image_url)) {
      images = [{id:stableId(projectId,`legacy:${asset.id}:${remoteIdentity(asset.image_url)}`),url:asset.image_url,filename:filenameOf(new URL(asset.image_url).pathname),mime:'image/png'}];
    }
    images = images.map(image => {
      assertProject(image,projectId);
      if (!image.id) throw Error('资产图片编号无效');
      const existing = rows.get(image.id);
      if (existing && (existing.assetId || existing.asset_id) && (existing.assetId || existing.asset_id) !== asset.id) throw Error('图片编号已属于其他资产');
      const row = {...image,...existing,assetId:asset.id,projectId,kind:'asset-image'};
      rows.set(row.id,row);
      return row;
    });
    return {...asset,images};
  });
  return {assets:withImages, rows:[...rows.values()]};
}
async function mapLimited(rows, mapper) {
  const output = [];
  let cursor = 0;
  let failed;
  const worker = async () => {
    while (!failed && cursor < rows.length) {
      const index = cursor++;
      try { output[index] = await mapper(rows[index]); }
      catch (error) { failed = error; }
    }
  };
  await Promise.all(Array.from({length:Math.min(4,rows.length)},worker));
  if (failed) throw failed;
  return output;
}

function createLocalProjectMedia({root, download, upload, resolveLocalReference} = {}) {
  const rootPath = () => path.resolve(typeof root === 'function' ? root() : root);
  const transfers = new Map();

  async function storeFile({projectId, filePath, id = randomUUID(), kind, filename}) {
    projectIdentifier(projectId);
    const format = typeOf({filePath,kind},true);
    const root = rootPath();
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || !stat.size || stat.size > format.limit) throw Error('素材文件为空或超过大小限制');
    await openMediaDirectory(root,projectId);
    const localPath = `${projectId}/media/${digest(randomUUID())}${format.ext}`;
    const source = playback(root,localPath,projectId);
    await saveBlob(source.filePath,fs.createReadStream(filePath),format.limit,stat.size);
    const selectedName = filenameOf(filename || filePath);
    const name = TYPES[path.extname(selectedName).toLowerCase()] ? selectedName : selectedName + format.ext;
    return {...source,id,projectId,kind:kind==='asset-image'?kind:format.type,filename:name,mime:format.mime};
  }

  async function captureCloudFile(root, projectId, row) {
    const key = originalKey(row,projectId);
    const clean = {...withoutSource(row),projectId,...(key?{objectKey:key}:{})};
    if (!remoteIdentity(row.url) || !download) return {...clean,localUnavailable:true};
    const recordedName = row.filename || new URL(row.url).pathname;
    let format;
    try { format = typeOf({...row,filename:TYPES[path.extname(key).toLowerCase()] ? key : recordedName}); }
    catch { return {...clean,localUnavailable:true}; }
    const localPath = `${projectId}/media/${digest(key || remoteIdentity(row.url))}${format.ext}`;
    const source = playback(root,localPath,projectId);
    let transfer = transfers.get(source.filePath);
    if (!transfer) {
      transfer = (async () => {
        await openMediaDirectory(root,projectId);
        if (await verifiedFile(source.filePath,format.limit)) return source;
        const result = await download(row);
        const body = streamFrom(result);
        try {
          checkDownloadType(result,format.type);
          const expected = Number.isSafeInteger(result?.size) ? result.size : undefined;
          const receipt = await saveBlob(source.filePath,body,format.limit,expected);
          await writeJsonAtomic(`${source.filePath}.verified.json`,receipt);
        } finally { body.destroy(); }
        return source;
      })().finally(()=>transfers.delete(source.filePath));
      transfers.set(source.filePath,transfer);
    }
    try {
      const local = await transfer;
      delete clean.localUnavailable;
      return {...clean,...local,filename:filenameOf(row.filename || new URL(row.url).pathname),mime:format.mime};
    } catch (error) {
      if ([404,410].includes(error.status)) return {...clean,localUnavailable:true};
      throw error;
    }
  }

  async function capture({project, assets = [], media = []}) {
    const projectId = projectIdentifier(project.id);
    const root = rootPath();
    const canonical = projectRows(assets,media,projectId);
    const downloaded = await mapLimited(canonical.rows,row=>captureCloudFile(root,projectId,row));
    const byId = new Map(downloaded.map(row=>[row.id,row]));
    const cloudIndex = makeIndex(canonical.assets,canonical.rows,projectId);
    const copiedLocal = new Map();
    const savedProject = await transformReferences(project,async row => {
      const clean = withoutSource(row);
      const source = byId.get(cloudIndex.find(row)?.id);
      if (source?.filePath) return {...clean,...playback(root,source.localPath,projectId),...(source.objectKey?{objectKey:source.objectKey}:{}),mediaId:source.id,localUnavailable:false};
      if (inProject(row,projectId) && row.filePath && resolveLocalReference) {
        const local = await resolveLocalReference(row,projectId);
        if (local) {
          if (!copiedLocal.has(local)) copiedLocal.set(local,storeFile({projectId,filePath:local,id:UUID.test(row.id||'')?row.id:stableId(projectId,`ref:${row.id}:${row.kind}`),kind:row.kind,filename:row.filename||row.name}));
          const stored = await copiedLocal.get(local);
          byId.set(stored.id,stored);
          return {...clean,...playback(root,stored.localPath,projectId),mediaId:stored.id,localUnavailable:false};
        }
      }
      return {...clean,localUnavailable:true};
    });
    const savedAssets = canonical.assets.map(asset => {
      const adopted = byId.get(assetImage(asset)?.id);
      return {...withoutSource(asset),adoptedImageId:adopted?.id || null,image_url:adopted?.url || '',images:asset.images.map(image=>byId.get(image.id))};
    });
    return {project:savedProject,assets:savedAssets,media:[...byId.values()]};
  }

  function materialize(bundle) {
    const projectId = projectIdentifier(bundle.project.id);
    const root = rootPath();
    function visit(value) {
      if (Array.isArray(value)) return value.map(visit);
      if (!value || typeof value !== 'object') return value;
      const row = Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)]));
      return row.localPath ? {...row,...playback(root,row.localPath,projectId)} : row;
    }
    const result = visit(bundle);
    result.assets = (result.assets||[]).map(asset=>({...asset,image_url:assetImage(asset)?.url || ''}));
    return result;
  }

  function resolveReferences(references, bundle) {
    const saved = materialize(bundle);
    const index = makeIndex(saved.assets,saved.media||[],saved.project.id);
    return references.map(row=>{
      const source = index.find(row);
      if (!source?.filePath) return row.localPath ? {...row,...playback(rootPath(),row.localPath,saved.project.id)} : row;
      return {...row,...playback(rootPath(),source.localPath,saved.project.id),objectKey:source.objectKey||row.objectKey,mediaId:source.id,localUnavailable:false};
    });
  }

  async function prepareShare({project, assets = [], media = []}) {
    const projectId = projectIdentifier(project.id);
    const root = rootPath();
    const canonical = projectRows(assets,media,projectId);
    const index = makeIndex(canonical.assets,canonical.rows,projectId);
    const planned = new Map(canonical.rows.filter(row=>!row.localUnavailable || originalKey(row,projectId)).map(row=>[row.id,row]));
    const copied = new Map();
    const projectWithIds = await transformReferences(project,async (row, required)=>{
      let source = index.find(row);
      if (!source && inProject(row,projectId) && row.localPath && !row.localUnavailable) {
        const id = UUID.test(row.id || '') ? row.id : stableId(projectId,row.localPath);
        source = {...withoutSource(row),id,projectId,localPath:row.localPath};
      }
      if (!source && inProject(row,projectId) && row.filePath && resolveLocalReference) {
        const local = await resolveLocalReference(row,projectId);
        if (local) {
          if (!copied.has(local)) {
            const id = stableId(projectId,`ref:${local}`);
            copied.set(local,storeFile({projectId,filePath:local,id,kind:row.kind,filename:row.filename||row.name}));
          }
          source = await copied.get(local);
        }
      }
      const clean = withoutSource(row);
      if (!source || source.localUnavailable) {
        if (required) throw Error('部分分镜或采用音色的素材不在本机，请重新选择素材后再邀请');
        return {...clean,localUnavailable:true};
      }
      delete clean.localUnavailable;
      planned.set(source.id,source);
      return {...clean,mediaId:source.id};
    });
    // Validate the complete snapshot before uploading any local media. Large videos
    // are sent one at a time through the existing signed uploader.
    const sources = [];
    for (const row of planned.values()) {
      if (!UUID.test(row.id || '')) throw Error('项目素材记录编号无效');
      const objectKey = originalKey(row,projectId);
      if (objectKey) sources.push({row,objectKey});
      else {
        if (!row.localPath || !upload) throw Error('本机素材文件不存在，请重新选择素材后再邀请');
        sources.push({row,filename:await trustedManagedPath(root,row.localPath,projectId)});
      }
    }
    const rows = new Map();
    const uploadedFiles = new Map();
    for (const {row,objectKey,filename} of sources) {
      let key = objectKey || uploadedFiles.get(filename);
      if (!key) {
        const result = await upload(projectId,filename,row.kind);
        key = cloudKey(result?.objectKey,projectId);
        if (!key) throw Error('素材上传回执不属于当前项目');
        uploadedFiles.set(filename,key);
      }
      const result = {...withoutSource(row),projectId,objectKey:key};
      delete result.localUnavailable;
      rows.set(row.id,result);
    }
    function addObjectKeys(value) {
      if (Array.isArray(value)) return value.map(addObjectKeys);
      if (!value || typeof value !== 'object') return value;
      const row = Object.fromEntries(Object.entries(value).map(([key,item])=>[key,addObjectKeys(item)]));
      const source = !row.localUnavailable && rows.get(row.mediaId);
      return source ? {...row,objectKey:source.objectKey} : row;
    }
    const sharedAssets = canonical.assets.map(asset => {
      const adopted = rows.get(assetImage(asset)?.id);
      return {...withoutSource(asset),adoptedImageId:adopted?.id || null,image_url:adopted?.objectKey || '',images:asset.images.map(image=>rows.get(image.id)).filter(Boolean)};
    });
    return scrubShare({project:addObjectKeys(projectWithIds),assets:sharedAssets,media:[...rows.values()]},projectId);
  }

  return {storeFile,capture,materialize,resolveReferences,prepareShare};
}

module.exports = {createLocalProjectMedia};

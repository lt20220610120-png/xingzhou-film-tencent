const fs = require('node:fs');
const path = require('node:path');
const { readMediaBytes } = require('./media-network.cjs');
const models = require('../core/feituo-models.json');
const BASE = 'https://feituokuajing.com';
function validate(input) {
  const model = models.find(m => m.id === input.model);
  if (!model) throw new Error('请选择已支持的飞拓模型');
  if (!input.prompt?.trim()) throw new Error('请填写提示词');
  if (model.maxPrompt && input.prompt.length > model.maxPrompt) throw new Error(`提示词最多 ${model.maxPrompt} 字`);
  const durations = model.durationByResolution?.[input.resolution] || model.durations;
  if (model.kind === 'video' && !durations.includes(Number(input.duration))) throw new Error('所选模型不支持该时长');
  if (!model.ratios.includes(input.ratio)) throw new Error('所选模型不支持该比例');
  if (model.resolutions.length && !model.resolutions.includes(input.resolution)) throw new Error('所选模型不支持该分辨率');
  const refs = input.references || [];
  if(model.protocol==='metadata-content') {
    for(const role of ['first_frame','last_frame'])if(refs.filter(r=>r.role===role).length>1)throw new Error('首帧和尾帧各只能选择一张');
    if(refs.some(r=>r.kind==='image'&&r.role&&!['reference_image','first_frame','last_frame'].includes(r.role)))throw new Error('图片用途不合法');
  }
  for (const [kind, limit] of [['image', model.maxImages], ['video', model.maxVideos], ['audio', model.maxAudios]]) {
    if (limit !== null && refs.filter(r => r.kind === kind).length > limit) throw new Error(`${model.name} 的${kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频'}参考最多 ${limit} 个`);
  }
  if (refs.some(r => r.kind === 'audio') && !refs.some(r => r.kind === 'image')) throw new Error('参考音频必须同时提供至少一张图片');
  for (const ref of refs) {
    if (!['image','video','audio'].includes(ref.kind)) throw new Error('不支持的参考素材类型');
    if (ref.filePath) { if (!fs.existsSync(ref.filePath)) throw new Error(`参考素材不存在：${ref.name || ''}`); }
    else if (!/^https?:\/\//.test(ref.url || '')) throw new Error(`参考素材没有可访问的地址：${ref.name || ''}`);
  }
  for (const match of input.prompt.matchAll(/@(image|video|audio)(\d+)\b/g)) {
    if (+match[2] < 1 || +match[2] > refs.filter(r => r.kind === match[1]).length) throw new Error(`提示词引用了不存在的素材 ${match[0]}`);
  }
  return model;
}
function headers(apiKey) {
  if (!apiKey?.trim()) throw new Error('请填写飞拓 API Key');
  return { Authorization: `Bearer ${apiKey.trim()}`, 'X-Public-Model-Ids': '1' };
}
async function json(response) {
  let data; try { data = await response.json(); } catch { throw new Error(`飞拓返回了非 JSON 响应（${response.status}）`); }
  if (!response.ok || data.success === false) throw new Error(data.errorMessage || data.error?.message || data.error || `飞拓请求失败（${response.status}）`);
  return data;
}
async function submit(input) {
  const model = validate(input), refs = input.references || [];
  const h = headers(input.apiKey);
  const payload = { model: input.model, prompt: input.prompt.trim(), ratio: input.ratio, duration: Number(input.duration) };
  if (model.kind === 'image') { delete payload.duration; if (input.imageSize) payload.imageSize=input.imageSize; }
  if (model.resolutions.length) payload.resolution = input.resolution;
  let body;
  if (model.protocol === 'metadata-content') {
    // This endpoint documents only public URL references for metadata.content.
    if (refs.some(r => r.filePath)) throw new Error('官转模型请先将本地素材上传到项目素材库，再选择引用');
    body = JSON.stringify({ model: input.model, prompt: payload.prompt, seconds: String(input.duration), metadata: { ratio: input.ratio, content: refs.map(r => ({ type: `${r.kind}_url`, role: r.kind === 'image' ? (r.role || 'reference_image') : 'reference_audio', [`${r.kind}_url`]: { url: r.url } })) } });
    h['Content-Type'] = 'application/json';
  } else if (refs.some(r => r.filePath)) {
    // Convert every reference to a file, preserving per-kind order in mixed local/remote input.
    body = new FormData();
    for (const [k,v] of Object.entries(payload)) body.append(k,String(v));
    for (const r of refs) {
      let blob;
      if (r.filePath) {const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg'}[path.extname(r.filePath).toLowerCase()];if(!mime)throw new Error('不支持此参考文件格式');blob = new Blob([fs.readFileSync(r.filePath)],{type:mime});}
      else { const result = await readMediaBytes(r.url, { timeoutMs:120000, label:`参考素材 ${r.name || ''}` }); blob = new Blob([result.bytes],{type:result.mime}); }
      body.append(`${r.kind}s`, blob, r.filePath ? path.basename(r.filePath) : (r.filename || `${r.kind}.${r.kind === 'image' ? 'png' : r.kind === 'video' ? 'mp4' : 'mp3'}`));
    }
  } else {
    for (const kind of ['image','video','audio']) payload[`${kind}Urls`] = refs.filter(r => r.kind === kind).map(r => r.url);
    h['Content-Type'] = 'application/json'; body = JSON.stringify(payload);
  }
  const data = await json(await fetch(`${BASE}/api/open/v1/${model.kind}/generate`, { method: 'POST', headers: h, body, signal: AbortSignal.timeout(model.kind === 'image' ? 300000 : 120000) }));
  if (!data.jobId) throw new Error('提交响应缺少 jobId，请在飞拓任务日志核对后再操作');
  return data;
}
async function status({ jobId, apiKey }) {
  if (!jobId) throw new Error('缺少任务编号');
  return json(await fetch(`${BASE}/api/open/v1/video/status?jobId=${encodeURIComponent(jobId)}&_=${Date.now()}`, { cache: 'no-store', headers: { ...headers(apiKey), 'Cache-Control':'no-cache' }, signal: AbortSignal.timeout(60000) }));
}
module.exports = { submit, status, validate };

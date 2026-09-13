// 图片 / 视频生成服务：兼容 OpenAI 格式与火山方舟（即梦/Seedance）格式
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeBase(endpoint = '') {
  return String(endpoint).trim().replace(/\/+$/, '')
    .replace(/\/images\/generations$/, '')
    .replace(/\/contents\/generations\/tasks$/, '');
}

function authHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`接口返回异常：${text.slice(0, 160) || '空响应'}`); }
}

function isFeituoEndpoint(endpoint = '') {
  try { return new URL(endpoint).hostname === 'feituokuajing.com'; } catch { return false; }
}
function buildFeituoVideoPayload({ model, prompt, ratio, duration, resolution, imageUrls = [], videoUrls = [], audioUrls = [] }) {
  return { model: String(model || '').trim(), prompt: String(prompt || '').trim(), ratio, duration, ...(resolution ? { resolution } : {}), imageUrls, videoUrls, audioUrls };
}
function parseFeituoStatus(data) {
  const status = String(data?.status || '').toLowerCase();
  if (['success', 'succeeded', 'completed'].includes(status)) {
    if (!data.videoUrl) throw new Error('飞拓任务完成但没有返回视频地址');
    return { state: 'success', url: data.videoUrl };
  }
  if (['failed', 'cancelled', 'canceled', 'error'].includes(status)) throw new Error(data.errorMessage || '视频生成失败');
  return { state: 'pending', jobId: data?.jobId || '' };
}
async function generateFeituoVideo({ apiKey, model, prompt, ratio, duration, resolution, imageUrls = [], destDir, onStatus = () => {} }) {
  if (!apiKey?.trim()) throw new Error('请在 API 接口中填写飞拓 API Key');
  if (!model?.trim()) throw new Error('请先选择飞拓视频模型');
  const base = 'https://feituokuajing.com';
  const auth = `Bearer ${apiKey.trim()}`;
  const create = await fetch(`${base}/api/open/v1/video/generate`, { method: 'POST', headers: { Authorization: auth, 'X-Public-Model-Ids': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(buildFeituoVideoPayload({ model, prompt, ratio, duration, resolution, imageUrls })), signal: AbortSignal.timeout(120000) });
  const submitted = await readJson(create);
  if (!create.ok || submitted.success === false) throw new Error(submitted.error || submitted.errorMessage || `飞拓提交失败（${create.status}）`);
  if (!submitted.jobId) throw new Error('飞拓接口未返回 jobId');
  onStatus('submitted');
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 15000));
    const response = await fetch(`${base}/api/open/v1/video/status?jobId=${encodeURIComponent(submitted.jobId)}&_=${Date.now()}`, { cache: 'no-store', headers: { Authorization: auth, 'X-Public-Model-Ids': '1', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(60000) });
    const result = await readJson(response);
    if (!response.ok || result.success === false) throw new Error(result.error || result.errorMessage || `飞拓状态查询失败（${response.status}）`);
    const parsed = parseFeituoStatus(result); onStatus(parsed.state);
    if (parsed.state === 'success') return downloadToFile(parsed.url, destDir, 'mp4');
  }
  throw new Error('飞拓视频生成超时，请稍后在任务记录中查看');
}

async function downloadToFile(url, destDir, ext) {
  fs.mkdirSync(destDir, { recursive: true });
  const file = path.join(destDir, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`);
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1] || '';
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    return file;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new Error(`媒体文件下载失败（${response.status}）`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

// ---------- 图片生成（OpenAI images API 兼容：/images/generations） ----------
async function generateImage({ endpoint, apiKey, model, prompt, size = '1024x1024', ratio, references = [], destDir }) {
  if (!endpoint?.trim()) throw new Error('请先在画布中配置图片生成 API');
  if (!prompt?.trim()) throw new Error('请填写画面描述');
  if (!model?.trim()) throw new Error('请先在 API 接口中填写图片模型名称');
  if(isFeituoEndpoint(endpoint)) {
    const sizes={'1024x1024':'1:1','1280x720':'16:9','720x1280':'9:16','1024x768':'4:3','768x1024':'3:4','1152x768':'3:2','768x1152':'2:3'};
    const result=await require('./feituo-client.cjs').submit({kind:'image',apiKey,model,prompt,ratio:ratio||sizes[size]||'auto',references});
    if(!result.resultUrls?.length)throw new Error('飞拓没有返回图片结果');
    return downloadToFile(result.resultUrls[0],destDir,'png');
  }
  if(references.length)throw new Error('当前自定义图片接口尚未配置参考图协议，请选择飞拓接口使用参考图');
  const base = normalizeBase(endpoint);
  const response = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model: model?.trim() || undefined, prompt: prompt.trim(), size, n: 1, response_format: 'url' }),
    signal: AbortSignal.timeout(300000),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `图片接口请求失败（${response.status}）`);
  const item = data?.data?.[0] || {};
  const url = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
  if (!url) throw new Error('接口已响应，但没有返回图片');
  return await downloadToFile(url, destDir, 'png');
}

// ---------- 视频生成（火山方舟 Seedance 任务式 API，同时兼容一次性返回） ----------
function buildVideoContent({ prompt, ratio, duration, resolution, audioEnabled, firstFrameDataUrl, firstFrameUrl }) {
  let text = prompt.trim();
  if (ratio) text += ` --ratio ${ratio}`;
  if (duration) text += ` --duration ${duration}`;
  if (resolution) text += ` --resolution ${resolution}`;
  if (typeof audioEnabled === 'boolean') text += ` --audio ${audioEnabled ? 'on' : 'off'}`;
  const content = [{ type: 'text', text }];
  const frame = firstFrameDataUrl || firstFrameUrl;
  if (frame) content.push({ type: 'image_url', image_url: { url: frame }, role: 'first_frame' });
  return content;
}

async function generateVideo({ endpoint, apiKey, model, prompt, ratio, duration, resolution, audioEnabled, firstFramePath, firstFrameUrl, references = [], destDir, onStatus = () => {} }) {
  if (!endpoint?.trim()) throw new Error('请先在画布中配置视频生成 API');
  if (!prompt?.trim()) throw new Error('请填写视频描述');
  if(references.length>1 || references.some(r=>r.kind!=='image'))throw new Error('当前自定义视频接口仅支持一张首帧参考，请切换飞拓接口使用多素材参考');
  firstFramePath=firstFramePath||references[0]?.filePath;firstFrameUrl=firstFrameUrl||references[0]?.url;
  const localFrame = firstFramePath && fs.existsSync(firstFramePath) ? `data:image/png;base64,${fs.readFileSync(firstFramePath).toString('base64')}` : '';
  if (isFeituoEndpoint(endpoint)) return generateFeituoVideo({ apiKey, model, prompt, ratio, duration, resolution, onStatus, destDir, imageUrls: firstFrameUrl || localFrame ? [firstFrameUrl || localFrame] : [] });
  const base = normalizeBase(endpoint);
  let firstFrameDataUrl = '';
  if (firstFramePath && fs.existsSync(firstFramePath)) {
    firstFrameDataUrl = `data:image/png;base64,${fs.readFileSync(firstFramePath).toString('base64')}`;
  }
  const createResponse = await fetch(`${base}/contents/generations/tasks`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model: model?.trim() || undefined, audio: audioEnabled, content: buildVideoContent({ prompt, ratio, duration, resolution, audioEnabled, firstFrameDataUrl, firstFrameUrl }) }),
    signal: AbortSignal.timeout(120000),
  });
  const created = await readJson(createResponse);
  if (!createResponse.ok) throw new Error(created?.error?.message || created?.message || `视频接口请求失败（${createResponse.status}）`);
  // 一次性返回视频地址的兼容分支
  const direct = created?.content?.video_url || created?.data?.[0]?.url;
  if (direct) return await downloadToFile(direct, destDir, 'mp4');
  const taskId = created?.id || created?.task_id;
  if (!taskId) throw new Error('接口未返回任务 ID，无法查询视频生成进度');
  // 轮询任务状态
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const pollResponse = await fetch(`${base}/contents/generations/tasks/${taskId}`, { headers: authHeaders(apiKey), signal: AbortSignal.timeout(60000) });
    const task = await readJson(pollResponse);
    if (!pollResponse.ok) throw new Error(task?.error?.message || `任务查询失败（${pollResponse.status}）`);
    const status = String(task.status || '').toLowerCase();
    onStatus(status);
    if (['succeeded', 'success', 'completed'].includes(status)) {
      const url = task?.content?.video_url || task?.outputs?.[0]?.url || task?.result?.video_url;
      if (!url) throw new Error('任务已完成，但没有返回视频地址');
      return await downloadToFile(url, destDir, 'mp4');
    }
    if (['failed', 'cancelled', 'canceled', 'error'].includes(status)) {
      throw new Error(task?.error?.message || task?.failure_reason || '视频生成任务失败');
    }
  }
  throw new Error('视频生成超时（10 分钟），请稍后在服务商控制台查看任务');
}

module.exports = { downloadToFile, generateImage, generateVideo, normalizeBase, buildVideoContent, buildFeituoVideoPayload, parseFeituoStatus };

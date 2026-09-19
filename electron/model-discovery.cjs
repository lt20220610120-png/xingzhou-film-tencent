// Model lists are provider-owned metadata, not executable configuration.
function listUrl(endpoint) {
  const url = new URL(String(endpoint).trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请输入有效的接口地址');
  url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|responses|messages|images\/(?:generations|edits)|contents\/generations\/tasks|audio\/(?:speech|transcriptions)|models)$/, '');
  if (!url.pathname || url.pathname === '/') url.pathname = '/v1';
  url.pathname += '/models';
  return url.toString();
}
async function discoverModels(config, fetchFn = globalThis.fetch) {
  const url = listUrl(config.endpoint);
  const headers = config.protocol === 'anthropic'
    ? {'x-api-key': String(config.apiKey || '').trim(), 'anthropic-version': '2023-06-01'}
    : config.apiKey?.trim() ? {Authorization: `Bearer ${config.apiKey.trim()}`} : {};
  const result = []; const seen = new Set();
  let next = url;
  for (let page = 0; page < 10 && next; page++) {
    const response = await fetchFn(next, {headers, redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`模型列表读取失败（${response.status}）；可手动填写模型和参数`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : body.data || body.models;
    if (!Array.isArray(rows)) throw new Error('接口未返回模型列表，请手动填写模型');
    for (const row of rows) {
      const item = typeof row === 'string' ? {id:row} : row;
      const id = item.id || item.model_name || item.name;
      if (!id || seen.has(id)) continue;
      seen.add(id); result.push({id:String(id), endpoint:url.replace(/\/models$/, ''), name:String(item.display_name || item.name || id), kind:item.kind || item.mode || item.model_info?.mode,
        output_modalities:item.output_modalities || item.architecture?.output_modalities,
        capabilities:item.capabilities || item.parameters || item.model_info || {}});
    }
    next = '';
    if (body.has_more && body.last_id && config.protocol === 'anthropic') {
      const pageUrl = new URL(url); pageUrl.searchParams.set('after_id', body.last_id); next = pageUrl.toString();
    }
  }
  return result;
}
module.exports = {listUrl, discoverModels};

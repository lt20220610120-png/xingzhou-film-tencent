const values = value => Array.isArray(value) ? value : Array.isArray(value?.enum) ? value.enum : typeof value === 'string' ? value.split(/[,，\s]+/) : [];
const strings = value => [...new Set(values(value).map(String).map(x=>x.trim()).filter(Boolean))];
export function normalizeCapabilities(raw = {}) {
  raw = raw?.properties || raw?.input_schema?.properties || raw || {};
  const result = {};
  const durations = [...new Set(values(raw.durations || raw.duration || raw.supported_durations).map(Number).filter(n=>Number.isFinite(n)&&n>0&&n<=3600))];
  if (durations.length) result.durations = durations;
  for (const [key, source] of Object.entries({ratios:raw.ratios||raw.aspect_ratios||raw.aspect_ratio, resolutions:raw.resolutions||raw.resolution, imageSizes:raw.imageSizes||raw.image_sizes||raw.size})) {
    const items = strings(source); if (items.length) result[key] = items;
  }
  return result;
}
export function discoveredModelKind(model) {
  const mode = String(model.kind || '').toLowerCase();
  if (['chat','text','completion','responses'].includes(mode)) return 'chat';
  if (/image/.test(mode)) return 'image';
  if (/video/.test(mode)) return 'video';
  if (/audio|speech|transcription/.test(mode)) return 'audio';
  const outputs = model.output_modalities || [];
  for (const kind of ['video','image','audio']) if (outputs.includes(kind)) return kind;
  if (outputs.includes('text')) return 'chat';
  // Names are only a suggestion. The import dialog always allows correction.
  const id = model.id.toLowerCase();
  if (/tts|whisper|speech|audio/.test(id)) return 'audio';
  if (/video|seedance|sora|veo|kling|wan[-_\d]/.test(id)) return 'video';
  if (/image|dall-e|flux|stable-diffusion|seedream/.test(id)) return 'image';
  return 'chat';
}

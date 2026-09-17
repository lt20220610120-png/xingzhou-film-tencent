import {parseArtAnalysis, buildAssetRows} from './collabStore.js';
import {episodeNumbersInText, chineseEpisodeNumber, listCollabEpisodes} from './collabEpisodes.js';
import {validateArtOutput} from './artAnalysisRunner.js';

const categories = ['character','scene','prop'];
const labels = {character:'人物',scene:'场景',prop:'道具'};
const assetKey = row => `${row.category}\u0000${row.name}`;
const fail = message => { throw new Error(message); };

// A model may restart one response midway through an item. Recover only the last
// complete same-episode block; separate paid chunks are still merged, not dropped.
function savedEntries(output, number, warnings = []) {
  const source = String(output || '').replace(/\r\n?/g,'\n')
    .replace(/(#{1,6}[ \t]*第\s*[\d零〇一二两三四五六七八九十百千]+\s*集)/g,'\n$1');
  const numbers = episodeNumbersInText(source);
  if (numbers.length !== 1 || numbers[0] !== number) fail(`第 ${number} 集保存结果存在串集内容，未自动同步`);
  const heads = [...source.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(?:第\s*([\d零〇一二两三四五六七八九十百千]+)\s*集|(?:Episode|EP)\s*(\d+))[^\n]*$/gim)];
  if (!heads.length || heads.some(h => chineseEpisodeNumber(h[1] || h[2]) !== number)) fail(`第 ${number} 集保存结果缺少完整集头`);
  const block = source.slice(heads.at(-1).index).trim().replace(/^```(?:markdown|text)?\s*$|^```\s*$/gm,'');
  const found = [...block.matchAll(/^(?:#{1,6}\s*)?(人物|场景|道具)[：:]\s*$/gm)].map(m=>m[1]);
  if (found.length !== 3 || new Set(found).size !== 3) fail(`第 ${number} 集保存结果的三类清单不完整，原文已保留`);
  // Reject hidden unit headings rather than using projection to erase them.
  if (/^[ \t]*(?:#{1,6}|[-*•>]|\d+[.)])?\s*第\s*[^\n]*[章幕部回节]/m.test(block)) fail(`第 ${number} 集保存结果存在串集单元，未自动同步`);
  if (heads.length > 1) warnings.push(`第 ${number} 集模型在同一输出内重复开头，已采用最后一份完整清单；原始输出全部保留`);
  const parsed = parseArtAnalysis(block).episodes;
  if (parsed.length !== 1 || parsed[0].episode !== number) fail(`第 ${number} 集保存结果无法完整解析`);
  return categories.flatMap(category => (parsed[0][category] || []).map(entry => ({...entry,category})));
}

export function buildSavedArtPublication({ledger, episode, existingAssets = [], project = {}}) {
  const number = Number(episode.episodeNumber), record = ledger?.episodes?.[number];
  if (!record || !record.outputs?.length || record.outputs.length !== record.chunks?.length || record.outputs.some(x=>!x)) fail(`第 ${number} 集本地分析尚未完整，未调用模型`);
  const warnings = [], entries = record.outputs.flatMap(output=>savedEntries(output,number,warnings));
  const descriptions = new Map();
  const remember = rows => rows.filter(row=>!row.reuseOf && row.generatable !== false && row.description?.trim()).forEach(row=>descriptions.set(assetKey(row),row.description));
  // Earlier data can provide an exact-name description, never a guessed alias or
  // a invented earlier membership. Ignore histories from a different manuscript.
  let originals = new Map();
  try { originals = new Map(listCollabEpisodes(project.episodes || []).map(e=>[e.episodeNumber,e])); } catch { /* current record remains usable */ }
  for (const [key, previous] of Object.entries(ledger.episodes || {}).sort(([a],[b])=>Number(a)-Number(b))) {
    if (Number(key) >= number || previous.chunks?.join('') !== originals.get(Number(key))?.content) continue;
    for (const output of previous.outputs || []) { try { remember(savedEntries(output,Number(key))); } catch { /* no trusted recovery candidate */ } }
  }
  for (const previous of ledger.history?.[number] || []) {
    if (previous.fingerprint !== record.fingerprint) continue;
    for (const output of previous.outputs || []) { try { remember(savedEntries(output,number)); } catch { /* retain raw history */ } }
  }
  remember(entries);
  const existing = new Map(existingAssets.map(row=>[row.name,row]));
  const outputRows = new Map();
  for (const entry of entries) {
    if (entry.generatable === false) continue;
    const old = existing.get(entry.name);
    if (old && old.category !== entry.category && !(old.category === 'character' && entry.category === 'prop')) {
      warnings.push(`第 ${number} 集 ${entry.name} 与已有资产类别冲突，待核对；其他资产继续同步`);continue;
    }
    const prior = old ? [old.first_episode,...(old.episodes || [])].map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<number) : [];
    let reuseOf = 0, description = entry.description || '';
    if (entry.reuseOf) {
      if (entry.reuseOf > number) fail(`第 ${number} 集 ${entry.name} 引用了未来集，未自动同步`);
      if (prior.length) {
        reuseOf = Math.min(...prior);description = '';
        if (reuseOf !== entry.reuseOf) warnings.push(`第 ${number} 集 ${entry.name} 的复用集号已按云端同名资产纠正为第 ${reuseOf} 集`);
      } else {
        description = descriptions.get(assetKey(entry)) || (old?.category === entry.category ? old.description : '') || '';
        if (!description.trim()) {warnings.push(`第 ${number} 集 ${entry.name} 的复用来源无同名描述可核验，待核对；原始条目保留，未猜测合并`);continue;}
        warnings.push(`第 ${number} 集 ${entry.name} 已从同名已保存描述恢复，不重新调用模型`);
      }
    }
    const next = {...entry,reuseOf,description};
    const priorEntry = outputRows.get(assetKey(next));
    if (!priorEntry || (!priorEntry.description && description)) outputRows.set(assetKey(next),next);
  }
  const serialize = rows => `### 第${number}集\n`+categories.map(category=>{
    const items=rows.filter(row=>row.category===category).map(row=>`- ${row.name}（${row.reuseOf?`复用自第${row.reuseOf}集`:'首次'}）${row.description||''}`);
    return labels[category]+'：\n'+(items.join('\n')||'- 无');
  }).join('\n');
  const projected = serialize([...outputRows.values()]);
  const assets = validateArtOutput(projected,number,episode.content || '',existingAssets);
  warnings.push(...(assets.validationWarnings || []));
  // The canonical output and submitted subset agree, while raw outputs/history
  // remain untouched on disk. Unsupported references are warnings, not data loss.
  const allowed = new Set(assets.map(assetKey));
  const output = serialize([...outputRows.values()].filter(row=>allowed.has(assetKey(row))));
  const canonicalAssets = buildAssetRows(parseArtAnalysis(output));
  return {output,assets:canonicalAssets,warnings:[...new Set(warnings)]};
}

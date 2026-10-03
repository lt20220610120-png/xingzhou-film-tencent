import { validateDirectorSegmentTiming } from './directorTiming.js';
import { directorSpeechBoundary, completeDialogueNeedsNextClip } from './directorSpeechBoundaries.js';
import { validWholeSceneCompression, effectiveDirectorDurationLimit } from './directorDurationPolicy.js';
import { isDirectorQuotedAt } from './directorDialogue.js';

/** Source offsets are UTF-16 half-open offsets in sourceText, never in the user's original draft. */
export const NONFINAL_DURATION_RATIO = 0.85;
const MARKER = /^[\t ]*[（(]\d+[）)][\t ]*$/;
const HEADER = /^[\t ]*(?:场景\s*)?\d+\s*[-—－]\s*\d+(?!\d)(?!\s*[-—－]\s*\d)/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const meaningfulState = value => (typeof value === 'string' && Boolean(value.trim())) || (object(value) && Object.keys(value).length > 0);
const issue = (code, message, segmentIndex, evidence) => ({ code, message, ...(segmentIndex ? { segmentIndex } : {}), ...(evidence !== undefined ? { evidence } : {}) });

export const assertDurationLimit = effectiveDirectorDurationLimit;

export const parseStructuredJson = output => {
  if (object(output)) return output;
  if (typeof output !== 'string') throw new Error('模型必须返回完整 JSON 对象');
  let text = output.replace(/^\uFEFF/, '').trim();
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  if (fenced) text = fenced[1].trim();
  const result = JSON.parse(text);
  if (!object(result)) throw new Error('模型必须返回完整 JSON 对象');
  return result;
};

export const buildSceneSourceTape = inputText => {
  const sourceSnapshot = String(inputText ?? '');
  const originalOffset = sourceSnapshot.startsWith('\uFEFF') ? 1 : 0;
  const normalized = sourceSnapshot.slice(originalOffset).replace(/\r\n?/g, '\n');
  // One original offset for every normalized UTF-16 code unit; CRLF is one canonical newline.
  const offsets = [];
  for (let cursor = originalOffset; cursor < sourceSnapshot.length; cursor += 1) {
    offsets.push(cursor);
    if (sourceSnapshot[cursor] === '\r' && sourceSnapshot[cursor + 1] === '\n') cursor += 1;
  }
  offsets.push(sourceSnapshot.length);
  let sceneHeader = '';
  const kept = [];
  const removed = [];
  let cursor = 0;
  let firstContentSeen = false;
  for (const raw of normalized.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!raw) continue;
    const line = raw.replace(/\n$/, '');
    const row = { originalStart: offsets[cursor], originalEnd: offsets[cursor + raw.length] };
    if (MARKER.test(line)) removed.push({ ...row, kind: 'marker' });
    else if (/^[\t ]*(?:<!--|-->)[\t ]*$/u.test(line) && !isDirectorQuotedAt(normalized, cursor)) removed.push({ ...row, kind: 'format-marker' });
    else if (!firstContentSeen && HEADER.test(line)) {
      // Rich-text imports can collapse the heading, cast and performances
      // onto one line. Only remove the heading prefix, never the whole scene.
      const bodyStart = line.search(/(?:出场人物|出场角色|人物|角色|人)[\t ]*[：:]|[△Δ▲]/u);
      const headerEnd = bodyStart >= 0 ? bodyStart : raw.length;
      sceneHeader = line.slice(0, headerEnd).trim();
      removed.push({ originalStart: row.originalStart, originalEnd: offsets[cursor + headerEnd], kind: 'header' });
      if (bodyStart >= 0) kept.push({ raw: raw.slice(bodyStart), normalizedStart: cursor + bodyStart, originalStart: offsets[cursor + bodyStart], originalEnd: row.originalEnd });
      firstContentSeen = true;
    } else {
      kept.push({ raw, normalizedStart: cursor, ...row });
      if (line.trim()) firstContentSeen = true;
    }
    cursor += raw.length;
  }
  const body = kept.map(row => row.raw).join('');
  const leading = body.match(/^(?:[\t ]*\n)+/)?.[0].length || 0;
  const trailing = body.match(/(?:\n[\t ]*)+$/)?.[0].length || 0;
  const sourceText = body.slice(leading, Math.max(leading, body.length - trailing));
  const sourceMap = [...removed];
  let bodyOffset = 0;
  for (const row of kept) {
    const start = Math.max(bodyOffset, leading);
    const end = Math.min(bodyOffset + row.raw.length, body.length - trailing);
    if (end > start) sourceMap.push({
      kind: 'text', sourceStart: start - leading, sourceEnd: end - leading,
      originalStart: offsets[row.normalizedStart + start - bodyOffset], originalEnd: offsets[row.normalizedStart + end - bodyOffset],
    });
    bodyOffset += row.raw.length;
  }
  const units = [];
  let position = 0;
  // Paragraph/line units keep punctuation and speaker labels intact. Long units can use precise prefixes.
  for (const text of sourceText.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!text) continue;
    units.push({ id: `u${units.length + 1}`, start: position, end: position + text.length, text });
    position += text.length;
  }
  return { sourceSnapshot, sourceText, sceneHeader, units, sourceMap };
};

const legalBoundaries = text => {
  const graphemes = new Set([0, text.length]);
  const words = new Set([0, text.length]);
  for (const part of new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)) graphemes.add(part.index + part.segment.length);
  for (const part of new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)) {
    words.add(part.index); words.add(part.index + part.segment.length);
  }
  return offset => graphemes.has(offset) && words.has(offset);
};

export const estimateSegmentSeconds = timing => {
  if (!object(timing)) throw new Error('缺少时长分解');
  const names = ['speechSeconds', 'actionSeconds', 'overlapSeconds', 'transitionSeconds'];
  if (names.some(name => typeof timing[name] !== 'number' || !Number.isFinite(timing[name]) || timing[name] < 0)) throw new Error('时长分解必须是非负有限数值');
  if (timing.overlapSeconds > Math.min(timing.speechSeconds, timing.actionSeconds)) throw new Error('重叠时长不能超过对白和动作中的较小值');
  // Add the decimal values supplied by JSON exactly before converting back to
  // Number. Binary 26.4 + 6.4 - 2.8 otherwise falsely exceeds a 30-second limit.
  // This does not introduce an epsilon or clip genuinely over-limit estimates.
  const decimals = names.map(name => {
    const [coefficient, exponent = '0'] = String(timing[name]).split('e');
    const [integer, fraction = ''] = coefficient.split('.');
    return { coefficient: BigInt(integer + fraction), exponent: Number(exponent) - fraction.length };
  });
  const exponent = Math.min(...decimals.map(value => value.exponent));
  const sum = decimals.reduce((result, value, index) => result + (index === 2 ? -1n : 1n) * value.coefficient * 10n ** BigInt(value.exponent - exponent), 0n);
  const total = Number(`${sum}e${exponent}`);
  if (!(total > 0) || !Number.isFinite(total)) throw new Error('片段估计时长必须大于零');
  return total;
};

export const validateScenePlan = (candidate, { tape, maxDurationSeconds, groundedTiming = false } = {}) => {
  const issues = [];
  let durationLimit;
  try { durationLimit = assertDurationLimit(maxDurationSeconds); } catch (error) { return { ok: false, issues: [issue('INVALID_DURATION_LIMIT', error.message)] }; }
  let parsed;
  try { parsed = parseStructuredJson(candidate); } catch (error) { return { ok: false, issues: [issue('INVALID_JSON', `分段计划 JSON 无效：${error.message}`)] }; }
  if (!tape?.sourceText || !Array.isArray(tape.units) || !tape.units.length) return { ok: false, issues: [issue('EMPTY_SOURCE', '当前场景没有可分段正文')] };
  if (object(parsed.capacityIssue) && typeof parsed.capacityIssue.message === 'string' && parsed.capacityIssue.message.trim() && typeof parsed.capacityIssue.sourceQuote === 'string' && parsed.capacityIssue.sourceQuote.trim() && tape.sourceText.includes(parsed.capacityIssue.sourceQuote)) return { ok: false, issues: [issue('CAPACITY_LIMIT', parsed.capacityIssue.message, undefined, parsed.capacityIssue.sourceQuote)] };
  if (!Array.isArray(parsed.segments) || !parsed.segments.length) return { ok: false, issues: [issue('INVALID_PLAN_SCHEMA', '分段计划必须含非空 segments 数组')] };
  const units = new Map(tape.units.map(unit => [unit.id, unit]));
  const isLegal = legalBoundaries(tape.sourceText);
  const segments = [];
  let sourceStart = 0;
  parsed.segments.forEach((segment, arrayIndex) => {
    const segmentIndex = arrayIndex + 1;
    if (!object(segment) || !object(segment.end)) { issues.push(issue('INVALID_ANCHOR', '片段缺少结束锚点', segmentIndex)); return; }
    const unit = units.get(segment.end.unitId);
    if (!unit) { issues.push(issue('INVALID_ANCHOR', '结束锚点引用未知原文单元', segmentIndex, segment.end)); return; }
    let sourceEnd = unit.end;
    if (segment.end.prefix !== undefined) {
      const prefix = segment.end.prefix;
      if (typeof prefix !== 'string' || !prefix.length || !unit.text.startsWith(prefix)) { issues.push(issue('INVALID_ANCHOR', '锚点 prefix 必须逐字等于该原文单元的真实非空前缀', segmentIndex, segment.end)); return; }
      sourceEnd = unit.start + prefix.length;
    }
    if (sourceEnd <= sourceStart) issues.push(issue('ANCHOR_ORDER', '片段结束锚点必须严格递增，不能产生重复或空段', segmentIndex, segment.end));
    if (!isLegal(sourceEnd)) issues.push(issue('INVALID_BOUNDARY', '不能在 Unicode 字符或词语内部切分', segmentIndex, segment.end));
    const speechBoundary = directorSpeechBoundary({ sourceText: tape.sourceText, sourceEnd, maxDurationSeconds: durationLimit });
    if (!speechBoundary.ok) issues.push(issue('INCOMPLETE_DIALOGUE_BOUNDARY', '短的单次讲话必须整句留在同一条；仅超出单条上限的长讲话可在完整句号、问号或叹号后切分，不能截断半句话', segmentIndex, { ...speechBoundary, sourceEnd }));
    if (sourceEnd > sourceStart && !tape.sourceText.slice(sourceStart, sourceEnd).replace(/[\s\p{P}]/gu, '')) issues.push(issue('EMPTY_SEGMENT', '片段不能只有空白或标点，必须保留可表演的原文内容', segmentIndex));
    let estimatedSeconds;
    try { estimatedSeconds = estimateSegmentSeconds(segment.timing); } catch (error) { issues.push(issue('INVALID_TIMING', error.message, segmentIndex, segment.timing)); }
    const compressed = validWholeSceneCompression({ ...segment, sourceStart, sourceEnd }, { naturalEstimatedSeconds: estimatedSeconds, maxDurationSeconds, sourceLength: tape.sourceText.length, segmentCount: parsed.segments.length });
    const compression = compressed ? segment.durationCompression : null;
    if ((segment.durationCompression || segment.naturalEstimatedSeconds !== undefined) && !compressed) issues.push(issue('INVALID_DURATION_COMPRESSION', '整场压缩仅适用于30秒上限、自然估时超过30且不超过35秒、完整单场景一条结果；自然分解与标记必须一致', segmentIndex));
    const grounded = groundedTiming && sourceEnd > sourceStart ? validateDirectorSegmentTiming({ sourceText: tape.sourceText, sourceStart, sourceEnd, timing: segment.timing, maxDurationSeconds, segmentIndex, wholeSceneCompression: Boolean(compression) }) : null;
    if (grounded) issues.push(...grounded.issues);
    const naturalEstimatedSeconds = estimatedSeconds;
    if (compression) estimatedSeconds = 30;
    const recommendedDurationSeconds = Math.ceil(estimatedSeconds);
    if (estimatedSeconds > durationLimit || recommendedDurationSeconds > durationLimit) issues.push(issue('DURATION_EXCEEDED', '片段超出最高时长，必须重分段而非截短建议秒数', segmentIndex, { estimatedSeconds, maxDurationSeconds: durationLimit }));
    const completeDialoguePriority = arrayIndex !== parsed.segments.length - 1 && estimatedSeconds < Math.ceil(NONFINAL_DURATION_RATIO * durationLimit)
      && completeDialogueNeedsNextClip({ sourceText: tape.sourceText, sourceEnd, estimatedSeconds, maxDurationSeconds: durationLimit });
    if (arrayIndex !== parsed.segments.length - 1 && estimatedSeconds < Math.ceil(NONFINAL_DURATION_RATIO * durationLimit) && !completeDialoguePriority) issues.push(issue('UNDERFILLED_SEGMENT', '非尾段过短，应在接近最高时长的窗口内切分；完整台词优先，不能为凑满截断一句话', segmentIndex, { estimatedSeconds, minimumSeconds: Math.ceil(NONFINAL_DURATION_RATIO * durationLimit) }));
    if (!meaningfulState(segment.startState) || !meaningfulState(segment.endState)) issues.push(issue('INVALID_SEGMENT_STATE', '每段必须提供非空的起点与终点状态', segmentIndex));
    if (!meaningfulState(segment.boundary) || !Array.isArray(segment.visualNotes)) issues.push(issue('INVALID_SEGMENT_SCHEMA', '每段必须提供非空 boundary 和 visualNotes 数组', segmentIndex));
    segments.push({
      id: typeof segment.id === 'string' && segment.id ? segment.id : `segment-${segmentIndex}`, index: segmentIndex,
      sourceStart, sourceEnd, estimatedSeconds, recommendedDurationSeconds,
      ...(compression ? { naturalEstimatedSeconds, durationCompression: compression } : {}),
      ...(completeDialoguePriority ? { completeDialoguePriority: true } : {}),
      timing: segment.timing, startState: segment.startState, endState: segment.endState, boundary: segment.boundary, visualNotes: segment.visualNotes,
      ...(grounded ? { timingFacts: grounded.facts } : {}),
    });
    sourceStart = sourceEnd;
  });
  if (sourceStart !== tape.sourceText.length) issues.push(issue('UNCOVERED_SOURCE', '终段必须到达全部正文末尾，不能遗漏原文', undefined, { coveredEnd: sourceStart, sourceLength: tape.sourceText.length }));
  if (new Set(segments.map(segment => segment.id)).size !== segments.length) issues.push(issue('DUPLICATE_SEGMENT_ID', '片段 ID 必须唯一'));
  if (issues.length) return { ok: false, issues };
  return { ok: true, issues: [], plan: { version: 1, sourceSnapshot: tape.sourceSnapshot, sourceText: tape.sourceText, sceneHeader: tape.sceneHeader, maxDurationSeconds, segments } };
};

export const renderNumberedScene = (plan, tape) => {
  if (!Array.isArray(plan?.segments) || typeof tape?.sourceText !== 'string') throw new Error('没有可展示的已验证分段计划');
  let cursor = 0;
  const parts = plan.segments.map((segment, index) => {
    if (segment.sourceStart !== cursor || !Number.isInteger(segment.sourceEnd) || segment.sourceEnd <= cursor || segment.sourceEnd > tape.sourceText.length) throw new Error('分段范围无效，不能展示为完整分段稿');
    cursor = segment.sourceEnd;
    return `（${index + 1}）\n${tape.sourceText.slice(segment.sourceStart, segment.sourceEnd).trim()}`;
  });
  if (cursor !== tape.sourceText.length) throw new Error('分段稿未覆盖完整原文');
  return [tape.sceneHeader, ...parts].filter(Boolean).join('\n\n');
};

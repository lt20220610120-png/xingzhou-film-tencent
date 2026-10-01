import { parseStructuredJson } from './directorSegmentation.js';

const SECTIONS = ['基础设定', '整体视听', '连续台词', '画面内容', '人物起止与运动轨迹'];
const SHOT_FIELDS = ['景别', '机位', '运镜', '表演与动作', '光影', '声音'];
const ID = /^(?:#{1,6}\s*)?(?:\*\*|__)?(\d+-\d+-\d+)(?:\*\*|__)?\s*$/;
const BRACKET = /^[（(](\d+)[）)]\s*(.*)$/;
const compact = text => String(text ?? '').replace(/\s+/gu, '');
const issue = (code, message, evidence) => ({ code, message, ...(evidence !== undefined ? { evidence } : {}) });
const values = (text, label) => [...text.matchAll(new RegExp(`^${label}[\\t ]*[：:][\\t ]*([^\\n]*)`, 'gm'))].map(match => match[1].trim());
const trimQuotes = text => String(text ?? '').trim().replace(/^[“”"『「]/u, '').replace(/[“”"』」]$/u, '');
const insideQuoted = (text, end) => {
  const pairs = { '“': '”', '『': '』', '「': '」', '‘': '’' };
  const stack = [];
  for (const character of text.slice(0, end)) {
    if (pairs[character]) stack.push(pairs[character]);
    else if (character === stack.at(-1)) stack.pop();
    else if (character === '"') stack.at(-1) === '"' ? stack.pop() : stack.push('"');
  }
  return stack.length > 0;
};

export const identifyPromptContract = skill => {
  const documents = [String(skill?.content || ''), ...(skill?.files || []).map(file => String(file?.content || ''))].join('\n');
  const structural = SECTIONS.every(section => documents.includes(`【${section}】`)) && SHOT_FIELDS.every(field => new RegExp(`${field}[：:]`).test(documents));
  return structural && /光影基调/.test(documents) && /D\s*0?1/.test(documents) && /(?:同场|整场)/.test(documents) && /(?:逐字|复用)/.test(documents) ? 'fast-v8' : 'generic';
};

const sourceDialogues = source => {
  const text = typeof source === 'string' ? source : String(source?.text || '');
  const rows = [];
  const ignored = new Set(['场景', '人物', '道具', '音效', '特写', '时间', '镜头', '动作', '画面', '说明', '景', '内景', '外景', '运镜', '光影', '声音']);
  for (const line of text.split('\n')) {
    const pattern = /([\p{Script=Han}\p{L}][\p{Script=Han}\p{L}\p{N}·]{0,15})(?:\s*[（(]([^）)\n]*)[）)])?\s*[：:]/gu;
    const possible = [...line.matchAll(pattern)].filter(match => !ignored.has(match[1]) && !/^\s*[△Δ]\s*$/u.test(line.slice(0, match.index)) && !insideQuoted(line, match.index));
    // A colon inside a speaker's prose ("答案：…") is not another actor declaration.
    // Additional inline speakers are recognized only after a completed utterance.
    const matches = possible.filter((match, index) => index === 0 || /[。！？!?][\t ]*$/.test(line.slice(0, match.index)));
    matches.forEach((match, index) => {
      const speech = trimQuotes(line.slice(match.index + match[0].length, matches[index + 1]?.index ?? line.length));
      if (!speech) return;
      const directions = match[2] || '';
      const mode = /(?:V\.?O\.?|内心)/i.test(directions) ? '内心VO' : /场外/.test(directions) ? '场外声音' : null;
      rows.push({ speaker: match[1], speech, mode });
    });
  }
  return rows;
};

const checkFastContract = (body, source, sharedBaseline, issues) => {
  const headings = [...body.matchAll(/^【([^】]+)】\s*$/gm)];
  if (headings.length !== SECTIONS.length || headings.some((heading, index) => heading[1] !== SECTIONS[index])) {
    issues.push(issue('INVALID_PROMPT_SECTIONS', '提示词必须依次包含原 Skill 的五个区块', headings.map(heading => heading[1])));
    return { baseline: undefined, dialogue: 'semantic-audit' };
  }
  if (headings[0].index !== 0) issues.push(issue('UNEXPECTED_PROMPT_PREFACE', '基础设定之前存在分析或其他非合同正文'));
  const blocks = Object.fromEntries(headings.map((heading, index) => [heading[1], body.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? body.length).trim()]));
  const requireFields = (block, fields, where) => fields.forEach(field => {
    const found = values(block, field);
    if (found.length !== 1 || !found[0]) issues.push(issue('INVALID_PROMPT_FIELD', `${where}的${field}必须恰好有一个非空字段`));
  });
  requireFields(blocks.基础设定, ['人物', '场景', '道具', '音色', '限制'], '基础设定');
  if (!compact(blocks.基础设定).includes('禁止字幕、水印、Logo和无意义UI；无需背景音乐。')) issues.push(issue('MISSING_GENERATION_LIMITS', '缺少原 Skill 的固定生成限制'));
  requireFields(blocks.整体视听, ['画幅与风格', '光影基调', '节奏与环境声'], '整体视听');
  const baseline = values(blocks.整体视听, '光影基调')[0];
  if (sharedBaseline && compact(sharedBaseline) !== compact(baseline)) issues.push(issue('BASELINE_CHANGED', '同场光影基调必须原样复用，剧情光源变化另写事件', { expected: sharedBaseline, received: baseline }));
  const numerical = [
    ['镜组焦距', /\d+(?:\.\d+)?mm/i], ['T值', /T\d+(?:\.\d+)?/i], ['帧率', /\d+(?:\.\d+)?fps/i],
    ['快门角', /采样[=：:][^；;]*\d+(?:\.\d+)?°/], ['EI', /EI\d+/i], ['白平衡', /WB[=：:]\d+(?:\.\d+)?K/i],
    ['主光色温', /主光[=：:][^；;]*\d+(?:\.\d+)?K/i], ['主光方位', /方位[角=：:]*[+-]?\d+(?:\.\d+)?°/], ['主光仰角', /仰角[=：:]*[+-]?\d+(?:\.\d+)?°/],
    ['主补照度比', /K:F[=：:]\d+(?:\.\d+)?:\d+(?:\.\d+)?/i], ['显示参考', /(?:Rec\.?709|Rec\.?2020|P3|sRGB|PQ|HLG)/i], ['影调数值', /\d+(?:\.\d+)?IRE/i],
  ];
  for (const [name, pattern] of numerical) if (!pattern.test(compact(baseline))) issues.push(issue('INCOMPLETE_LIGHTING_BASELINE', `光影基调缺少${name}`));
  for (const field of ['影像基准', '镜组', '补光', '影调']) if (!new RegExp(`${field}[=：:][^；;]+`).test(compact(baseline))) issues.push(issue('INCOMPLETE_LIGHTING_BASELINE', `光影基调缺少${field}`));

  const shots = [...blocks.画面内容.matchAll(/^分镜\s*(\d+)\s*[｜|]\s*比重\s*约?\s*(\d+(?:\.\d+)?)\s*%[^\n]*$/gm)];
  if (!shots.length || shots.some((shot, index) => Number(shot[1]) !== index + 1)) issues.push(issue('INVALID_SHOT_SEQUENCE', '分镜应从01连续递增，且每镜有明确比重'));
  if (Math.abs(shots.reduce((sum, shot) => sum + Number(shot[2]), 0) - 100) > 0.1) issues.push(issue('INVALID_SHOT_WEIGHTS', '分镜比重合计必须为100%'));
  const shotBodies = new Map();
  const cameraLabels = new Set(['正面拍摄', '侧方拍摄', '侧前方拍摄', '侧后方拍摄', '背面拍摄', '平视拍摄', '俯视拍摄', '仰视拍摄', '高机位拍摄', '低机位拍摄', '顶视拍摄', '主观视角拍摄']);
  shots.forEach((shot, index) => {
    const shotBody = blocks.画面内容.slice(shot.index + shot[0].length, shots[index + 1]?.index ?? blocks.画面内容.length).trim();
    shotBodies.set(Number(shot[1]), shotBody);
    requireFields(shotBody, SHOT_FIELDS, `分镜${shot[1]}`);
    const allFieldRows = [...shotBody.matchAll(/^(景别|机位|运镜|表演与动作|光影|声音)[\t ]*[：:]/gm)].map(row => row[1]);
    if (allFieldRows.length !== SHOT_FIELDS.length || allFieldRows.some((field, fieldIndex) => field !== SHOT_FIELDS[fieldIndex])) issues.push(issue('INVALID_SHOT_FIELDS', `分镜${shot[1]}须按原合同填写六行字段`));
    const camera = shotBody.match(/^机位[\t ]*[：:][\t ]*([\s\S]*?)(?=^(?:景别|机位|运镜|表演与动作|光影|声音)[\t ]*[：:]|(?![\s\S]))/m)?.[1]?.trim();
    if (camera && !cameraLabels.has(camera.replace(/[。.]+$/, '')) && !/^[\p{Script=Han}]{1,6}(?:拍摄|机位|视角)[。.]?$/u.test(camera)) issues.push(issue('INVALID_CAMERA_LABEL', `分镜${shot[1]}的机位须是简短拍摄短语，不附动作/架机位置/构图目的`));
    const light = values(shotBody, '光影')[0];
    if (/^(?:同上|继承整体(?:基调)?|光线不变|保持(?:一致|不变)|自然光|电影级光影)[。.!！]*$/.test(light || '')) issues.push(issue('MISSING_SHOT_LIGHTING', `分镜${shot[1]}缺少本镜主体的实际受光`));
  });

  const declarations = [];
  for (const line of blocks.连续台词.split('\n').filter(line => line.trim())) {
    if (line.trim() === '无') continue;
    const dialogue = line.match(/^D\s*(\d+)\s*[｜|]\s*([^｜|]+)\s*[｜|]\s*([^｜|]+)\s*[｜|]([\s\S]*?)『([\s\S]+)』\s*$/);
    if (!dialogue) { issues.push(issue('INVALID_DIALOGUE_DECLARATION', '连续台词须逐条使用 D 编号、说话人、声源、镜号和『原话』', line)); continue; }
    const number = Number(dialogue[1]);
    const refs = [...dialogue[4].matchAll(/分镜\s*(\d+)/g)].map(match => Number(match[1]));
    declarations.push({ number, speaker: dialogue[2].trim(), mode: dialogue[3].trim(), speech: dialogue[5], refs });
    if (!refs.length || refs.some(ref => !shotBodies.has(ref))) issues.push(issue('INVALID_DIALOGUE_SHOT_REFERENCE', `D${dialogue[1]}引用缺失或无效镜号`));
    if (refs.length && refs.every(ref => shotBodies.has(ref))) {
      for (let ref = Math.min(...refs); ref <= Math.max(...refs); ref += 1) {
        if (!new RegExp(`(?<![A-Za-z0-9])D\\s*0*${number}(?!\\d)`).test(values(shotBodies.get(ref) || '', '声音').join(' '))) issues.push(issue('MISSING_DIALOGUE_CONTINUATION', `分镜${ref}声音行未说明 D${dialogue[1]} 的继续/结束`));
      }
    }
  }
  if (!declarations.length && blocks.连续台词.trim() !== '无') issues.push(issue('INVALID_DIALOGUE_DECLARATION', '没有台词须明确写无'));
  if (declarations.some((dialogue, index) => dialogue.number !== index + 1)) issues.push(issue('INVALID_DIALOGUE_SEQUENCE', 'D编号应从01连续递增，不能重复声明'));
  const declaredNumbers = new Set(declarations.map(dialogue => dialogue.number));
  for (const [shot, shotBody] of shotBodies) {
    for (const match of shotBody.matchAll(/(?<![A-Za-z0-9])D\s*(\d+)(?!\d)/g)) if (!declaredNumbers.has(Number(match[1]))) issues.push(issue('UNDECLARED_DIALOGUE', `分镜${shot}引用了未声明台词 D${match[1]}`));
  }
  const originalDialogues = sourceDialogues(source);
  // A source range can start in the middle of a long speech and omit the speaker label.
  // Even then every emitted literal must occur once, in order, inside THIS range.
  const sourceLiteral = compact(typeof source === 'string' ? source : source?.text || '');
  let dialogueCursor = 0;
  for (const declaration of declarations) {
    const literal = compact(declaration.speech);
    const found = sourceLiteral.indexOf(literal, dialogueCursor);
    if (found < 0) issues.push(issue('DIALOGUE_OUTSIDE_SOURCE', '生成台词不属于当前原文范围，可能补全/重复了相邻段的原话', declaration.speech));
    else dialogueCursor = found + literal.length;
  }
  if (originalDialogues.length) {
    if (compact(originalDialogues.map(dialogue => dialogue.speech).join('')) !== compact(declarations.map(dialogue => dialogue.speech).join(''))) issues.push(issue('DIALOGUE_TEXT_CHANGED', '连续台词未按原字顺序完整出现一次，存在改字/缺漏/重复', { expected: originalDialogues.map(dialogue => dialogue.speech), actual: declarations.map(dialogue => dialogue.speech) }));
    // Compare assignment character by character, allowing one speaker's contiguous speech to use multiple D rows.
    const assigned = rows => rows.flatMap(row => [...compact(row.speech)].map(character => ({ character, speaker: compact(row.speaker), mode: row.mode })));
    const original = assigned(originalDialogues);
    const generated = assigned(declarations);
    if (original.length === generated.length && original.every((row, index) => row.character === generated[index].character)) {
      if (original.some((row, index) => row.speaker !== generated[index].speaker)) issues.push(issue('DIALOGUE_SPEAKER_CHANGED', '原台词被分配给了其他人物'));
      if (original.some((row, index) => row.mode && compact(row.mode) !== compact(generated[index].mode))) issues.push(issue('DIALOGUE_MODE_CHANGED', '明确的原文内心声/场外声方式被改变'));
    }
  }
  if (!/^.+[：:].*→.*→.+$/m.test(blocks.人物起止与运动轨迹)) issues.push(issue('MISSING_CHARACTER_TRAJECTORY', '人物轨迹缺少起点→过程→终点'));
  return { baseline, dialogue: originalDialogues.length ? 'source-text-and-speaker' : 'semantic-audit' };
};

export const validateGeneratedSegment = ({ output, expectedLabel, source = '', contract = 'generic', sharedBaseline }) => {
  const issues = [];
  if (typeof output !== 'string' || !output.trim()) return { ok: false, baseline: undefined, issues: [issue('EMPTY_PROMPT_OUTPUT', '模型没有返回完整提示词正文')] };
  let content = output.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const fence = content.match(/^```(?:text|markdown)?\s*\n([\s\S]*?)\n```$/i);
  if (fence) content = fence[1].trim();
  const lines = content.split('\n');
  const markers = lines.map((line, index) => ({ index, id: line.trim().match(ID), bracket: line.trim().match(BRACKET) })).filter(row => row.id || row.bracket);
  if (markers.length !== 1) issues.push(issue('INVALID_PROMPT_COUNT', `当前请求须返回恰好一条有编号的提示词，实际检测到 ${markers.length} 条`));
  const marker = markers[0];
  if (marker && marker.index !== 0) issues.push(issue('UNEXPECTED_PROMPT_PREFACE', '提示词编号之前存在分析或其他非结果文字'));
  if (marker) {
    const actual = marker.id?.[1];
    const oldIndex = marker.bracket?.[1];
    if (actual ? actual !== expectedLabel : oldIndex !== String(expectedLabel).split('-').at(-1)) issues.push(issue('WRONG_PROMPT_LABEL', '返回的集-场-条编号与当前提交范围不一致', { expectedLabel, actual: actual || oldIndex }));
  }
  const body = marker ? [marker.bracket?.[2] || '', ...lines.slice(marker.index + 1)].join('\n').trim() : '';
  if (!body) issues.push(issue('EMPTY_PROMPT_BODY', '编号后没有提示词正文'));
  if (/^(?:分析|思考|推理|结论|分析过程|思考过程|生成说明|解释)[：:]/m.test(body)) issues.push(issue('ANALYSIS_IN_PROMPT', '模型返回了分析或解释，未按提示词合同完整输出'));
  const checked = contract === 'fast-v8' && body ? checkFastContract(body, source, sharedBaseline, issues) : { baseline: values(body, '光影基调')[0], dialogue: 'semantic-audit' };
  if (contract !== 'fast-v8' && sharedBaseline && checked.baseline && compact(sharedBaseline) !== compact(checked.baseline)) issues.push(issue('BASELINE_CHANGED', '同场已提供的光影基准被改变'));
  const capabilities = { structural: contract === 'fast-v8' ? 'fast-v8' : 'numbered-only', dialogue: checked.dialogue };
  return { ok: !issues.length, ...(!issues.length ? { prompt: { label: expectedLabel, content } } : {}), baseline: checked.baseline, issues, capabilities };
};

export const parseSceneAudit = (output, { plan, range } = {}) => {
  const invalid = (message, evidence) => ({ ok: false, issues: [issue('INVALID_AUDIT_OUTPUT', message, evidence)] });
  let audit;
  try { audit = parseStructuredJson(output); } catch (error) { return invalid(`核对结果不是完整 JSON：${error.message}`); }
  if (typeof audit.ok !== 'boolean' || !Array.isArray(audit.issues)) return invalid('核对结果必须明确提供 ok 布尔值及 issues 数组');
  if (audit.ok !== (audit.issues.length === 0)) return invalid('核对结论与问题清单不一致');
  if (!Array.isArray(plan?.segments) || typeof plan?.sourceText !== 'string') return invalid('缺少可验证的原文分段计划');
  const permitted = new Set(range || plan.segments.map((segment, index) => segment.index || index + 1));
  if (!permitted.size || [...permitted].some(index => !Number.isInteger(index) || index < 1 || index > plan.segments.length)) return invalid('核对范围无效');
  for (const entry of audit.issues) {
    if (!entry || typeof entry !== 'object' || typeof entry.code !== 'string' || !entry.code.trim() || typeof entry.message !== 'string' || !entry.message.trim() || !Number.isInteger(entry.segmentIndex) || !permitted.has(entry.segmentIndex)) return invalid('核对问题缺少明确问题码/说明，或引用了范围外片段', entry);
    const indices = entry.segmentIndexes || [entry.segmentIndex];
    if (!Array.isArray(indices) || !indices.length || indices.some(index => !Number.isInteger(index) || !permitted.has(index)) || !indices.includes(entry.segmentIndex)) return invalid('核对问题的依赖片段引用无效', entry);
    const evidence = typeof entry.evidence === 'string' ? entry.evidence : entry.evidence?.sourceQuote;
    if (typeof evidence !== 'string' || !evidence.trim() || !indices.some(index => {
      const segment = plan.segments[index - 1];
      return plan.sourceText.slice(segment.sourceStart, segment.sourceEnd).includes(evidence);
    })) return invalid('核对问题未提供来自所引用片段的逐字原文证据', entry);
  }
  return { ok: audit.ok, issues: audit.issues };
};

import { parseStructuredJson } from './directorSegmentation.js';
import { sourceDialogues, normalizeDialogueText, normalizeDialogueMode } from './directorDialogue.js';

const SECTIONS = ['基础设定', '整体视听', '连续台词', '画面内容', '人物起止与运动轨迹'];
const SHOT_FIELDS = ['景别', '机位', '运镜', '表演与动作', '光影', '声音'];
const ID = /^(?:#{1,6}\s*)?(?:\*\*|__)?(\d+-\d+-\d+)(?:\*\*|__)?\s*$/;
const BRACKET = /^[（(](\d+)[）)]\s*(.*)$/;
const compact = text => String(text ?? '').replace(/\s+/gu, '');
const issue = (code, message, evidence) => ({ code, message, ...(evidence !== undefined ? { evidence } : {}) });
const values = (text, label) => [...text.matchAll(new RegExp(`^${label}[\\t ]*[：:][\\t ]*([^\\n]*)`, 'gm'))].map(match => match[1].trim());

export const identifyPromptContract = skill => {
  const documents = [String(skill?.content || ''), ...(skill?.files || []).map(file => String(file?.content || ''))].join('\n');
  const structural = SECTIONS.every(section => documents.includes(`【${section}】`)) && SHOT_FIELDS.every(field => new RegExp(`${field}[：:]`).test(documents));
  return structural && /光影基调/.test(documents) && /D\s*0?1/.test(documents) && /(?:同场|整场)/.test(documents) && /(?:逐字|复用)/.test(documents) ? 'fast-v8' : 'generic';
};

export { sourceDialogues } from './directorDialogue.js';

const dialogueDeclarations = block => {
  const quotePairs = { '『': '』', '「': '」', '“': '”', '‘': '’', '"': '"' };
  const rows = block.split('\n');
  const chunks = [];
  const invalid = [];
  for (const line of rows) {
    if (!line.trim() || line.trim() === '无') continue;
    // A few models repeat the scene's cast list here. It is metadata, never a
    // declaration or a new utterance; only a plain list of names is tolerated.
    if (/^(?:人|人物|出场人物)[\t ]*[：:][\t ]*[\p{L}\p{N}·]+(?:[、,，][\t ]*[\p{L}\p{N}·]+)*\s*$/u.test(line.trim())) continue;
    if (/^D\s*\d+\s*[｜|]/u.test(line.trim())) chunks.push(line.trim());
    else if (chunks.length && !/^【/u.test(line.trim())) chunks[chunks.length - 1] += `\n${line}`;
    else invalid.push(line);
  }
  const declarations = [];
  for (const chunk of chunks) {
    // Split the fixed declaration columns first. The reference description may
    // itself contain Chinese quotation marks (for example “这句台词”), so a
    // single lazy regex would mistake those marks for the speech opening quote.
    const head = chunk.match(/^D\s*(\d+)\s*[｜|]\s*([^｜|]+)\s*[｜|]\s*([^｜|]+)\s*[｜|]([\s\S]*)$/u);
    if (!head) { invalid.push(chunk); continue; }
    const number = Number(head[1]);
    const speaker = head[2];
    const mode = head[3];
    const rest = head[4];
    let parsed = null;
    for (let openingIndex=0;openingIndex<rest.length&&!parsed;openingIndex++) {
      const opening=rest[openingIndex],closing=quotePairs[opening];
      if(!closing||!/[:：]\s*$/u.test(rest.slice(0,openingIndex)))continue;
      let depth=1,closingIndex=-1;
      for(let index=openingIndex+1;index<rest.length;index++){
        if(rest[index]==='\\'){index++;continue;}
        if(opening!==closing&&rest[index]===opening)depth++;
        else if(rest[index]===closing&&--depth===0){closingIndex=index;break;}
      }
      if(closingIndex<0||rest.slice(closingIndex+1).trim())continue;
      parsed={number,speaker,mode,reference:rest.slice(0,openingIndex).replace(/[：:]\s*$/u,''),opening,closing,literal:rest.slice(openingIndex,closingIndex+1)};
    }
    if (!parsed) { invalid.push(chunk); continue; }
    const closing = parsed.closing;
    const literal = parsed.literal;
    if (!literal.endsWith(closing)) { invalid.push(chunk); continue; }
    const speech = literal.slice(parsed.opening.length, -closing.length);
    if (!speech.trim()) { invalid.push(chunk); continue; }
    const refs = new Set();
    const reference = parsed.reference;
    for (const match of reference.matchAll(/分镜\s*(\d+)(?:\s*(?:[-—–~～至到])\s*(?:分镜\s*)?(\d+))?/gu)) {
      const first = Number(match[1]);
      const last = match[2] ? Number(match[2]) : first;
      if (last < first || last - first > 500) { refs.add(-1); continue; }
      for (let ref = first; ref <= last; ref += 1) refs.add(ref);
    }
    // Natural-language declarations often say “分镜01开始，跨分镜02，
    // 在分镜02结束”. The range expression above handles hyphen/至 ranges;
    // collect every explicitly named shot as well so continuation checks cover
    // the actual local shots.
    for (const match of reference.matchAll(/分镜\s*(\d+)/gu)) refs.add(Number(match[1]));
    declarations.push({ number: parsed.number, speaker: parsed.speaker.trim(), mode: parsed.mode.trim(), speech, refs: [...refs] });
  }
  return { declarations, invalid };
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

  const { declarations, invalid } = dialogueDeclarations(blocks.连续台词);
  for (const line of invalid) issues.push(issue('INVALID_DIALOGUE_DECLARATION', '连续台词须逐条使用 D 编号、说话人、声源、镜号和原话引号', line));
  for (const declaration of declarations) {
    const { number, refs } = declaration;
    if (!refs.length || refs.some(ref => !shotBodies.has(ref))) issues.push(issue('INVALID_DIALOGUE_SHOT_REFERENCE', `D${number}引用缺失或无效镜号`));
    if (refs.length && refs.every(ref => shotBodies.has(ref))) {
      for (let ref = Math.min(...refs); ref <= Math.max(...refs); ref += 1) {
        if (!new RegExp(`(?<![A-Za-z0-9])D\\s*0*${number}(?!\\d)`).test(values(shotBodies.get(ref) || '', '声音').join(' '))) issues.push(issue('MISSING_DIALOGUE_CONTINUATION', `分镜${ref}声音行未说明 D${number} 的继续/结束`));
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
  const sourceLiteral = normalizeDialogueText(typeof source === 'string' ? source : source?.text || '');
  let dialogueCursor = 0;
  for (const declaration of declarations) {
    const literal = normalizeDialogueText(declaration.speech);
    const found = sourceLiteral.indexOf(literal, dialogueCursor);
    if (found < 0) issues.push(issue('DIALOGUE_OUTSIDE_SOURCE', '生成台词不属于当前原文范围，可能补全/重复了相邻段的原话', declaration.speech));
    else dialogueCursor = found + literal.length;
  }
  if (originalDialogues.length) {
    if (originalDialogues.map(dialogue => normalizeDialogueText(dialogue.speech)).join('') !== declarations.map(dialogue => normalizeDialogueText(dialogue.speech)).join('')) issues.push(issue('DIALOGUE_TEXT_CHANGED', '连续台词未按原字顺序完整出现一次，存在改字/缺漏/重复', { expected: originalDialogues.map(dialogue => dialogue.speech), actual: declarations.map(dialogue => dialogue.speech) }));
    // Compare assignment character by character, allowing one speaker's contiguous speech to use multiple D rows.
    const assigned = rows => rows.flatMap(row => [...normalizeDialogueText(row.speech)].map(character => ({ character, speaker: compact(row.speaker), mode: normalizeDialogueMode(row.mode) })));
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

// A model can preserve every source character and actor while spelling an
// explicit OS/VO marker differently (for example “现场对白” instead of the
// source's “内心VO”). That is a deterministic formatting error, not a reason
// to spend another paid generation. Repair the marker only when the complete
// generated dialogue sequence is an exact lexical match to the source range.
export const repairGeneratedDialogueModes = ({ output, source = '' }) => {
  if (typeof output !== 'string' || !output.trim()) return output;
  const original = sourceDialogues(source);
  if (!original.length) return output;
  const sourceChars = original.flatMap(row => [...normalizeDialogueText(row.speech)].map(character => ({ character, speaker:compact(row.speaker), mode: normalizeDialogueMode(row.mode) })));
  let cursor = 0;
  const expectedModes = new Map();
  const lines = output.split('\n');
  const declarations = dialogueDeclarations(lines.filter(line => /^D\s*\d+\s*[｜|]/u.test(line.trim())).join('\n')).declarations;
  for (const declaration of declarations) {
    const chars = [...normalizeDialogueText(declaration.speech)];
    if (!chars.length || cursor + chars.length > sourceChars.length) return output;
    const slice = sourceChars.slice(cursor, cursor + chars.length);
    if (!slice.every((row, index) => row.character === chars[index]&&row.speaker===compact(declaration.speaker))) return output;
    const modes = [...new Set(slice.map(row => row.mode).filter(Boolean))];
    if (modes.length === 1 && normalizeDialogueMode(declaration.mode) !== modes[0]) expectedModes.set(declaration.number, modes[0]);
    cursor += chars.length;
  }
  if (!expectedModes.size || cursor !== sourceChars.length) return output;
  return output.replace(/^D\s*(\d+)\s*([｜|])([^｜|]*)([｜|])([^\n]*)$/gmu, (line, number, firstBar, speaker, secondBar, rest) => {
    const mode = expectedModes.get(Number(number));
    const thirdBar = rest.match(/([｜|])/u)?.[1];
    if (!mode || !thirdBar) return line;
    const reference = rest.slice(rest.indexOf(thirdBar) + 1);
    return `D${String(number).padStart(2, '0')}${firstBar}${speaker.trim()}${secondBar}${mode}${thirdBar}${reference}`;
  });
};

export const repairGeneratedDialogueContinuations = ({ output, source = '' }) => {
  if (typeof output !== 'string' || !output.trim()) return output;
  const original = sourceDialogues(source);
  if (!original.length) return output;
  const dialogueBlockStart = output.indexOf('【连续台词】');
  const pictureBlockStart = output.indexOf('【画面内容】');
  if (dialogueBlockStart < 0 || pictureBlockStart < 0 || pictureBlockStart <= dialogueBlockStart) return output;
  const dialogueBlock = output.slice(dialogueBlockStart + '【连续台词】'.length, pictureBlockStart);
  const declarations = dialogueDeclarations(dialogueBlock).declarations;
  const assigned=rows=>rows.flatMap(row=>[...normalizeDialogueText(row.speech)].map(character=>({character,speaker:compact(row.speaker)})));
  const originalChars=assigned(original),declaredChars=assigned(declarations);
  if(originalChars.length!==declaredChars.length||!originalChars.every((row,i)=>row.character===declaredChars[i].character&&row.speaker===declaredChars[i].speaker))return output;
  const pictureEnd = output.indexOf('【人物起止与运动轨迹】', pictureBlockStart);
  const pictureBlock = output.slice(pictureBlockStart, pictureEnd < 0 ? output.length : pictureEnd);
  const shots = [...pictureBlock.matchAll(/^分镜\s*(\d+)\s*[｜|][^\n]*$/gmu)].map((match, index, rows) => ({
    number: Number(match[1]), start: match.index + match[0].length, end: rows[index + 1]?.index ?? pictureBlock.length,
  }));
  const edits = [];
  for (const declaration of declarations) {
    for (let ref=Math.min(...declaration.refs);ref<=Math.max(...declaration.refs);ref++) {
      const shot = shots.find(item => item.number === ref);
      if (!shot) continue;
      const body = pictureBlock.slice(shot.start, shot.end);
      const sound = body.match(/^声音[\t ]*[：:][^\n]*$/mu);
      if (!sound || new RegExp(`(?<![A-Za-z0-9])D\\s*0*${declaration.number}(?!\\d)`).test(sound[0])) continue;
      const first=Math.min(...declaration.refs),last=Math.max(...declaration.refs);
      const marker = `；D${String(declaration.number).padStart(2, '0')}${first===last?'开始并结束':ref===first?'开始':ref===last?'继续并结束':'继续'}。`;
      const soundOffset = pictureBlockStart + shot.start + sound.index + sound[0].length;
      edits.push({ index: soundOffset, text: marker });
    }
  }
  if (!edits.length) return output;
  let repaired = output;
  for (const edit of edits.sort((a, b) => b.index - a.index)) repaired = repaired.slice(0, edit.index) + edit.text + repaired.slice(edit.index);
  return repaired;
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

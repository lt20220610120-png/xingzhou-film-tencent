// Scene dialogue is parsed once from the original source. Ranges retain UTF-16
// offsets so a segment that begins halfway through a speech keeps its speaker.
const METADATA_LABELS = new Set(['人', '人物', '角色', '出场人物', '出场角色', '场景', '道具', '音效', '特写', '时间', '镜头', '动作', '画面', '说明', '景', '内景', '外景', '运镜', '光影', '声音', '音色', '限制', '画幅与风格', '光影基调', '节奏与环境声']);
const ACTION_START = /^(?:[△Δ▲]|\d+\s*[-—]\s*\d+\s*景[：:]|(?:场景|景|人|人物|角色|出场人物|出场角色|动作|镜头|画面|特写|旁白说明)[\t ]*[：:]|[（(]\d+[）)]\s*$|[（(][^）)]+[）)]\s*$|【[^】]+】)/u;
const SPEAKER_HEADER = /([\p{L}][\p{L}\p{N}·.]{0,31}(?:[\t ]+(?:O\.?S\.?|V\.?O\.?))?(?:[\t ]*[（(][^）)\n]*[）)])*)[\t ]*[：:]/gu;
const CAST_HEADER = /^(?:人|人物|角色|出场人物|出场角色)[\t ]*[：:][\t ]*(.*)$/u;
// Colon labels inside a spoken announcement are words, not actors. This is a
// category rule rather than a list of one project's system messages; explicit
// cast entries still take precedence when a real actor has such a name.
const SPEECH_FIELD_LABEL = /(?:任务|奖励|条件|后果|结果|目标|提示|原因|说明|状态|时间|地点|属性|声望|等级|进度|数量|答案|指令|限制|建议|名称|编号|要求|内容|规则|密码|别名)$/u;
const quotePairs = new Map([['“', '”'], ['『', '』'], ['「', '」'], ['‘', '’'], ['"', '"']]);

const insideQuoted = (text, end) => {
  const stack = [];
  for (const character of text.slice(0, end)) {
    if (character === stack.at(-1)) stack.pop();
    else if (quotePairs.has(character)) stack.push(quotePairs.get(character));
  }
  return stack.length > 0;
};

export const normalizeDialogueMode = mode => {
  const text = String(mode || '').replace(/\s+/gu, '');
  if (/(?:场外|画外现场|非现场|画外声)/u.test(text)) return '场外声音';
  if (/(?:内心|心声|心理|O\.?S\.?)/iu.test(text)) return '内心VO';
  // VO describes an audible voice outside the visible performance, whereas
  // OS/explicit inner-voice annotations identify the actor's thoughts. A
  // system VO or an unseen policeman must not become somebody's inner voice.
  if (/(?:旁白|V\.?O\.?)/iu.test(text)) return '场外声音';
  if (/(?:现场对白|对白|对话|同期声)/u.test(text)) return '现场对白';
  return text || null;
};

export const normalizeDialogueText = speech => {
  let text = String(speech || '').trim();
  if (quotePairs.get(text[0]) === text.at(-1)) text = text.slice(1, -1);
  // Typography may change during formatting; lexical content and delivery marks
  // (question, exclamation, interruption) remain part of the comparison.
  return text.replace(/\s+/gu, '').replace(/[“”『』「」‘’]/gu, '"')
    .replace(/：/gu, ':').replace(/！/gu, '!').replace(/？/gu, '?').replace(/。/gu, '.')
    .replace(/(?:…+|\.{3,})/gu, '…').replace(/[—–]{2,}/gu, '——');
};

export const countDialogueCharacters = speech => [...String(speech || '').matchAll(/[\p{L}\p{N}]/gu)].length;

const parseHeader = header => {
  const directions = [...header.matchAll(/[（(]([^）)]*)[）)]/gu)].map(match => match[1]).join(' ');
  let speaker = header.replace(/[（(][^）)]*[）)]/gu, '').trim();
  // Attached OS is common in imported Chinese screenplays. Do not strip the
  // lowercase "os" at the end of an ordinary Latin name such as Carlos.
  const suffix = speaker.match(/(?:\s+(O\.?S\.?|V\.?O\.?)|(?<=[\p{Script=Han}])(O\.?S\.?|V\.?O\.?))$/u);
  const voice = suffix?.[1] || suffix?.[2] || '';
  if (suffix) speaker = speaker.slice(0, suffix.index).trim();
  const explicitMode = /(?:场外|画外现场|画外声|内心|心声|心理|旁白|[OV]\.?[SO]\.?)/iu.test(`${voice} ${directions}`) ? normalizeDialogueMode(`${voice} ${directions}`) : null;
  return { speaker, mode: explicitMode };
};

const literalRange = (source, start, end) => {
  while (start < end && /\s/u.test(source[start])) start += 1;
  while (end > start && /\s/u.test(source[end - 1])) end -= 1;
  if (quotePairs.get(source[start]) === source[end - 1]) { start += 1; end -= 1; }
  return { start, end };
};

export const parseDirectorDialogues = source => {
  const text = typeof source === 'string' ? source : String(source?.text || '');
  const castSpeakers = new Set(text.split('\n').flatMap(line => {
    const names = line.trim().match(CAST_HEADER)?.[1];
    if (!names) return [];
    return names.split(/[、,，;；]/u).map(name => parseHeader(name.trim()).speaker).filter(Boolean);
  }));
  const dialogues = [];
  let active = null;
  let lineStart = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) { lineStart += line.length + 1; continue; }
    const candidates = [...line.matchAll(SPEAKER_HEADER)].map(match => ({ match, ...parseHeader(match[1]) }))
      .filter(candidate => !METADATA_LABELS.has(candidate.speaker) && (!SPEECH_FIELD_LABEL.test(candidate.speaker) || castSpeakers.has(candidate.speaker)) && !/^\s*[△Δ▲]\s*$/u.test(line.slice(0, candidate.match.index)) && !insideQuoted(line, candidate.match.index));
    // "答案：…" inside a speech is prose, not a new actor. Inline changes are
    // accepted after a completed utterance, matching ordinary script notation.
    // A cast list can omit a small speaking part such as a nurse or policeman.
    // Preserve the original inline-speaker support after a full stop; reject
    // prose field categories above, not every actor absent from the cast list.
    const speakers = candidates.filter((candidate, index) => index === 0 || /[。！？!?][\t ]*$/u.test(line.slice(0, candidate.match.index)));
    const explicitInlineSpeaker = speakers.length && /^[\s]*[△Δ▲]/u.test(line) && /[。！？!?，,；;][\t ]*$/u.test(line.slice(0, speakers[0].match.index));
    if (speakers.length && (!ACTION_START.test(trimmed) || explicitInlineSpeaker)) {
      active = null;
      speakers.forEach((candidate, index) => {
        const start = lineStart + candidate.match.index + candidate.match[0].length;
        const next = lineStart + (speakers[index + 1]?.match.index ?? line.length);
        const action = text.slice(start, next).search(/[△Δ▲]/u);
        const range = literalRange(text, start, action < 0 ? next : start + action);
        if (range.start >= range.end) return;
        const row = { speaker: candidate.speaker, mode: candidate.mode, speech: text.slice(range.start, range.end), ranges: [range], headerStart: lineStart + candidate.match.index, headerEnd: range.start, speechStart: range.start, speechEnd: range.end };
        dialogues.push(row);
        active = action < 0 ? row : null;
      });
    } else if (ACTION_START.test(trimmed)) {
      active = null;
    } else if (active) {
      const range = literalRange(text, lineStart, lineStart + line.length);
      if (range.start < range.end) {
        active.ranges.push(range);
        active.speech += `\n${text.slice(range.start, range.end)}`;
        active.speechEnd = range.end;
      }
    }
    lineStart += line.length + 1;
  }
  return dialogues;
};

export const sourceDialogues = source => {
  if (!source || typeof source !== 'object' || typeof source.sourceText !== 'string') return parseDirectorDialogues(source);
  const start = Number.isInteger(source.sourceStart) ? source.sourceStart : 0;
  const end = Number.isInteger(source.sourceEnd) ? source.sourceEnd : source.sourceText.length;
  return parseDirectorDialogues(source.sourceText).flatMap(row => {
    const ranges = row.ranges.map(range => ({ start: Math.max(start, range.start), end: Math.min(end, range.end) })).filter(range => range.end > range.start);
    return ranges.length ? [{ ...row, ranges, speechStart: ranges[0].start, speechEnd: ranges.at(-1).end, speech: ranges.map(range => source.sourceText.slice(range.start, range.end)).join('\n') }] : [];
  });
};

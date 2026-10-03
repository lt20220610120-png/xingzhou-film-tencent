// Scene dialogue is parsed once from the original source. Ranges retain UTF-16
// offsets so a segment that begins halfway through a speech keeps its speaker.
const METADATA_LABELS = new Set(['人', '人物', '角色', '出场人物', '出场角色', '场景', '道具', '音效', '特写', '时间', '镜头', '动作', '画面', '说明', '景', '内景', '外景', '运镜', '光影', '声音', '音色', '限制', '画幅与风格', '光影基调', '节奏与环境声']);
const ACTION_START = /^(?:[△Δ▲]|\d+\s*[-—]\s*\d+\s*景[：:]|(?:场景|景|人|人物|角色|出场人物|出场角色|动作|镜头|画面|特写|旁白说明)[\t ]*[：:]|[（(]\d+[）)]\s*$|[（(][^）)]+[）)]\s*$|【[^】]+】)/u;
const SPEAKER_HEADER = /([\p{L}](?:[\p{L}\p{N}·]|\.(?!\.)){0,31}(?:[\t ]+(?:O\.?S\.?|V\.?O\.?))?(?:[\t ]*[（(][^）)\n]*[）)])*)[\t ]*[：:]/gu;
const CAST_HEADER = /^(?:人|人物|角色|出场人物|出场角色)[\t ]*[：:][\t ]*(.*)$/u;
// Colon labels inside a spoken announcement are words, not actors. This is a
// category rule rather than a list of one project's system messages; explicit
// cast entries still take precedence when a real actor has such a name.
const SPEECH_FIELD_LABEL = /(?:任务|奖励|条件|后果|结果|目标|提示|原因|说明|状态|时间|地点|属性|声望|等级|进度|数量|答案|指令|限制|建议|名称|名字|编号|要求|内容|规则|密码|别名)$/u;
const quotePairs = new Map([['“', '”'], ['『', '』'], ['「', '」'], ['‘', '’'], ['"', '"']]);
// Imported scripts also use plain third-person action lines. Only a known
// actor followed by an observable action/state can end a spoken continuation;
// mentioning that actor in a vocative ("魏今朝，你…") remains dialogue.
const NARRATIVE_AFTER_ACTOR = /^(?:[\t ]*)(?:(?:正在|已经|仍然|仍旧|仍|正|立刻|随后|缓缓|轻轻|猛地|突然|悄悄|慢慢|快步|抢着|下意识|不由得|转而|再次|一边)*)(?:抬|低头|低下|抬头|直起|起身|缓步|停|嗤笑|冷笑|沉默|开口|转|回头|侧|站|坐|蹲|躺|走|跑|迈|退|绕|靠|凑|俯|仰|弯|伸|收|放|拿|取|递|接|抓|攥|握|扣|拍|点|摸|揉|擦|拎|掏|脱|穿|捡|扶|压|推|拉|抱|扯|咬|吞|嚼|皱|看|望|瞥|盯|瞪|闭|睁|摇|笑|哭|叹|呼|吸|屏|打量|整理|把|将|用|手上|手中|脸上|脸色|眼神|目光|嘴唇|喉结|肩膀|身体|身形|双手|的(?:手|目光|眼神|脸|嘴|肩|身|胸|呼吸))/u;
// Only a bounded performance annotation may be detached from a known cast
// name. An exact longer cast name always wins, even if it ends with these words.
const UNPARENTHESIZED_DIRECTION = /^(?:皱(?:起)?眉|冷笑(?:一声)?|嗤笑(?:一声)?|低声|高声|大声|轻声|冷声|急声|沉声|怒吼|喊道|说道|问道|笑道)$/u;

const insideQuoted = (text, end) => {
  const stack = [];
  for (const character of text.slice(0, end)) {
    if (character === stack.at(-1)) stack.pop();
    else if (quotePairs.has(character)) stack.push(quotePairs.get(character));
  }
  return stack.length > 0;
};
export const isDirectorQuotedAt = insideQuoted;

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

const parseHeader = (header, cast = new Set()) => {
  const directions = [...header.matchAll(/[（(]([^）)]*)[）)]/gu)].map(match => match[1]).join(' ');
  let speaker = header.replace(/[（(][^）)]*[）)]/gu, '').trim();
  // Attached OS is common in imported Chinese screenplays. Do not strip the
  // lowercase "os" at the end of an ordinary Latin name such as Carlos.
  const suffix = speaker.match(/(?:\s+(O\.?S\.?|V\.?O\.?)|(?<=[\p{Script=Han}])(O\.?S\.?|V\.?O\.?))$/u);
  const voice = suffix?.[1] || suffix?.[2] || '';
  if (suffix) speaker = speaker.slice(0, suffix.index).trim();
  if (!cast.has(speaker)) {
    const actor = [...cast].filter(name => speaker.startsWith(name)).sort((a, b) => b.length - a.length)[0];
    if (actor && UNPARENTHESIZED_DIRECTION.test(speaker.slice(actor.length).trim())) speaker = actor;
  }
  const explicitMode = /(?:场外|画外现场|画外声|内心|心声|心理|旁白|[OV]\.?[SO]\.?)/iu.test(`${voice} ${directions}`) ? normalizeDialogueMode(`${voice} ${directions}`) : null;
  return { speaker, mode: explicitMode };
};

const literalRange = (source, start, end) => {
  while (start < end && /\s/u.test(source[start])) start += 1;
  while (end > start && /\s/u.test(source[end - 1])) end -= 1;
  if (quotePairs.get(source[start]) === source[end - 1]) { start += 1; end -= 1; }
  return { start, end };
};

const castActorNames = text => new Set(text.split('\n').flatMap(line => {
  const names = line.trim().match(CAST_HEADER)?.[1]?.split(/[△Δ▲]/u)[0];
  return names ? names.split(/[、,，;；]/u).map(name => parseHeader(name.trim()).speaker).filter(Boolean) : [];
}));
const knownActorNames = (text, cast = castActorNames(text)) => new Set([
  ...cast,
  ...text.split('\n').flatMap(line => [...line.matchAll(SPEAKER_HEADER)].filter(match => !line.slice(0, match.index).trim() && !ACTION_START.test(line.trim())).map(match => parseHeader(match[1], cast).speaker)),
].filter(name => name && !METADATA_LABELS.has(name) && !SPEECH_FIELD_LABEL.test(name)));
const unmarkedAction = (line, actors) => {
  const actor = [...actors].filter(name => line.startsWith(name)).sort((a, b) => b.length - a.length)[0];
  return Boolean(actor && NARRATIVE_AFTER_ACTOR.test(line.slice(actor.length)));
};
// A wrapped utterance may itself describe somebody's action. Without an
// explicit action marker, only a completed sentence permits that new boundary.
const unfinishedSpeech = active => active && !/[。！？!?…\.]\s*[”』」’"]?\s*$/u.test(active.speech);

export const unmarkedDirectorActionRanges = source => {
  const text=String(source || ''),actors=knownActorNames(text),ranges=[];
  const spokenRanges=parseDirectorDialogues(text).flatMap(row=>row.ranges);
  let offset=0;
  for(const line of text.split('\n')){
    const trimmed=line.trim();
    if(trimmed && unmarkedAction(trimmed,actors) && !insideQuoted(text,offset) && !spokenRanges.some(range=>range.start<offset+line.length&&range.end>offset)){
      const start=offset+line.indexOf(trimmed);
      ranges.push({start,end:start+trimmed.length});
    }
    offset+=line.length+1;
  }
  return ranges;
};

export const parseDirectorDialogues = source => {
  const text = typeof source === 'string' ? source : String(source?.text || '');
  const castSpeakers = castActorNames(text);
  const dialogues = [];
  const actors=knownActorNames(text, castSpeakers);
  let active = null;
  let lineStart = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) { lineStart += line.length + 1; continue; }
    const candidates = [...line.matchAll(SPEAKER_HEADER)].map(match => ({ match, ...parseHeader(match[1], castSpeakers) }))
      .filter(candidate => !METADATA_LABELS.has(candidate.speaker) && (!SPEECH_FIELD_LABEL.test(candidate.speaker) || castSpeakers.has(candidate.speaker)) && !/^\s*[△Δ▲]\s*$/u.test(line.slice(0, candidate.match.index)) && !insideQuoted(text, lineStart + candidate.match.index));
    // "答案：…" inside a speech is prose, not a new actor. Inline changes are
    // accepted after a completed utterance, matching ordinary script notation.
    // A cast list can omit a small speaking part such as a nurse or policeman.
    // Preserve the original inline-speaker support after a full stop; reject
    // prose field categories above, not every actor absent from the cast list.
    const speakers = candidates.filter((candidate, index) => index === 0 || /(?:[。！？!?]|…+|\.{3,})[\t ]*$/u.test(line.slice(0, candidate.match.index)));
    const explicitInlineSpeaker = speakers.length && /[△Δ▲]/u.test(line.slice(0, speakers[0].match.index)) && /(?:[。！？!?，,；;]|…+|\.{3,})[\t ]*$/u.test(line.slice(0, speakers[0].match.index));
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
    } else if (ACTION_START.test(trimmed) || (!insideQuoted(text,lineStart) && ((unmarkedAction(trimmed,actors) && !unfinishedSpeech(active)) || /^(?:<!--|-->|```(?:\w+)?)\s*$/u.test(trimmed)))) {
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

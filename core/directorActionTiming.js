// Quick-mode rehearsal estimates, not universal physical durations. Values are
// editable editorial defaults; explicit script timing always takes precedence.
export const DIRECTOR_ACTION_TIMING_REFERENCE = Object.freeze([
  { id: 'expression', label: '眼神、皱眉、短反应', seconds: 0.8, range: [0.5, 1], concurrent: 'dialogue', pattern: /眼神|目光|皱眉|看了.{0,12}一眼|微笑|点.{0,3}头|笑容|脸色|神色|盯着|指尖|泪花|噤若寒蝉/ },
  { id: 'gesture', label: '抬手、拉到身后、擦泪', seconds: 1.2, range: [0.8, 1.5], concurrent: 'dialogue', pattern: /抬手|攥紧|张开双臂|擦.{0,8}(?:汗|泪)|拉.{0,12}身后|袖口一抹/ },
  { id: 'prop', label: '拿取、递交、放入道具', seconds: 1.5, range: [1, 2], concurrent: 'voiceover', pattern: /(?:拿起|抓起|取出|递给|放入|扔给|摔上桌|刺入|夹在指缝|整理好)/ },
  { id: 'movement', label: '起身、短距离转身或行走', seconds: 2, range: [1.5, 3], concurrent: 'voiceover', pattern: /(?:翻身站起|舒展|转身|走进|逼近|后退|退离|蹲下|跪倒|栽倒|闪过|疾掠)/ },
  { id: 'combat', label: '一次快速攻击及反应', seconds: 2.5, range: [1.5, 3], concurrent: 'voiceover', pattern: /(?:巴掌|挥拳|一拳|铁拳|一脚|踹|刺入|惨叫|暴起)/ },
  { id: 'search', label: '动作麻利的摸索或搜取', seconds: 2.5, range: [2, 3], concurrent: 'voiceover', pattern: /摸索|搜出|搜刮/ },
  { id: 'switch', label: '关门、调出面板', seconds: 0.8, range: [0.5, 1], concurrent: 'voiceover', pattern: /(?:门.{0,10}关上|调出面板|关灯|灯灭)/ },
]);

const explicitSeconds = text => {
  const match = text.match(/(?:持续|等待|停顿|停留|保持|耗时|大约|约|用时)\s*(\d+(?:\.\d+)?)\s*秒/);
  if (match) return Number(match[1]);
  if (/^(?:等待|停顿|停留|保持)半秒[。！!]?$/u.test(text)) return 0.5;
  return null;
};

export const describeDirectorActionTiming = sourceQuote => {
  const text = String(sourceQuote || '');
  const explicit = explicitSeconds(text);
  if (/^[啪砰咚嗖啊！!。\s]+$/.test(text)) return { category: 'sound-effect', seconds: 0, typicalSeconds: [0, 0], concurrent: 'none', bounded: true };
  // Description establishes where the existing performance occurs. It does
  // not mandate an additional empty shot before every spoken line.
  const staticDescription = /^(?:晨光|阳光|月光|灯光|街边|室内|屋内|地下室|潮湿地下室|天花板|角落|房间|窗外|桌上|仓库中央)/.test(text)
    && !/(?:拿起|抓起|摔上桌|攥紧|走进|走出|跑进|跑出|转身|站起|递给|扔给|挥拳|跪倒|栽倒|搜刮|退离)/.test(text);
  if (staticDescription && explicit === null) return { category: 'environment', seconds: 0, typicalSeconds: [0, 0], concurrent: 'none', bounded: true };
  if (/^[\p{L}\p{N}·]{1,20}(?:已|仍)?藏在[^，,。！？]*(?:上方|下方|里面|后面|角落|缝隙|房内|门后)[。！？]?$/u.test(text) && explicit === null) return { category: 'environment', seconds: 0, typicalSeconds: [0, 0], concurrent: 'none', bounded: true };
  if (/咬着.{0,15}(?:汉堡|食物).{0,40}转身走进/.test(text)) return { category: 'quick-food-entry', seconds: 3, typicalSeconds: [3, 5], concurrent: 'none', bounded: true };
  if (/转身擦.{0,12}泪.{0,30}放入.{0,20}转身躺/.test(text)) return { category: 'wipe-store-lie', seconds: 3, typicalSeconds: [2.5, 4], concurrent: 'none', bounded: true };
  const prolonged = /(?:长廊|长距离|跑完|喝完|吃完|持续|一直|久久|长时间|等待|追逐|追赶|慢慢|缓慢|反复|艰难)/.test(text);
  const matches = DIRECTOR_ACTION_TIMING_REFERENCE.filter(rule => rule.pattern.test(text));
  const compoundWait = explicit !== null && /(?:然后|再|接着|之后)/.test(text) && matches.length > 0;
  if (explicit !== null || prolonged) return { category: 'explicit-or-prolonged', seconds: compoundWait ? null : explicit, minimumSeconds: explicit ?? 0, typicalSeconds: explicit === null ? null : [explicit, explicit], concurrent: 'none', bounded: explicit !== null && !compoundWait };
  if (!matches.length) return { category: 'unclassified', seconds: null, typicalSeconds: [2, 3], concurrent: 'none', bounded: false };
  // Facial expression accompanies movement rather than running after it.
  // A compound quick beat stays a beat; separate sentences remain separate.
  const main = matches.filter(rule => !['expression', 'gesture'].includes(rule.id));
  const seconds = Math.max(...matches.map(rule => rule.seconds));
  const concurrent = main.some(rule => ['combat', 'search'].includes(rule.id)) ? 'voiceover' : 'dialogue';
  return { category: matches.map(rule => rule.id).join('+'), seconds, typicalSeconds: [Math.min(...matches.map(rule => rule.range[0])), Math.max(...matches.map(rule => rule.range[1]))], concurrent, bounded: true };
};

// Attach to the next utterance before a performance barrier, or an explicit
// ongoing previous voiceover. A finite per-utterance budget prevents charging
// the same speech time twice when several gestures accompany one line.
export const estimateDirectorActionTimeline = ({ sourceText, actionCues, dialogues }) => {
  const speechBudgets = new Map(dialogues.map(dialogue => [dialogue, dialogue.characterCount / 4]));
  let actionSeconds = 0, overlapSeconds = 0, unknownBeatCount = 0;
  const cues = actionCues.map(cue => {
    const estimate = cue.category === 'establishing-only' ? { category: cue.category, seconds: cue.seconds, typicalSeconds: cue.typicalSeconds, bounded: true, concurrent: 'none' } : describeDirectorActionTiming(cue.sourceQuote);
    if (!estimate.bounded) { unknownBeatCount += 1; return { ...cue, ...estimate, overlapSeconds: 0 }; }
    const seconds = estimate.seconds;
    actionSeconds += seconds;
    const next = dialogues.find(dialogue => dialogue.ranges[0].start >= cue.sourceEnd);
    const previous = [...dialogues].reverse().find(dialogue => dialogue.ranges.at(-1).end <= cue.sourceStart);
    const compatible = dialogue => dialogue && (estimate.concurrent === 'dialogue' || (estimate.concurrent === 'voiceover' && dialogue.mode && dialogue.mode !== '现场对白'));
    let spoken = compatible(next) ? next : null;
    // A closing door must precede the following inner question; an action
    // explicitly performed during the previous line may continue under it.
    if (/门.{0,10}关上/.test(cue.sourceQuote) || /(?:然后才|之后才|完后|停下后).{0,8}(?:说|开口)/.test(cue.sourceQuote)) spoken = null;
    if (!spoken && /(?:说话时|同时|一边|OS|VO)/i.test(cue.sourceQuote) && compatible(previous)) spoken = previous;
    const between = spoken === next ? sourceText.slice(cue.sourceEnd, next.ranges[0].start) : '';
    if (spoken && /(?:等待|停顿|持续|跑完|长廊)/.test(between)) spoken = null;
    if (spoken === next && actionCues.some(other => other.sourceStart >= cue.sourceEnd && other.sourceEnd <= next.ranges[0].start && other.seconds !== 0 && !['expression', 'environment'].includes(other.category))) spoken = null;
    const overlap = spoken ? Math.min(seconds, speechBudgets.get(spoken)) : 0;
    if (spoken) speechBudgets.set(spoken, speechBudgets.get(spoken) - overlap);
    overlapSeconds += overlap;
    return { ...cue, ...estimate, overlapSeconds: overlap };
  });
  return { actionSeconds: Math.round(actionSeconds * 100) / 100, overlapSeconds: Math.round(overlapSeconds * 100) / 100, unknownBeatCount, cues };
};

// ============================================================
// collabStore.js — 项目协作领域逻辑（纯函数）
// 身份权限 / 美术清单解析 / 资产复用识别
// ============================================================

export const COLLAB_ROLES = { producer: '制片', artist: '美术', collaborator: '协作者', artist_collaborator: '美术 + 协作者' };

export const COLLAB_SECTIONS = [
  ['info', '信息读取'],
  ['art', '美术'],
  ['assets', '资产'],
  ['storyboard', '分镜'],
  ['invite', '邀请协作'],
  ['stats', '数据'],
  ['group', '项目群'],
];

const ROLE_SECTIONS = {
  producer: ['info', 'art', 'assets', 'storyboard', 'invite', 'stats', 'group'],
  artist: ['info', 'art', 'assets', 'group'],
  collaborator: ['storyboard', 'group'],
  artist_collaborator: ['info', 'art', 'assets', 'storyboard', 'group'],
};

export const sectionsForRole = (role) => ROLE_SECTIONS[role] || ['group'];
export const canSee = (role, section) => sectionsForRole(role).includes(section);

export const COLLAB_STYLES = ['AI真人', '3D动漫', '2D动漫'];

export const ASSET_CATEGORIES = { character: '人物', scene: '场景', prop: '道具' };

// ---------- 默认生图前置。用户的逐资产设置与描述一同保存、同步。 ----------
export const CHARACTER_PROMPT_PREFIXES = {
  'AI真人': '真人拍摄，但不能跟现实当中任何的明星撞脸。真人写实人像摄影，8K超高清原生画质，电影级柔和自然光影，无畸变广角，还原真实人像质感。皮肤通透细腻，精准呈现皮肤的次表面散射，自带自然原生的珠光光泽，超逼真还原皮肤纹理、原生毛孔、面部细碎绒毛等细节，五官立体精致，画面干净通透，光影过渡自然，整体真实与呼吸感，细节拉满。白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。',
  '3D动漫': '新中式3D国漫角色，融合英式动画的柔和质感与东方古典审美，极具东方温婉气韵，虚拟引擎5超高清渲染，8K极致精度。线条流畅灵动，五官精致舒展，自带古典故事感，光影柔和通透，色彩雅致高级。精准还原国风织锦、刺绣、纱质面料的细腻质感，发丝根根分明，皮肤纹理自然真实，材质表现整体画面唯美大气。白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。',
  '2D动漫': '风格:日本二次元动画风格，整体经典日漫2D手绘动画风格，4K超高清，细腻光影，强情绪张力，全程画风统一不跳变，无厚涂质感，细腻的人物情绪刻画，流畅无崩坏动画。白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。',
};
const CURRENT_CHARACTER_LAYOUT = '白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照三视图，所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。';
const LEGACY_CHARACTER_LAYOUT = '纯白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照，严格按顺序排列：正面全身照、正面（展示穿搭 + 脚 / 腿细节）、侧面（展示身形 + 脚 / 腿侧姿）、背面（展示背影 + 脚 / 腿后侧），所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。';
const LEGACY_CHARACTER_PROMPT_PREFIXES = Object.fromEntries(Object.entries(CHARACTER_PROMPT_PREFIXES)
  .map(([style, prefix]) => [style, prefix.replace(CURRENT_CHARACTER_LAYOUT, LEGACY_CHARACTER_LAYOUT)]));
export const CHARACTER_PROMPT_PREFIX = CHARACTER_PROMPT_PREFIXES['AI真人'];
export const SCENE_PROMPT_PREFIX = '只要场景不要出现任何人物。';
export const PROP_PROMPT_PREFIX = '纯白色背景。';

// 给资产描述加上类别固定前缀（人物/场景/道具），已有前缀时不重复添加。
const stripCharacterPromptPrefix = (description = '') => {
  let text = String(description || '').trim();
  for (const prefix of [...Object.values(CHARACTER_PROMPT_PREFIXES), ...Object.values(LEGACY_CHARACTER_PROMPT_PREFIXES)]) {
    if (text.startsWith(prefix)) text = text.slice(prefix.length).trim();
  }
  return text;
};

export const ASSET_PROMPT_MODES = { single: '单人多视图', group: '多人群像', free: '自由构图', scene: '场景', prop: '道具' };

export const inferAssetPromptMode = (asset) => {
  if (asset.category !== 'character') return ['scene', 'prop'].includes(asset.category) ? asset.category : 'free';
  const text = `${asset.name || ''}\n${stripCharacterPromptPrefix(asset.description)}`;
  // Generic occupations (司机、助理、工作人员) can be one person; require a collective or an explicit count.
  const group = /群像|群演|一群|一众|众人|男女老少|男女老幼|百姓|民众|村民们|弟子们|士兵们|人群|群众|一家[二两三四五六七八九十\d]+口|(?:[2-9]\d*|[二两三四五六七八九十]+)\s*(?:个\s*人|人(?!称)|位(?:人物|角色|男女)|名(?:人物|角色|男女|百姓|村民|士兵|弟子))/.test(text);
  return group ? 'group' : 'single';
};

export const defaultAssetPromptPrefix = (asset, style = 'AI真人', mode = inferAssetPromptMode(asset)) => {
  if (mode === 'free') return '';
  if (mode === 'scene') return SCENE_PROMPT_PREFIX;
  if (mode === 'prop') return PROP_PROMPT_PREFIX;
  const single = CHARACTER_PROMPT_PREFIXES[style] || CHARACTER_PROMPT_PREFIX;
  if (mode !== 'group') return single;
  const text = stripCharacterPromptPrefix(asset.description);
  const count = text.match(/([2-9]\d*|[二两三四五六七八九十]+)\s*(?:个\s*人|人(?!称)|位|名)/)?.[1]
    || text.match(/一家([二两三四五六七八九十\d]+)口/)?.[1] || '6';
  const visualStyle = single.split(/(?:纯)?白色背景，4格统一排版/)[0];
  return `${visualStyle}纯白色背景，在同一张完整画面中展示${count}位不同人物的群像，每个人完整全身入镜，人物之间留有间隔，不互相遮挡。人数以资产描述的明确要求为准；年龄与性别遵循描述，未限定时体现男女老少。属于同一类人，但每人的面貌、发型、身形与穿着细节各不相同。使用统一画风与时代设定，不重复同一人物，不使用单人多视图、特写拼贴或分镜排版。`;
};

// A readable envelope fits the existing cloud description field, so all collaborators
// receive the same settings without requiring a server/schema upgrade.
export const serializeAssetPrompt = ({ mode, prefix, content }) =>
  `【生图前置 · ${ASSET_PROMPT_MODES[mode] || ASSET_PROMPT_MODES.free}】\n${prefix || ''}\n\n【资产描述】\n${content || ''}`;

export const readAssetPrompt = (asset, style = 'AI真人') => {
  const raw = String(asset.description || '');
  const normalizedRaw = raw.split(String.fromCharCode(13)).join('');
  const lineBreak = String.fromCharCode(10);
  const headerEnd = normalizedRaw.indexOf(lineBreak);
  const header = headerEnd >= 0 ? normalizedRaw.slice(0, headerEnd) : '';
  const headerMatch = header.match(/^【生图前置 · (单人多视图|多人群像|自由构图|场景|道具)】$/);
  const contentMarker = `${lineBreak}${lineBreak}【资产描述】${lineBreak}`;
  const contentAt = headerEnd >= 0 ? normalizedRaw.indexOf(contentMarker, headerEnd) : -1;
  const saved = headerMatch && contentAt >= 0
    ? [null, headerMatch[1], normalizedRaw.slice(headerEnd + 1, contentAt), normalizedRaw.slice(contentAt + contentMarker.length)]
    : null;
  if (saved) {
    const mode = Object.keys(ASSET_PROMPT_MODES).find(key => ASSET_PROMPT_MODES[key] === saved[1]);
    const legacyStyle = Object.keys(LEGACY_CHARACTER_PROMPT_PREFIXES)
      .find(key => saved[2] === LEGACY_CHARACTER_PROMPT_PREFIXES[key]);
    const inheritedCurrentStyle = Object.keys(CHARACTER_PROMPT_PREFIXES)
      .find(key => saved[2].startsWith(CHARACTER_PROMPT_PREFIXES[key]));
    const inheritedLegacyStyle = Object.keys(LEGACY_CHARACTER_PROMPT_PREFIXES)
      .find(key => saved[2].startsWith(LEGACY_CHARACTER_PROMPT_PREFIXES[key]));
    if (asset.category === 'prop' && mode === 'single' && (inheritedCurrentStyle || inheritedLegacyStyle)) {
      const inheritedPrefix = inheritedCurrentStyle
        ? CHARACTER_PROMPT_PREFIXES[inheritedCurrentStyle]
        : LEGACY_CHARACTER_PROMPT_PREFIXES[inheritedLegacyStyle];
      const addition = saved[2].slice(inheritedPrefix.length).trim();
      return { mode: 'prop', prefix: [PROP_PROMPT_PREFIX, addition].filter(Boolean).join('\n'), content: saved[3], customized: Boolean(addition) };
    }
    let prefix = saved[2];
    if (legacyStyle && mode === 'group') prefix = defaultAssetPromptPrefix({ ...asset, description: saved[3] }, legacyStyle, mode);
    else if (mode === 'single' && prefix.includes(LEGACY_CHARACTER_LAYOUT)) prefix = prefix.replaceAll(LEGACY_CHARACTER_LAYOUT, CURRENT_CHARACTER_LAYOUT);
    else if (mode === 'group') prefix = prefix.replaceAll(LEGACY_CHARACTER_LAYOUT, '').replaceAll(CURRENT_CHARACTER_LAYOUT, '').trim();
    return { mode, prefix, content: saved[3], customized: true };
  }
  const mode = inferAssetPromptMode(asset);
  const prefix = defaultAssetPromptPrefix(asset, style, mode);
  let content = stripCharacterPromptPrefix(raw);
  if (asset.category === 'scene' && content.startsWith(SCENE_PROMPT_PREFIX)) content = content.slice(SCENE_PROMPT_PREFIX.length).trim();
  if (asset.category === 'prop' && content.startsWith(PROP_PROMPT_PREFIX)) content = content.slice(PROP_PROMPT_PREFIX.length).trim();
  return { mode, prefix, content, customized: false };
};

export const withAssetPrefix = (category, description = '', style = 'AI真人') => {
  const { prefix, content } = readAssetPrompt({ category, description }, style);
  return [prefix, content].filter(Boolean).join('\n');
};

export const buildAssetRevisionMessages = ({ instruction, originalContent, category }) => {
  const revision = String(instruction || '').trim();
  if (!revision) throw new Error('修改意见不能为空');
  const categoryLabel = ASSET_CATEGORIES[category] || '资产';
  return [
    {
      role: 'system',
      content: `你是影视美术提示词编辑。请严格按照用户的修改意见，重写${categoryLabel}提示词；保留未要求删除的重要细节，只输出修改后的完整提示词，不要解释。`,
    },
    {
      role: 'user',
      content: `修改意见（优先执行）：\n${revision}\n\n原始提示词：\n${String(originalContent || '').trim()}`,
    },
  ];
};

// ---------- 资产名解析：【姜蓝-剑道服】 → base=姜蓝 variant=剑道服 ----------
export const parseAssetName = (name) => {
  const clean = String(name || '').replace(/^【|】$/g, '').trim();
  const dash = clean.indexOf('-');
  if (dash < 0) return { base: clean, variant: '' };
  return { base: clean.slice(0, dash).trim(), variant: clean.slice(dash + 1).trim() };
};

// 同一角色的其他形态（用于换装参考 / @引用）
export const findBaseMates = (assets, name) => {
  const { base } = parseAssetName(name);
  if (!base) return [];
  return (assets || []).filter((a) => a.name !== name && parseAssetName(a.name).base === base);
};

// 全剧资产按创建顺序排列，每套妆造的图片按生成顺序排列。
// 默认始终保持最先定稿的角色形象；空字符串是用户明确选择不引用。
const SCENE_TIME = /^(?:凌晨|清晨|黎明|拂晓|早晨|上午|中午|午后|下午|黄昏|傍晚|日|日间|白天|白日|夜|夜间|夜晚|晚上|深夜|午夜|雨夜|雪夜|晨)$/;
const sceneIdentity = (name) => {
  const clean = String(name || '').replace(/^【|】$/g, '').trim();
  const parts = clean.split(/[-—–]/).map((part) => part.trim()).filter(Boolean);
  const zone = /^(?:内|外|内外)$/.test(parts.at(-1) || '') ? parts.pop() : '';
  const time = SCENE_TIME.test(parts.at(-1) || '') ? parts.pop() : '';
  const location = parts.join('-');
  return location && zone ? { location, time, zone, key: `${location}\u0000${zone}` } : null;
};
const sceneLightingDifference = (asset, content) => {
  const clauses = String(content || '').split(/[；;\n]+|(?<=[。！？])\s*(?=[^\s。！？；;：:]{1,24}[：:])/).map((part) => part.trim()).filter(Boolean);
  const lighting = clauses.filter((part) => /^(?:时间(?:\/光线|光线)?(?:差异)?|光线(?:差异)?|照明|色温|天色|日照|晨光|暮色|夜色|环境光)[：:]/.test(part));
  if (lighting.length) return lighting.join('；');
  const time = sceneIdentity(asset.name)?.time;
  return time ? `时间/光线：${time}` : '保持参考图的时间与光线不变';
};
const sceneVariantDifference = (asset, content) => {
  const reference = String(content || '').match(/参考【[^】]+】/)?.[0];
  return [reference, sceneLightingDifference(asset, content)].filter(Boolean).join('；');
};
const referenceGroup = (asset) => {
  if (asset.category === 'scene') return sceneIdentity(asset.name)?.key || `legacy\u0000${parseAssetName(asset.name).base}`;
  return parseAssetName(asset.name).base;
};
const firstEpisodeOf = (asset) => Number(asset.first_episode
  ?? Math.min(...(asset.episodes || []).map(Number).filter(Number.isFinite))) || Number.MAX_SAFE_INTEGER;

export const resolveAssetReference = (asset, assets, selectedId = null) => {
  const hasImage = (item) => item.images?.some((image) => image.url) || item.image_url;
  const group = referenceGroup(asset);
  const peers = (assets || []).map((item, index) => ({ item, index }))
    .filter(({ item }) => item.category === asset.category && referenceGroup(item) === group)
    .sort((a, b) => firstEpisodeOf(a.item) - firstEpisodeOf(b.item) || a.index - b.index)
    .map(({ item }) => item);
  if (selectedId !== null) return peers.find((item) => item.id !== asset.id && item.id === selectedId && hasImage(item)) || null;
  if (asset.category !== 'character' && (asset.category !== 'scene' || !sceneIdentity(asset.name))) return null;
  const first = peers.find(hasImage);
  return first && first.id !== asset.id ? first : null;
};

// Wardrobe identity is independent of prompt projections and image availability.
export const isCharacterWardrobeVariant = (asset, assets = []) => {
  if (asset?.category !== 'character') return false;
  if (asset.characterBaselineName && asset.characterBaselineName !== asset.name) return true;
  const base = parseAssetName(asset.name).base;
  const baseline = (assets || []).map((item, index) => ({ item, index }))
    .filter(({ item }) => item.category === 'character' && parseAssetName(item.name).base === base)
    .sort((a, b) => firstEpisodeOf(a.item) - firstEpisodeOf(b.item) || a.index - b.index)[0]?.item;
  return Boolean(baseline && baseline.name !== asset.name);
};

// 人物是主实体，服饰/妆造是人物下的一对多分支。
export const groupCharacterAssets = (assets) => {
  const groups = new Map();
  for (const asset of normalizeArtAssets(assets).filter((item) => item?.category === 'character')) {
    const parsed = parseAssetName(asset.name);
    if (!parsed.base) continue;
    if (!groups.has(parsed.base)) groups.set(parsed.base, []);
    groups.get(parsed.base).push({ ...asset, variant: parsed.variant });
  }
  return [...groups.entries()].map(([base, variants]) => {
    const main = variants.find((item) => !item.variant)
      || variants.find((item) => item.images?.length || item.image_url)
      || variants[0];
    return { base, main, variants };
  });
};

// ---------- Agent 输出解析 ----------
// 支持结构：### 第N集 → 人物：/场景：/道具： → - 【资产名】（首次/复用自第X集）描述
const chineseNumber = (value) => {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let digit = 0;
  for (const char of value) {
    if (char in digits) digit = digits[char];
    else if (char in units) { total += (digit || 1) * units[char]; digit = 0; }
    else return 0;
  }
  return total + digit;
};
const episodeNumberFromHeader = (line) => {
  const clean = String(line || '').replace(/^#{1,6}\s*/, '').trim();
  const chinese = clean.match(/^第\s*([\d零〇一二两三四五六七八九十百千]+)\s*集(?:\s+.*)?$/);
  if (chinese) return chineseNumber(chinese[1]);
  const ep = clean.match(/^(?:EP|Episode)\s*0*(\d+)(?:\s+.*)?$/i);
  return ep ? Number(ep[1]) : 0;
};
const CAT_HEAD = /^(人物|场景|道具)[：:]\s*$/;
const OVERVIEW_HEAD = /^#{0,6}\s*(人物|场景|道具)总览/;
const ENTRY = /^[-*•]\s*【([^】]+)】\s*(.*)$/;
const CAT_KEY = { 人物: 'character', 场景: 'scene', 道具: 'prop' };
// Explicit absence beats invented human/object fields; names/VO labels alone do not.
const HARD_NON_VISUAL_ASSET = /(?:仅|只有|只以)(?:声音|画外音)|只闻其声|未(?:实际|实体)?出镜|未见(?:实际|实体)?出镜|不(?:实际|实体)?出镜|无实体(?:形象)?|不存在可见实体|无画面/;
const NON_VISUAL_CHARACTER = /不生成(?:形象)?资产|不输出人物资产|不生成人物(?:形象|资产)?|仅提及|仅被提及|仅声音|声音出场|仅画外|画外音|只闻其声|(?:系统|机械|电话|电子)音|\bV\.?O\.?\b|\bO\.?S\.?\b|旁白|无法确认|未见出镜|未出镜|无实体(?:形象)?|不存在可见实体|无画面|脑海中?响起/iu;
const VISIBLE_CHARACTER = /实际出镜|实体出镜|画面(?:中)?出现|拟人(?:化)?角色|具有人形|群演|换装/;
const stripNegatedVisibleTerms = (value) => String(value || '').replace(/(?:不具有人形|无需换装|无须换装|不换装|未换装|非拟人(?:化)?角色|不是拟人(?:化)?角色|(?:未见|未|不)(?:实际|实体)?出镜)/g, '');
const positiveVisibleCharacter = (value) => VISIBLE_CHARACTER.test(stripNegatedVisibleTerms(value));
const positiveAnthropomorphicCharacter = (value) => /拟人(?:化)?角色|具有人形/.test(stripNegatedVisibleTerms(value));
const HUMAN_DESCRIPTION = /脸型|五官|眉眼|鼻型|鼻梁|唇形|发型|发色|身材|体态|肤色|肤质|服装|妆造|人物参考图/g;
const HUMAN_FIELD = /(?:脸型(?:与)?五官|脸型|五官|眉眼|鼻型|鼻梁|唇形|发型(?:发色)?|发色|身材(?:比例|体态)?|体态|肤色(?:肤质)?|肤质|服装(?:与鞋履)?|穿着|妆造(?:与固定配饰)?)[：:]([^；;\n。！？]+)/g;
const OBJECT_VISUAL_DESCRIPTION = /外观[：:]|材质[：:]|尺寸[：:]|大小感[：:]|屏幕|英寸|边框|玻璃面板|金属机身|机身|科技界面|提示界面|来电界面|界面|UI|面板|矩形|智能手机|设备主体|按键|镜头|接口|型号|图标|提示框/gi;
// Share one field grammar for sentence boundaries and the V5 difference whitelist.
const CHARACTER_DIFFERENCE_FIELDS = '(?:服装与鞋履|服装总体|服装总轮廓|服装层次|分层服装(?:细节)?|服装差异|服装|穿着|妆造与固定配饰|妆造差异|妆造|妆发差异|妆发|发型变化|发式变化|配饰与随身(?:物|道具)|配饰|随身物|状态差异|可见状态|伤情|伤口|做旧|破损|污损|【(?:内层|中层|外层|下装|足饰)】)';
const CHARACTER_IDENTITY_FIELDS = '(?:身份与依据|资产身份|脸型骨相(?:与五官)?|脸型(?:与)?五官|脸型|五官|眉眼|鼻唇(?:与耳部)?|鼻型|鼻梁|唇形|肤质与辨识点|肤色肤质|发型与发饰|发型发色|身形(?:与肤质|比例)|身材(?:比例|体态)?|稳定气质)';
const CHARACTER_DIFFERENCE_FIELD = new RegExp(`^${CHARACTER_DIFFERENCE_FIELDS}[：:]`);
const CHARACTER_IDENTITY_FIELD = new RegExp(`${CHARACTER_IDENTITY_FIELDS}[：:]`);
const characterVariantDifference = (description) => {
  const text = String(description || '').trim();
  const fieldPattern = new RegExp(`(?:${CHARACTER_IDENTITY_FIELDS}|${CHARACTER_DIFFERENCE_FIELDS})[：:]`, 'g');
  const fields = [...text.matchAll(fieldPattern)];
  if (!fields.length) return text;
  const differenceFields = fields.map((field, index) => text.slice(field.index, fields[index + 1]?.index ?? text.length)
    .replace(/^[；;\n。！？\s]+|[；;\n。！？\s]+$/g, ''))
    .filter((part) => CHARACTER_DIFFERENCE_FIELD.test(part));
  const differences = differenceFields.filter((part) => {
    const value = part.replace(CHARACTER_DIFFERENCE_FIELD, '').trim().replace(/[；;\n。！？\s]+$/g, '');
    return value && !/^(?:不适用|无|不存在|非人物|N\/?A)[。.!！?？\s]*$/i.test(value);
  });
  const reference = text.match(/参考【[^】]+】/)?.[0];
  return CHARACTER_IDENTITY_FIELD.test(text) || differenceFields.length
    ? [reference, ...differences].filter(Boolean).join('；')
    : text;
};
const UNSUPPORTED_AUTOMATIC_VARIANT = /(?:无(?:剧本|原文|明确)依据|剧本未提及|原文未提及)[^。；;\n]*(?:换装|服装|造型)|(?:自动|自行|额外)(?:设计|补充|生成)[^。；;\n]*(?:换装|服装|造型)/;
const MINOR_STATE_VARIANT = /轻微(?:擦伤|受伤|红肿|淤青|划伤|血痕)|小(?:擦伤|伤口)|浅表(?:擦伤|划痕)/;
const SIGNIFICANT_STATE_VARIANT = /绷带|包扎|骨折|脱臼|严重|大量出血|明显伤口|血污|泥污|湿透|撕裂|烧伤/;
const inflatedCharacterVariant = (asset) => {
  const description = String(asset.description || '');
  const text = `${asset.name || ''} ${description}`;
  const minorOnlyState = MINOR_STATE_VARIANT.test(parseAssetName(asset.name).variant)
    || (/状态差异[：:]/.test(description) && MINOR_STATE_VARIANT.test(description));
  const positiveStateText = text.replace(/(?:无|没有|未|不见)(?:明显)?(?:伤口|血污|泥污|湿透|撕裂|烧伤|大量出血)/g, '');
  return UNSUPPORTED_AUTOMATIC_VARIANT.test(text)
    || (minorOnlyState && !SIGNIFICANT_STATE_VARIANT.test(positiveStateText));
};
const hasAssetImage = (asset) => Boolean(asset.image_url || asset.images?.some((image) => image.url));
const humanVisualEvidence = (description) => {
  const text = String(description || '');
  const fields = [...text.matchAll(HUMAN_FIELD)];
  if (fields.length) {
    const applicable = fields.filter(([, value]) => !/^(?:不适用|无|不存在|非人物|N\/?A)/i.test(value.trim())
      && !/(?:英寸|矩形|机身|屏幕|界面|面板|设备|手机壳)/i.test(value));
    const hasWardrobeOrMakeup = applicable.some(([field]) => /^(?:服装|穿着|妆造)/.test(field));
    const objectEvidence = new Set(text.match(OBJECT_VISUAL_DESCRIPTION) || []).size;
    return applicable.length >= 2 || (hasWardrobeOrMakeup && objectEvidence < 2);
  }
  return (text.match(HUMAN_DESCRIPTION) || []).length >= 2;
};
const misplacedVisualProp = (description) => {
  if (positiveAnthropomorphicCharacter(description) || humanVisualEvidence(description)) return false;
  return new Set(String(description || '').match(OBJECT_VISUAL_DESCRIPTION) || []).size >= 2;
};

// Read-only adapter for persisted assets. It never mutates/deletes cloud rows or
// touches descriptions/images; callers may render and generate from this view.
export const normalizeArtAssets = (assets) => {
  let normalized = (assets || []).flatMap((asset) => {
    if (!asset || !['character', 'prop'].includes(asset.category)) return asset ? [{ ...asset }] : [];
    const content = readAssetPrompt(asset).content;
    if (HARD_NON_VISUAL_ASSET.test(content)) return [];
    if (asset.category === 'prop') return [{ ...asset }];
    const evidence = `${asset.name || ''} ${content}`;
    const visiblyAnthropomorphic = positiveAnthropomorphicCharacter(evidence);
    const visiblyHuman = positiveVisibleCharacter(evidence) && humanVisualEvidence(content);
    if (misplacedVisualProp(content)) return [{ ...asset, category: 'prop' }];
    if (NON_VISUAL_CHARACTER.test(evidence) && !visiblyAnthropomorphic && !visiblyHuman) return [];
    return [{ ...asset, category: 'character' }];
  });
  normalized = normalized.filter((asset) => asset.category !== 'character'
    || hasAssetImage(asset)
    || readAssetPrompt(asset).customized
    || !inflatedCharacterVariant(asset));
  const baselines = new Map();
  const sceneBaselines = new Map();
  normalized.forEach((asset, index) => {
    if (asset.category === 'scene') {
      const identity = sceneIdentity(asset.name);
      if (!identity) return;
      const prior = sceneBaselines.get(identity.key);
      if (!prior || firstEpisodeOf(asset) < firstEpisodeOf(prior.asset)) sceneBaselines.set(identity.key, { asset, index });
      return;
    }
    if (asset.category !== 'character') return;
    const { base } = parseAssetName(asset.name);
    const prior = baselines.get(base);
    if (!prior || firstEpisodeOf(asset) < firstEpisodeOf(prior.asset)) baselines.set(base, { asset, index });
  });
  return normalized.map((asset, index) => {
    if (asset.category === 'scene') {
      const identity = sceneIdentity(asset.name);
      if (!identity || sceneBaselines.get(identity.key)?.index === index || readAssetPrompt(asset).customized) return asset;
      const generationDescription = sceneVariantDifference(asset, asset.description);
      return generationDescription && generationDescription !== asset.description
        ? { ...asset, generationDescription, generationDescriptionSource: asset.description }
        : asset;
    }
    if (asset.category !== 'character') return asset;
    const baseline = baselines.get(parseAssetName(asset.name).base);
    if (baseline?.index === index) return asset;
    const relatedAsset = { ...asset, characterBaselineName: asset.characterBaselineName || baseline.asset.name };
    if (readAssetPrompt(asset).customized) return relatedAsset;
    const generationDescription = characterVariantDifference(asset.description);
    return generationDescription !== asset.description
      ? { ...relatedAsset, generationDescription, generationDescriptionSource: asset.description }
      : relatedAsset;
  });
};

export const parseArtAnalysis = (text) => {
  const lines = String(text || '').split(/\r?\n/);
  const episodes = new Map(); // ep → { character:[], scene:[], prop:[] }
  let currentEp = 0;
  let currentCat = '';
  let inOverview = false;
  let lastEntry = null;

  const ensureEp = (ep) => {
    if (!episodes.has(ep)) episodes.set(ep, { character: [], scene: [], prop: [] });
    return episodes.get(ep);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('```')) continue;
    const episodeNumber = episodeNumberFromHeader(line);
    if (!inOverview && episodeNumber) { currentEp = episodeNumber; ensureEp(currentEp); currentCat = ''; lastEntry = null; continue; }
    if (OVERVIEW_HEAD.test(line)) { inOverview = true; currentCat = ''; lastEntry = null; continue; }
    if (inOverview) continue; // 总览由按集清单聚合生成，云端不重复解析
    const catMatch = line.match(CAT_HEAD);
    if (catMatch) { currentCat = CAT_KEY[catMatch[1]]; lastEntry = null; continue; }
    if (!currentEp || !currentCat) continue;
    if(/^[-*•]?\s*无[（(]/.test(line)){lastEntry=null;continue;}
    const fieldLine=/^(?:[-*•]\s*)?【(?:内层|中层|外层|下装|足饰|推断|待确认)】/.test(line);
    const entryMatch = fieldLine ? null : line.match(ENTRY);
    if (entryMatch) {
      const name = `【${entryMatch[1].trim()}】`;
      const rest = entryMatch[2] || '';
      const reuseMatch = rest.match(/复用(?:自)?第\s*(\d+)\s*集/);
      const metadataReference = rest.match(/^（[^）]*?(参考【[^】]+】)[^）]*）/)?.[1] || '';
      const description = rest.replace(/^（[^）]*）\s*/, '').trim();
      // Classification waits for all continuation fields, not just the entry head.
      const entryCategory = currentCat;
      lastEntry = {
        name,
        category: entryCategory,
        episode: currentEp,
        ...( ['character', 'prop'].includes(entryCategory) ? { _characterEvidence: reuseMatch ? rest : (rest.match(/^（[^）]*）/)?.[0] || '') } : {}),
        reuseOf: reuseMatch ? Number(reuseMatch[1]) : 0,
        description: reuseMatch ? '' : [metadataReference, description].filter(Boolean).join('；'),
      };
      ensureEp(currentEp)[entryCategory].push(lastEntry);
    } else if (lastEntry && !line.startsWith('#')) {
      lastEntry.description = `${lastEntry.description}${lastEntry.description ? '\n' : ''}${line}`;
    }
  }

  for (const cats of episodes.values()) {
    const characters = [];
    for (const entry of cats.character) {
      const evidence = `${entry._characterEvidence || ''}\n${entry.description}`;
      const explicitlyVisible = positiveVisibleCharacter(evidence);
      const explicitlyAnthropomorphic = positiveAnthropomorphicCharacter(evidence);
      delete entry._characterEvidence;
      if (HARD_NON_VISUAL_ASSET.test(evidence)) {
        entry.generatable = false;
        characters.push(entry);
        continue;
      }
      if (misplacedVisualProp(evidence)) {
        delete entry.generatable;
        entry.category = 'prop';
        cats.prop.push(entry);
        continue;
      }
      const structuredHumanDescription = humanVisualEvidence(entry.description);
      const referenceName = entry.description.match(/参考【([^】]+)】/)?.[1] || '';
      const sameCharacterReference = referenceName
        && parseAssetName(`【${referenceName}】`).base === parseAssetName(entry.name).base;
      const nonVisual = NON_VISUAL_CHARACTER.test(`${entry.name} ${evidence}`)
        && !explicitlyAnthropomorphic && !(explicitlyVisible && structuredHumanDescription);
      if (nonVisual || (!explicitlyVisible && !entry.reuseOf && !structuredHumanDescription && !sameCharacterReference)) entry.generatable = false;
      characters.push(entry);
    }
    cats.character = characters;
    for (const entry of cats.prop) {
      if (HARD_NON_VISUAL_ASSET.test(`${entry._characterEvidence || ''}\n${entry.description}`)) entry.generatable = false;
      delete entry._characterEvidence;
    }
  }

  return {
    episodes: [...episodes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([episode, cats]) => ({ episode, ...cats })),
  };
};

// 解析结果 → 云端资产行（同名合并、集数聚合、首次描述保留）
export const buildAssetRows = (parsed) => {
  const map = new Map();
  for (const ep of parsed.episodes || []) {
    for (const cat of ['character', 'scene', 'prop']) {
      for (const entry of ep[cat] || []) {
        if(entry.generatable===false)continue;
        if (['character', 'prop'].includes(cat) && HARD_NON_VISUAL_ASSET.test(readAssetPrompt({ ...entry, category: cat }).content)) continue;
        const key = `${cat}\u0000${entry.name}`;
        const existing = map.get(key);
        if (existing) {
          if (!existing.episodes.includes(ep.episode)) existing.episodes.push(ep.episode);
          if (!existing.description && entry.description) existing.description = entry.description;
        } else {
          map.set(key, {
            name: entry.name,
            category: cat,
            description: entry.description || '',
            first_episode: entry.reuseOf || ep.episode,
            episodes: [ep.episode],
          });
        }
      }
    }
  }
  const rows = [...map.values()].filter((row) => row.category !== 'character' || !inflatedCharacterVariant(row));
  const seenCharacterBases = new Map();
  const seenScenePlaces = new Set();
  return rows.map((row) => {
    const episodes = row.episodes.sort((a, b) => a - b);
    if (row.category === 'scene') {
      const identity = sceneIdentity(row.name);
      if (!identity || !seenScenePlaces.has(identity.key)) {
        if (identity) seenScenePlaces.add(identity.key);
        return { ...row, episodes };
      }
      return { ...row, description: sceneVariantDifference(row, row.description), episodes };
    }
    if (row.category !== 'character') return { ...row, episodes };
    const { base } = parseAssetName(row.name);
    if (!seenCharacterBases.has(base)) {
      seenCharacterBases.set(base, row.name);
      return { ...row, episodes };
    }
    return { ...row, characterBaselineName: row.characterBaselineName || seenCharacterBases.get(base), description: characterVariantDifference(row.description), episodes };
  });
};

export const ensureArtEpisodeCoverage = (parsed, episodeCount) => {
  const byEpisode = new Map((parsed?.episodes || []).map((item) => [Number(item.episode), item]));
  for (let episode = 1; episode <= Number(episodeCount || 0); episode += 1) {
    if (!byEpisode.has(episode)) byEpisode.set(episode, { episode, character: [], scene: [], prop: [] });
  }
  return { episodes: [...byEpisode.values()].sort((a, b) => a.episode - b.episode) };
};

// 某一集下按类别列出资产（含复用标注）
export const assetsForEpisode = (assets, episode, category) =>
  normalizeArtAssets(assets)
    .filter((a) => a.category === category && (a.episodes || []).includes(episode))
    .map((a) => ({ ...a, reused: Number(a.first_episode) !== Number(episode) }));

export const buildAssetGenerationJobs = (assets, episode, categories = ['character', 'scene', 'prop']) =>
  (assets || []).filter((asset) => categories.includes(asset.category) && (asset.episodes || []).includes(episode));

export const episodeNumbersFromAssets = (assets) => {
  const set = new Set();
  for (const a of assets || []) for (const ep of a.episodes || []) set.add(ep);
  return [...set].sort((a, b) => a - b);
};

// ---------- @引用：把同角色/同地点参考资产的描述并入生图提示词 ----------
export const buildImagePrompt = (asset, refAsset, style) => {
  const parts = [];
  const settings = readAssetPrompt(asset, style);
  if (settings.prefix) parts.push(settings.prefix);
  if (style) parts.push(`画风：${style}`);
  if (refAsset) {
    const hasReferenceImage = Boolean(refAsset.image_url || refAsset.images?.some((image) => image.url));
    const reference = hasReferenceImage ? '' : readAssetPrompt(refAsset, style).content;
    const referenceId = refAsset.id ? `资产ID：${refAsset.id}，` : '';
    const projectionIsCurrent = typeof asset.generationDescription === 'string'
      && asset.generationDescriptionSource === asset.description;
    const currentContent = projectionIsCurrent ? asset.generationDescription : settings.content;
    const currentScene = asset.category === 'scene' ? sceneIdentity(asset.name) : null;
    const referenceScene = refAsset.category === 'scene' ? sceneIdentity(refAsset.name) : null;
    if (currentScene && referenceScene && currentScene.key === referenceScene.key) {
      parts.push(hasReferenceImage
        ? `参考场景图片（${referenceId}保持同一地点的空间布局、结构、陈设和材质一致）：${refAsset.name}`
        : `参考场景（保持同一地点的空间布局、结构、陈设和材质一致）：${refAsset.name}\n${reference}`);
      const lightingDifference = sceneLightingDifference(asset, currentContent)
        .replace(/^(?:时间(?:光线)?|时间\/光线(?:差异)?|光线(?:差异)?)[：:]\s*/, '');
      parts.push(`本次时间/光线差异：${lightingDifference}`);
    } else {
      const sameCharacter = asset.category === 'character' && refAsset.category === 'character'
        && parseAssetName(asset.name).base === parseAssetName(refAsset.name).base;
      const difference = sameCharacter && (!settings.customized || projectionIsCurrent)
        ? characterVariantDifference(currentContent)
        : currentContent;
      if (hasReferenceImage && sameCharacter) {
        parts.push(`参考角色图片（${referenceId}保持脸型五官发型身材一致，保持同一人物）：${refAsset.name}`);
      } else if (hasReferenceImage) {
        parts.push(`参考资产图片（${referenceId}只继承可复用的视觉锚点）：${refAsset.name}`);
      } else {
        parts.push(settings.mode === 'single' || !asset.category
          ? `参考角色形象（同一人物，保持脸型五官发型身材完全一致）：${refAsset.name}\n${reference}`
          : `参考资产的画风与服装设定，人物数量和构图以本次生图前置与描述为准：${refAsset.name}\n${reference}`);
      }
      parts.push(`本次变化（服装/状态差异）：${difference || parseAssetName(asset.name).variant}`);
    }
  } else {
    parts.push(settings.content || asset.name);
  }
  return parts.filter(Boolean).join('\n\n');
};

// ---------- 数据统计（制片专属） ----------
export const summarizeActivity = (activityRows, members) => {
  const byUser = new Map();
  for (const m of members || []) {
    byUser.set(m.user_id, { userId: m.user_id, username: m.display_name || m.username, role: m.role, images: 0, videos: 0, edits: 0, messages: 0, lastActive: '' });
  }
  for (const row of activityRows || []) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { userId: row.user_id, username: row.username, role: row.role || '', images: 0, videos: 0, edits: 0, messages: 0, lastActive: '' });
    }
    const item = byUser.get(row.user_id);
    if (row.action === 'generate-image') item.images += 1;
    else if (row.action === 'generate-video') item.videos += 1;
    else if (row.action === 'message') item.messages += 1;
    else item.edits += 1;
    if (!item.lastActive || row.created_at > item.lastActive) item.lastActive = row.created_at;
  }
  return [...byUser.values()];
};

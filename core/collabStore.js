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
  'AI真人': '真人拍摄，但不能跟现实当中任何的明星撞脸。真人写实人像摄影，8K超高清原生画质，电影级柔和自然光影，无畸变广角，还原真实人像质感。皮肤通透细腻，精准呈现皮肤的次表面散射，自带自然原生的珠光光泽，超逼真还原皮肤纹理、原生毛孔、面部细碎绒毛等细节，五官立体精致，画面干净通透，光影过渡自然，整体真实与呼吸感，细节拉满。纯白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照，严格按顺序排列：正面全身照、正面（展示穿搭 + 脚 / 腿细节）、侧面（展示身形 + 脚 / 腿侧姿）、背面（展示背影 + 脚 / 腿后侧），所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。',
  '3D动漫': '新中式3D国漫角色，融合英式动画的柔和质感与东方古典审美，极具东方温婉气韵，虚拟引擎5超高清渲染，8K极致精度。线条流畅灵动，五官精致舒展，自带古典故事感，光影柔和通透，色彩雅致高级。精准还原国风织锦、刺绣、纱质面料的细腻质感，发丝根根分明，皮肤纹理自然真实，材质表现整体画面唯美大气。纯白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照，严格按顺序排列：正面全身照、正面（展示穿搭 + 脚 / 腿细节）、侧面（展示身形 + 脚 / 腿侧姿）、背面（展示背影 + 脚 / 腿后侧），所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。',
  '2D动漫': '风格:日本二次元动画风格，整体经典日漫2D手绘动画风格，4K超高清，细腻光影，强情绪张力，全程画风统一不跳变，无厚涂质感，细腻的人物情绪刻画，流畅无崩坏动画。纯白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照，严格按顺序排列：正面全身照、正面（展示穿搭 + 脚 / 腿细节）、侧面（展示身形 + 脚 / 腿侧姿）、背面（展示背影 + 脚 / 腿后侧），所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。',
};
export const CHARACTER_PROMPT_PREFIX = CHARACTER_PROMPT_PREFIXES['AI真人'];
export const SCENE_PROMPT_PREFIX = '只要场景不要出现任何人物。';
export const PROP_PROMPT_PREFIX = '纯白色背景。';

// 给资产描述加上类别固定前缀（人物/场景/道具），已有前缀时不重复添加。
const stripCharacterPromptPrefix = (description = '') => {
  let text = String(description || '').trim();
  for (const prefix of Object.values(CHARACTER_PROMPT_PREFIXES)) {
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
  const visualStyle = single.split('纯白色背景')[0];
  return `${visualStyle}纯白色背景，在同一张完整画面中展示${count}位不同人物的群像，每个人完整全身入镜，人物之间留有间隔，不互相遮挡。人数以资产描述的明确要求为准；年龄与性别遵循描述，未限定时体现男女老少。属于同一类人，但每人的面貌、发型、身形与穿着细节各不相同。使用统一画风与时代设定，不重复同一人物，不使用单人多视图、特写拼贴或分镜排版。`;
};

// A readable envelope fits the existing cloud description field, so all collaborators
// receive the same settings without requiring a server/schema upgrade.
export const serializeAssetPrompt = ({ mode, prefix, content }) =>
  `【生图前置 · ${ASSET_PROMPT_MODES[mode] || ASSET_PROMPT_MODES.free}】\n${prefix || ''}\n\n【资产描述】\n${content || ''}`;

export const readAssetPrompt = (asset, style = 'AI真人') => {
  const raw = String(asset.description || '');
  const saved = raw.match(/^【生图前置 · (单人多视图|多人群像|自由构图|场景|道具)】\r?\n([\s\S]*?)\r?\n\r?\n【资产描述】\r?\n([\s\S]*)$/);
  if (saved) return { mode: Object.keys(ASSET_PROMPT_MODES).find(key => ASSET_PROMPT_MODES[key] === saved[1]), prefix: saved[2], content: saved[3], customized: true };
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

// 人物是主实体，服饰/妆造是人物下的一对多分支。
export const groupCharacterAssets = (assets) => {
  const groups = new Map();
  for (const asset of (assets || []).filter((item) => item?.category === 'character')) {
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
const EP_HEAD = /^#{0,6}\s*第\s*(\d+)\s*集\s*$/;
const CAT_HEAD = /^(人物|场景|道具)[：:]\s*$/;
const OVERVIEW_HEAD = /^#{0,6}\s*(人物|场景|道具)总览/;
const ENTRY = /^[-*•]?\s*【([^】]+)】\s*(.*)$/;
const CAT_KEY = { 人物: 'character', 场景: 'scene', 道具: 'prop' };

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
    if (!line) { lastEntry = null; continue; }
    const epMatch = line.match(EP_HEAD) || line.match(/^#{1,6}\s*第\s*(\d+)\s*集/);
    if (!inOverview && epMatch) { currentEp = Number(epMatch[1]); currentCat = ''; lastEntry = null; continue; }
    if (OVERVIEW_HEAD.test(line)) { inOverview = true; currentCat = ''; lastEntry = null; continue; }
    if (inOverview) continue; // 总览由按集清单聚合生成，云端不重复解析
    const catMatch = line.match(CAT_HEAD);
    if (catMatch) { currentCat = CAT_KEY[catMatch[1]]; lastEntry = null; continue; }
    if (!currentEp || !currentCat) continue;
    const entryMatch = line.match(ENTRY);
    if (entryMatch) {
      const name = `【${entryMatch[1].trim()}】`;
      const rest = entryMatch[2] || '';
      const reuseMatch = rest.match(/复用(?:自)?第\s*(\d+)\s*集/);
      lastEntry = {
        name,
        category: currentCat,
        episode: currentEp,
        reuseOf: reuseMatch ? Number(reuseMatch[1]) : 0,
        description: reuseMatch ? '' : rest.replace(/^（[^）]*）\s*/, '').trim(),
      };
      ensureEp(currentEp)[currentCat].push(lastEntry);
    } else if (lastEntry && !line.startsWith('#')) {
      lastEntry.description = `${lastEntry.description}${lastEntry.description ? '\n' : ''}${line}`;
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
        const existing = map.get(entry.name);
        if (existing) {
          if (!existing.episodes.includes(ep.episode)) existing.episodes.push(ep.episode);
          if (!existing.description && entry.description) existing.description = entry.description;
        } else {
          map.set(entry.name, {
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
  return [...map.values()].map((row) => ({ ...row, episodes: row.episodes.sort((a, b) => a - b) }));
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
  (assets || [])
    .filter((a) => a.category === category && (a.episodes || []).includes(episode))
    .map((a) => ({ ...a, reused: Number(a.first_episode) !== Number(episode) }));

export const buildAssetGenerationJobs = (assets, episode, categories = ['character', 'scene', 'prop']) =>
  (assets || []).filter((asset) => categories.includes(asset.category) && (asset.episodes || []).includes(episode));

export const episodeNumbersFromAssets = (assets) => {
  const set = new Set();
  for (const a of assets || []) for (const ep of a.episodes || []) set.add(ep);
  return [...set].sort((a, b) => a - b);
};

// ---------- @引用：把同角色参考资产的描述并入生图提示词 ----------
export const buildImagePrompt = (asset, refAsset, style) => {
  const parts = [];
  const settings = readAssetPrompt(asset, style);
  if (settings.prefix) parts.push(settings.prefix);
  if (style) parts.push(`画风：${style}`);
  if (refAsset) {
    const reference = readAssetPrompt(refAsset, style).content;
    parts.push(settings.mode === 'single' || !asset.category
      ? `参考角色形象（同一人物，保持脸型五官发型身材完全一致）：${refAsset.name}\n${reference}`
      : `参考资产的画风与服装设定，人物数量和构图以本次生图前置与描述为准：${refAsset.name}\n${reference}`);
    parts.push(`本次变化（服装/状态差异）：${settings.content || parseAssetName(asset.name).variant}`);
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

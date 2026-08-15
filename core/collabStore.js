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

// ---------- 资产描述固定前缀：复制即用，无需手动补充 ----------
export const CHARACTER_PROMPT_PREFIX = '真人拍摄，但不能跟现实当中任何的明星撞脸。纯白色背景，4格统一排版，左侧1格为胸像大头特写，右侧3格为全身照，严格按顺序排列：正面全身照、正面（展示穿搭 + 脚 / 腿细节）、侧面（展示身形 + 脚 / 腿侧姿）、背面（展示背影 + 脚 / 腿后侧），所有画面中的主体完全一致，面部特征完全统一、发型完全同一、服装、完全统一，身材比例完全统一。';
export const SCENE_PROMPT_PREFIX = '只要场景不要出现任何人物。';
export const PROP_PROMPT_PREFIX = '纯白色背景。';

// 给资产描述加上类别固定前缀（人物/场景/道具），已有前缀时不重复添加。
export const withAssetPrefix = (category, description = '') => {
  const prefix = category === 'character' ? CHARACTER_PROMPT_PREFIX : category === 'scene' ? SCENE_PROMPT_PREFIX : category === 'prop' ? PROP_PROMPT_PREFIX : '';
  const text = String(description || '');
  if (!prefix || text.startsWith(prefix)) return text;
  return text ? `${prefix}\n${text}` : prefix;
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
export const buildImagePrompt = (asset, refAsset, style, genre) => {
  const parts = [];
  if (style) parts.push(`画风：${style}`);
  if (genre) parts.push(`题材设定：${genre}`);
  if (refAsset) {
    parts.push(`参考角色形象（同一人物，保持脸型五官发型身材完全一致）：${refAsset.name}\n${refAsset.description || ''}`);
    parts.push(`本次变化（服装/状态差异）：${asset.description || parseAssetName(asset.name).variant}`);
    if (asset.category === 'character') parts.unshift(CHARACTER_PROMPT_PREFIX);
  } else {
    parts.push(withAssetPrefix(asset.category, asset.description || asset.name));
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

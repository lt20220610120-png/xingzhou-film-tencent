const SETTING_TITLE = /^\s*设定和小传\s*$/;
const CHINESE_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CHINESE_UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

const positiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export function chineseEpisodeNumber(value) {
  const source = String(value || '').trim();
  if (/^\d+$/.test(source)) return positiveInteger(source);
  if (!source || !/^[零〇一二两三四五六七八九十百千万]+$/.test(source)) return null;
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of source) {
    if (Object.hasOwn(CHINESE_DIGITS, character)) {
      digit = CHINESE_DIGITS[character];
      continue;
    }
    const unit = CHINESE_UNITS[character];
    if (unit === 10000) {
      total += (section + digit || 1) * unit;
      section = 0;
    } else {
      section += (digit || 1) * unit;
    }
    digit = 0;
  }
  return positiveInteger(total + section + digit);
}

export const isCollabSettingEpisode = (episode) =>
  episode?.kind === 'setting' || SETTING_TITLE.test(String(episode?.title || ''));

const identityError = (message) => Object.assign(new Error(message), { code: 'collab_episode_identity_invalid' });
const episodeLabelsAnywhere = (text) => {
  const numbers = [];
  const pattern = /第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*[集章节幕部回]|\b(?:Episode|EP)\s*([0-9]+)\b/gi;
  for (const match of String(text || '').matchAll(pattern)) {
    const number = chineseEpisodeNumber(match[1] || match[2]);
    if (number) numbers.push(number);
  }
  return numbers;
};

export function episodeNumbersInText(text) {
  const source = String(text || '').replaceAll(String.fromCharCode(13, 10), '\n').replaceAll(String.fromCharCode(13), '\n');
  const numbers = [];
  const title = /^[ \t]*(?:#{1,6}[ \t]*)?(?:第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*[集章节幕部回]|(?:Episode|EP)\s*([0-9]+)\b)/gim;
  const scene = /^[ \t]*(?:场景[ \t]*)?(\d+)[ \t]*[-—－][ \t]*\d+\b/gm;
  for (const match of source.matchAll(title)) {
    const number = chineseEpisodeNumber(match[1] || match[2]);
    if (number) numbers.push(number);
  }
  for (const line of source.split('\n')) {
    if (/^[ \t]*(?:#{1,6}[ \t]*)?(?:第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[集章节幕部回]|(?:Episode|EP)\s*[0-9]+)/i.test(line)) numbers.push(...episodeLabelsAnywhere(line));
  }
  for (const match of source.matchAll(scene)) {
    const number = positiveInteger(match[1]);
    if (number) numbers.push(number);
  }
  return [...new Set(numbers)];
}

export function collabEpisodeNumber(episode) {
  if (!episode || isCollabSettingEpisode(episode)) return null;
  const evidence = [];
  for (const field of ['episodeNumber', 'number', 'episode', 'episode_number']) {
    if (!(field in episode) || episode[field] === null || episode[field] === '') continue;
    const explicit = positiveInteger(episode[field]);
    if (!explicit) throw identityError(`分集字段 ${field} 不是有效正整数，未自动修正`);
    evidence.push(explicit);
  }
  evidence.push(...episodeLabelsAnywhere(episode.title), ...episodeNumbersInText(episode.content));
  const distinct = [...new Set(evidence)];
  if (!distinct.length) throw identityError(`分集《${String(episode.title || '未命名')}》无法确认集数：需要集号元数据、标题或 N-1 场次号`);
  if (distinct.length > 1) throw identityError(`分集《${String(episode.title || '未命名')}》集数冲突：检测到第 ${distinct.join('、')} 集`);
  return distinct[0];
}

export function listCollabEpisodes(episodes) {
  const seen = new Set();
  return (episodes || []).flatMap((episode) => {
    if (isCollabSettingEpisode(episode)) return [];
    const episodeNumber = collabEpisodeNumber(episode);
    if (seen.has(episodeNumber)) throw identityError(`协作项目存在重复的第 ${episodeNumber} 集，未按数组顺序自动重编号`);
    seen.add(episodeNumber);
    return [{ ...episode, episodeNumber }];
  });
}

export function inspectCollabEpisodes(episodes) {
  try { return { episodes: listCollabEpisodes(episodes), error: '' }; }
  catch (error) { return { episodes: [], error: error?.message || '分集编号无效' }; }
}

export function nextCollabEpisodeNumber(episodes) {
  const numbers = listCollabEpisodes(episodes).map((episode) => episode.episodeNumber);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

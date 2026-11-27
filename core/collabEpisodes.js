import episodeTitle from '../cloud-backend/shared/episode-title.json' with { type: 'json' };

const SETTING_TITLE = /^\s*设定和小传\s*$/;
const { chineseDigits, chineseUnits, metadataKeys, legacyChineseLabel, legacyEnglishLabel, markdownHeading, sceneNumber } = episodeTitle;
const LABEL = new RegExp(legacyChineseLabel + '|\\b' + legacyEnglishLabel + '\\b', 'gi');
const HEADING = new RegExp('^[ \\t]*' + markdownHeading + '(?:' + legacyChineseLabel + '|' + legacyEnglishLabel + '\\b)', 'gim');
const HEADING_PREFIX = new RegExp('^[ \\t]*' + markdownHeading + '(?:' + legacyChineseLabel + '|' + legacyEnglishLabel + ')', 'i');
export const sceneHeadingPattern = '^[ \\t]*' + markdownHeading + sceneNumber;
const SCENE = new RegExp(sceneHeadingPattern, 'gim');

const positiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export function chineseEpisodeNumber(value) {
  const source = String(value || '').trim();
  if (/^\d+$/.test(source)) return positiveInteger(source);
  if (!source || !/^[零〇一二两三四五六七八九十百千万]+$/.test(source)) return null;
  if (!/[十百千万]/.test(source)) return positiveInteger([...source].map(character => chineseDigits[character]).join(''));
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of source) {
    if (Object.hasOwn(chineseDigits, character)) {
      digit = chineseDigits[character];
      continue;
    }
    const unit = chineseUnits[character];
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
  for (const match of String(text || '').matchAll(LABEL)) {
    const number = chineseEpisodeNumber(match[1] || match[2]);
    if (number) numbers.push(number);
  }
  return numbers;
};

export function episodeNumbersInText(text) {
  const source = String(text || '').replaceAll(String.fromCharCode(13, 10), '\n').replaceAll(String.fromCharCode(13), '\n');
  const numbers = [];
  for (const match of source.matchAll(HEADING)) {
    const number = chineseEpisodeNumber(match[1] || match[2]);
    if (number) numbers.push(number);
  }
  for (const line of source.split('\n')) {
    if (HEADING_PREFIX.test(line)) numbers.push(...episodeLabelsAnywhere(line));
  }
  for (const match of source.matchAll(SCENE)) {
    const number = positiveInteger(match[1]);
    if (number) numbers.push(number);
  }
  return [...new Set(numbers)];
}

export function collabEpisodeNumber(episode) {
  if (!episode || isCollabSettingEpisode(episode)) return null;
  const evidence = [];
  for (const field of metadataKeys) {
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
  const groups=new Map(),issues=[];
  for(const [index,episode] of (Array.isArray(episodes)?episodes:[]).entries()){
    if(isCollabSettingEpisode(episode))continue;
    try{
      const number=collabEpisodeNumber(episode);
      if(!number)throw identityError('分集记录无效，请核对原文');
      if(!groups.has(number))groups.set(number,[]);
      groups.get(number).push({index,episode});
    }catch(error){issues.push({type:'invalid',number:null,message:error?.message||'分集编号无效',rows:[{index,episode}]});}
  }
  const valid=[];
  for(const [number,rows] of groups){
    if(rows.length>1)issues.push({type:'duplicate',number,message:`协作项目存在重复的第 ${number} 集，未按数组顺序自动重编号`,rows});
    else valid.push({...rows[0].episode,episodeNumber:number});
  }
  issues.sort((a,b)=>a.rows[0].index-b.rows[0].index);
  return {episodes:valid,error:issues.map(issue=>issue.message).join('；'),issues};
}

export function analysisEpisodes(episodes, targets) {
  const available = inspectCollabEpisodes(episodes).episodes;
  if (!targets?.length) return available;
  const requested = new Set(targets.map(Number));
  const selected = available.filter(episode => requested.has(episode.episodeNumber));
  if (selected.length !== requested.size) throw identityError('所选分集编号存在冲突或已变化，请核对所选分集');
  return selected;
}

export function nextCollabEpisodeNumber(episodes) {
  const numbers = listCollabEpisodes(episodes).map((episode) => episode.episodeNumber);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

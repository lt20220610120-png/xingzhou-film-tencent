// ============================================================
// scriptImport.js — 剧本分集导入
// ============================================================

import {sceneHeadingPattern} from './collabEpisodes.js';

const episodeHeading = /^(?:第\s*[零〇一二两三四五六七八九十百千万\d]+\s*(?:[集章节幕部]|回(?!合))|(?:Episode\s+|EP\s*)\d+\b)/i;
const explicitEpisodeHeading = (line) => /^【[^】]+】$/.test(line) && episodeHeading.test(line.slice(1,-1).trim());
const heading = new RegExp(sceneHeadingPattern);
const sceneHeadingInText = new RegExp(sceneHeadingPattern, 'm');

export const parseDirectorScenes = (text, episodeNumber = 1) => {
  const source = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];
  const lines = source.split('\n');
  const starts = [];
  lines.forEach((line, index) => { const match = line.match(heading); if (match) starts.push({ index, sourceSceneNumber: Number(match[3]) }); });
  if (!starts.length) return [{ label: `${episodeNumber}-1`, content: source }];
  const preface = lines.slice(0, starts[0].index).join('\n').trim();
  const scenes = [];
  if (preface && starts[0].sourceSceneNumber > 1) scenes.push({ content: preface });
  starts.forEach((start, sourceIndex) => {
    const from = sourceIndex === 0 && preface && start.sourceSceneNumber === 1 ? 0 : start.index;
    const body = lines.slice(from, starts[sourceIndex + 1]?.index ?? lines.length).join('\n').trim();
    scenes.push({ content: body });
  });
  return scenes.filter(scene => scene.content).map((scene, sceneIndex) => ({ label: `${Number(episodeNumber)}-${sceneIndex + 1}`,
    content: scene.content.replace(sceneHeadingInText, (prefix, _episode, dash) =>
      prefix.replace(/\d+[ \t]*[-—－–][ \t]*\d+$/, () => String(Number(episodeNumber)) + dash + String(sceneIndex + 1))) }));
};

// 协作分镜是导演工作台的只读镜像：保留导演端已有的集号、场景号和原文，绝不重编号。
export const parseDirectorScenesReadonly = (text, fallbackEpisodeNumber = 1) => {
  const source = String(text || '').replaceAll(String.fromCharCode(13, 10), '\n').replaceAll(String.fromCharCode(13), '\n').trim();
  if (!source) return [];
  const lines = source.split('\n');
  const starts = [];
  lines.forEach((line, index) => { const match = line.match(heading); if (match) starts.push({ index, label: `${Number(match[1])}-${Number(match[3])}` }); });
  if (!starts.length) return [{ label: `${Number(fallbackEpisodeNumber)}-1`, content: source }];
  const preface = lines.slice(0, starts[0].index).join('\n').trim();
  return starts.map((start, index) => {
    const body = lines.slice(start.index, starts[index + 1]?.index ?? lines.length).join('\n').trim();
    return { label: start.label, content: index === 0 && preface ? `${preface}\n\n${body}` : body };
  });
};

export const inferDirectorEpisodeNumber = (episode, fallback = 1) => {
  const contentMatch = String(episode?.content || '').match(sceneHeadingInText);
  return contentMatch ? Number(contentMatch[1]) : Number(fallback);
};

// 总剧本一级结构：第一集之前的全部内容单独归入“设定和小传”。
export const parseMasterScript = (text) => {
  const source = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return { setting: '', episodes: [] };
  const lines = source.split('\n');
  const starts = [];
  const explicit=lines.some(line=>explicitEpisodeHeading(line.trim()));
  lines.forEach((line, index) => { const wrapped=line.trim().match(/^【([^】]+)】$/),title=wrapped?wrapped[1].trim():line.trim(); if ((!explicit||wrapped)&&episodeHeading.test(title)) starts.push({ index, title }); });
  if (!starts.length) return { setting: source, episodes: [{ title: '设定和小传', content: source, kind: 'setting' }] };
  const setting = lines.slice(0, starts[0].index).join('\n').trim();
  return {
    setting,
    episodes: [{ title: '设定和小传', content: setting, kind: 'setting' }, ...starts.map((start, i) => ({ title: start.title, content: lines.slice(start.index + 1, starts[i + 1]?.index ?? lines.length).join('\n').trim(), kind: 'episode' }))],
  };
};

export const replaceMasterSetting = (text, setting) => {
  const source = String(text || '').replaceAll(String.fromCharCode(13, 10), '\n').replaceAll(String.fromCharCode(13), '\n').trim();
  const lines=source.split('\n');
  const explicit=lines.some(line=>explicitEpisodeHeading(line.trim()));
  const firstEpisode=lines.findIndex(line=>explicit ? explicitEpisodeHeading(line.trim()) : episodeHeading.test(line.trim()));
  const episodeText=firstEpisode>=0 ? lines.slice(firstEpisode).join('\n').trim() : '';
  return [String(setting || '').trim(), episodeText].filter(Boolean).join('\n\n');
};

export const splitFullScript = (text) => {
  if (!text || typeof text !== 'string') return { masterScript: '', detected: false, episodes: [] };
  const patterns = [episodeHeading, /^\d+[\.、．，,）\)]\s*/, /^[零〇一二两三四五六七八九十百千万]+[、．\.]\s*/];
  const lines = text.split('\n'); const episodes = []; let currentTitle = ''; let currentContent = [];
  const explicit=lines.some(line=>explicitEpisodeHeading(line.trim()));
  for (const line of lines) {
    const trimmed = line.trim().replace(/^【([^】]+)】$/, '$1').trim();
    if (!trimmed) { if (currentContent.length > 0) currentContent.push(''); continue; }
    let matched = false;
    for (const pattern of patterns) if ((!explicit||/^【[^】]+】$/.test(line.trim()))&&pattern.test(trimmed)) {
      if (currentContent.length > 0) episodes.push({ title: currentTitle || `分集 ${episodes.length + 1}`, content: currentContent.join('\n').trim() });
      currentTitle = trimmed; currentContent = []; matched = true; break;
    }
    if (!matched) currentContent.push(trimmed);
  }
  if (currentContent.length > 0) episodes.push({ title: currentTitle || `分集 ${episodes.length + 1}`, content: currentContent.join('\n').trim() });
  if (episodes.length === 0 && text.trim()) episodes.push({ title: '完整剧本', content: text.trim() });
  return { masterScript: text.trim(), detected: episodes.length > 1 || episodes.some(ep => episodeHeading.test(ep.title)), episodes };
};

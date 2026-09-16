const {randomUUID} = require('node:crypto');
const {lockDirectorReferences} = require('./director-source.cjs');
const isSetting = episode => episode.kind === 'setting' || episode.title === '设定和小传';
const conflict = message => Object.assign(new Error(message), {status: 409});
const invalid = message => Object.assign(new Error(message), {status: 400});
const INTERNAL_GENRE = /\[(?:COLLAB_PROJECT|DIRECTOR_PROJECT|PROJECT_LOCKED|COLLAB_SOURCE|RECYCLE_UNTIL)(?::[^\]]*)?\]/g;
const publicGenre = value => String(value || '').replace(INTERNAL_GENRE, '').trim();
function collabGenre(value, original = '') {
  const markers = String(original || '').match(INTERNAL_GENRE) || [];
  return [publicGenre(value), '[COLLAB_PROJECT]', ...markers.filter(marker => marker !== '[COLLAB_PROJECT]' && marker !== '[DIRECTOR_PROJECT]')].filter(Boolean).join('\n');
}
function editableCollab(row) {
  if (!row || String(row.genre || '').includes('[DIRECTOR_PROJECT]')) return false;
  if (String(row.genre || '').includes('[PROJECT_LOCKED]')) throw Object.assign(new Error('项目已锁定，暂不可编辑'), {status: 423});
  if (row.deleted_at || String(row.genre || '').includes('[RECYCLE_UNTIL:')) throw Object.assign(new Error('项目已删除，请先恢复'), {status: 410});
  return true;
}

async function ensureCollabDomain(client, row, uid) {
  if (!editableCollab(row)) return null;
  if (String(row.genre || '').includes('[COLLAB_PROJECT]')) return row;
  if (!await lockDirectorReferences(client, row, uid)) return null;
  const genre = collabGenre(row.genre, row.genre);
  await client.query('update collab_projects set genre=$2,updated_at=now() where id=$1', [row.id, genre]);
  return {...row, genre};
}

const NUMBER_TOKEN = '[\\d零〇一二两三四五六七八九十百千]+';
function parseNumber(value) {
  const token = String(value ?? '').trim();
  if (/^\d+$/.test(token)) return Number(token);
  const digits = {'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if (!token || !/^[零〇一二两三四五六七八九十百千]+$/.test(token)) return 0;
  if (!/[十百千]/.test(token)) return Number([...token].map(c=>digits[c]).join(''));
  let total=0, digit=0, previousUnit=Infinity;
  for (const char of token) {
    if (char in digits) digit=digits[char];
    else {
      const unit=({'十':10,'百':100,'千':1000})[char];
      if(unit>=previousUnit)return 0;
      total+=(digit||1)*unit; digit=0; previousUnit=unit;
    }
  }
  return total+digit;
}
function explicitNumbers(text) {
  const pattern = new RegExp('第\\s*('+NUMBER_TOKEN+')\\s*集|\\b(?:Episode|EP)\\s*('+NUMBER_TOKEN+')(?![A-Za-z0-9])','gi');
  return [...String(text||'').matchAll(pattern)].map(m=>parseNumber(m[1]||m[2]));
}
function unitHeaders(text) {
  const units=[];
  for (const raw of String(text||'').split(/\r?\n/)) {
    const line=raw.trim().replace(/^(?:(?:#{1,6}|[-*•>]|\d+[.)])\s*)+/, '').replace(/^\*\*|\*\*$/g,'');
    // Only structural headings (not a character's dialogue mentioning a chapter).
    if(!/^(?:第\s*\S+?\s*[集章幕部回节]|(?:Episode|EP|Chapter|Act|Part|Section)(?=\s|[\d零〇一二两三四五六七八九十百千IVXLCDM]))/i.test(line))continue;
    const pattern=/(?:第|[兼及和与/／、])\s*([\d零〇一二两三四五六七八九十百千IVXLCDM]+)\s*(集|章|幕|部|回|节)|\b(Episode|EP|Chapter|Act|Part|Section)\s*([\d零〇一二两三四五六七八九十百千IVXLCDM]+)(?![A-Za-z0-9])/gi;
    let matches=0;
    for(const match of line.matchAll(pattern)) {
      matches++;
      units.push({kind:match[2]==='集'||/^(?:Episode|EP)$/i.test(match[3]||'')?'episode':'other',number:parseNumber(match[1]||match[4]),raw});
    }
    if(!matches)units.push({kind:'other',number:0,raw});
  }
  return units;
}
function episodeNumber(episode) {
  if (!episode || isSetting(episode)) return 0;
  if(unitHeaders(episode.title).length>1||unitHeaders(episode.content).length>1)return 0;
  const numbers=[];
  for(const key of ['episodeNumber','number','episode','episode_number']) {
    if(episode[key] !== undefined && episode[key] !== null && episode[key] !== '') {
      const token=String(episode[key]).trim();
      numbers.push(/^\d+$/.test(token)?Number(token):0);
    }
  }
  numbers.push(...explicitNumbers(episode.title),...unitHeaders(episode.title).map(unit=>unit.number));
  for(const unit of unitHeaders(episode.content))numbers.push(unit.number,...explicitNumbers(unit.raw));
  numbers.push(...[...String(episode.content||'').matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(?:场景[ \t]*)?(\d+)[ \t]*[-—－][ \t]*\d+/gm)].map(m=>Number(m[1])));
  return numbers.length && numbers.every(n=>Number.isInteger(n)&&n>0&&n<=10000&&n===numbers[0]) ? numbers[0] : 0;
}
function numberedEpisodes(episodes = []) {
  const seen=new Set();
  return (Array.isArray(episodes)?episodes:[]).filter(ep=>ep&&!isSetting(ep)).map(episode=>{
    const number=episodeNumber(episode);
    if(!number||seen.has(number))throw invalid('分集编号无法可靠解析、相互矛盾或重复，请核对原文编号');
    seen.add(number); return {episode,number};
  });
}

function episodeText(episode) {
  const number=episodeNumber(episode), title=String(episode.title||'');
  const heading=episodeNumber({title})===number?title:`第${number}集${title?` ${title}`:''}`;
  const body=String(episode.content||'');
  return unitHeaders(body.split(/\r?\n/)[0]).some(unit=>unit.kind==='episode'&&unit.number===number)?body:`${heading}\n${body}`;
}

function appendArtEpisodeSnapshot(row, payload) {
  const number = Number(payload.episodeNumber);
  const content = String(payload.content || '').trim();
  const title = String(payload.title || `第${number}集`).trim();
  if (!Number.isInteger(number) || number < 1 || number > 10000) throw invalid('集数必须是 1—10000 的整数');
  if (!content || content.length > 500000 || !title || title.length > 200) throw invalid('请输入有效的本集标题和剧本内容');
  const units=unitHeaders(content);
  if (episodeNumber({episodeNumber:number,title,content})!==number || units.length>1 || unitHeaders(title).length>1) {
    throw invalid('剧本或标题中的集数与所选集数不一致，请只添加指定一集');
  }
  const indexed = numberedEpisodes(row.episodes);
  const same = indexed.filter(entry => entry.number === number);
  if (same.length) {
    if (same.length === 1 && same[0].episode.collabOnly && same[0].episode.title === title && same[0].episode.content === content) return row;
    throw conflict(`第${number}集已存在，请刷新核对，不会覆盖已有剧本`);
  }
  if (number <= Math.max(0, ...indexed.map(entry => entry.number))) throw conflict('新增集数必须排在现有分集之后');
  const episode = {id: randomUUID(), episodeNumber: number, number, title, content, kind: 'episode', prompts: [], collabOnly: true, origin: 'collab-art'};
  return {...row, script: [String(row.script || '').trimEnd(), episodeText(episode)].filter(Boolean).join('\n\n'), episodes: [...(row.episodes || []), episode]};
}

function composeDirectorScript(script, current = [], incoming = []) {
  script=String(script||'');
  const local=numberedEpisodes(current).filter(entry=>entry.episode.collabOnly);
  if(!local.length)return script;
  const replaced=new Set(local.map(entry=>entry.number)), headings=[];
  for(const match of script.matchAll(/[^\n]*(?:\n|$)/g)) {
    if(!match[0])continue;
    const units=unitHeaders(match[0]);
    if(!units.length)continue;
    if(units.length!==1||units[0].kind!=='episode'||!units[0].number
      ||episodeNumber({title:match[0]})!==units[0].number)
      throw conflict('源剧本存在无法可靠分段的混排分集，已保留双方原稿');
    headings.push({index:match.index,number:units[0].number});
  }
  const collisions=numberedEpisodes(incoming).filter(entry=>replaced.has(entry.number));
  for(const entry of collisions) {
    if(headings.filter(heading=>heading.number===entry.number).length!==1)
      throw conflict(`第${entry.number}集与协作独立分集冲突，源剧本无法可靠分段，已保留双方原稿`);
  }
  const sections=[{number:0,text:script.slice(0,headings[0]?.index??script.length)}];
  for(let index=0;index<headings.length;index++) {
    const heading=headings[index], text=script.slice(heading.index,headings[index+1]?.index??script.length);
    if(replaced.has(heading.number)) {
      if(episodeNumber({episodeNumber:heading.number,content:text})!==heading.number)
        throw conflict('源剧本存在无法可靠替换的混排分集，已保留双方原稿');
    } else sections.push({number:heading.number,text});
  }
  for(const entry of local) {
    const before=sections.findIndex(section=>section.number>entry.number), section={number:entry.number,text:episodeText(entry.episode)};
    if(before<0)sections.push(section);else sections.splice(before,0,section);
  }
  return sections.filter(section=>section.text).reduce((text,section)=>text+(text&&!text.endsWith('\n\n')?'\n\n':'')+section.text,'');
}

module.exports = {parseNumber, unitHeaders, episodeNumber, numberedEpisodes, appendArtEpisodeSnapshot, composeDirectorScript, publicGenre, collabGenre, editableCollab, ensureCollabDomain};

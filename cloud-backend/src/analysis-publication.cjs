const {unitHeaders, episodeNumber, parseNumber} = require('./collab-episodes.cjs');
const invalid = () => Object.assign(new Error('分析结果格式不正确，必须只包含本集的三类完整清单和合法资产'), {status:400});
const episodeToken = value => (typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value.trim()))&&Number.isInteger(Number(value))&&Number(value)>0&&Number(value)<=10000?Number(value):0;
const CATEGORIES = {人物:'character', 场景:'scene', 道具:'prop'};
const HARD_NON_VISUAL_ASSET = /(?:仅|只有|只以)(?:声音|画外音)|只闻其声|未(?:实际|实体)?出镜|未见(?:实际|实体)?出镜|不(?:实际|实体)?出镜|无实体(?:形象)?|不存在可见实体|无画面/;
const NON_VISUAL = /不生成(?:形象)?资产|不输出人物资产|不生成人物(?:形象|资产)?|仅提及|仅被提及|仅声音|声音出场|仅画外|画外音|只闻其声|(?:系统|机械|电话|电子)音|\bV\.?O\.?\b|\bO\.?S\.?\b|旁白|无法确认|未见出镜|未出镜|无实体(?:形象)?|不存在可见实体|无画面|脑海中?响起/iu;
const VISIBLE = /实际出镜|实体出镜|画面(?:中)?出现|拟人(?:化)?角色|具有人形|群演|换装/;
const stripNegatedVisibleTerms = value => String(value||'').replace(/(?:不具有人形|无需换装|无须换装|不换装|未换装|非拟人(?:化)?角色|不是拟人(?:化)?角色|(?:未|不|没有)(?:实际|实体)?出镜)/g,'');
const positiveVisible = value => VISIBLE.test(stripNegatedVisibleTerms(value));
const positiveAnthropomorphic = value => /拟人(?:化)?角色|具有人形/.test(stripNegatedVisibleTerms(value));
const HUMAN_FIELD = /(?:脸型(?:与)?五官|脸型|五官|眉眼|鼻型|鼻梁|唇形|发型(?:发色)?|发色|身材(?:比例|体态)?|体态|肤色(?:肤质)?|肤质|服装(?:与鞋履)?|穿着|妆造(?:与固定配饰)?)[：:]([^；;\n。！？]+)/g;
const OBJECT_VISUAL = /外观[：:]|材质[：:]|尺寸[：:]|大小感[：:]|屏幕|英寸|边框|玻璃面板|金属机身|机身|科技界面|提示界面|来电界面|界面|UI|面板|矩形|智能手机|设备主体|按键|镜头|接口|型号|图标|提示框/gi;
function visibleHuman(text) {
  const fields=[...text.matchAll(HUMAN_FIELD)];
  if(fields.length){
    const applicable=fields.filter(([,value])=> !/^(?:不适用|无|不存在|非人物|N\/?A)/i.test(value.trim())&&!/(?:英寸|矩形|机身|屏幕|界面|面板|设备|手机壳)/i.test(value));
    const hasWardrobeOrMakeup=applicable.some(([field])=>/^(?:服装|穿着|妆造)/.test(field));
    const objectEvidence=new Set(text.match(OBJECT_VISUAL)||[]).size;
    return applicable.length>=2||(hasWardrobeOrMakeup&&objectEvidence<2);
  }
  return (text.match(/脸型|五官|眉眼|鼻型|鼻梁|唇形|发型|发色|身材|体态|肤色|肤质|服装|妆造|人物参考图/g)||[]).length>=2;
}
function classifyEntry(entry) {
  if(['character','prop'].includes(entry.category)&&HARD_NON_VISUAL_ASSET.test(entry.raw))return {...entry,generatable:false};
  if(entry.category!=='character')return entry;
  const text=entry.raw, visible=positiveVisible(text), anthropomorphic=positiveAnthropomorphic(text), human=visibleHuman(text);
  // "Not a character asset" may describe a visible panel; voice/no-body evidence
  // cannot be rescued merely by generic object appearance fields.
  const evidence=(entry.name+' '+text).replace(/不输出人物资产|不生成人物(?:形象|资产)?/g,'');
  if(NON_VISUAL.test(evidence)&&!anthropomorphic&&!(visible&&human))return {...entry,generatable:false};
  if(!anthropomorphic&&!human&&new Set(text.match(OBJECT_VISUAL)||[]).size>=2)return {...entry,category:'prop'};
  if(NON_VISUAL.test(entry.name+' '+text)&&!anthropomorphic&&!(visible&&human))return {...entry,generatable:false};
  const reference=text.match(/参考【([^】]+)】/)?.[1]||'';
  const characterBase=name=>String(name||'').replace(/^【|】$/g,'').trim().split('-')[0].trim();
  const sameCharacterReference=reference&&characterBase(reference)===characterBase(entry.name);
  return {...entry,generatable:Boolean(visible||human||entry.reuseOf||sameCharacterReference)};
}
function parsePublicationOutput(output, number) {
  if(typeof output!=='string'||!output.trim()||output.length>500000)throw invalid();
  const units=unitHeaders(output);
  if(units.length!==1||units[0].kind!=='episode'||units[0].number!==number)throw invalid();
  const entries=[], categories=new Map();
  let inEpisode=false, category='', last=null;
  for(const raw of output.split(/\r?\n/)) {
    const line=raw.trim();
    if(!line||/^```(?:markdown|text)?$/.test(line))continue;
    if(unitHeaders(line).length) {
      if(inEpisode||episodeNumber({title:line})!==number)throw invalid();
      inEpisode=true; category=''; last=null; continue;
    }
    const cat=line.match(/^(?:#{1,6}\s*)?(人物|场景|道具)[：:]\s*$/);
    if(cat) {
      if(!inEpisode||categories.has(cat[1]))throw invalid();
      category=CATEGORIES[cat[1]];categories.set(cat[1],{entries:0,empty:false});last=null;continue;
    }
    if(!inEpisode||!category)throw invalid();
    const state=categories.get(Object.keys(CATEGORIES).find(key=>CATEGORIES[key]===category));
    if(/^[-*•]?\s*无(?:[（(][^）)]*[）)])?\s*$/.test(line)) {
      if(state.entries||state.empty)throw invalid();
      state.empty=true;last=null;continue;
    }
    const field=/^(?:[-*•]\s*)?【(?:内层|中层|外层|下装|足饰|推断|待确认)】/.test(line);
    const entry=field?null:line.match(/^[-*•]\s*(【[^】]+】)\s*(.*)$/);
    if(entry) {
      if(state.empty||/^【\s*】$/.test(entry[1]))throw invalid();
      const rest=entry[2], reuse=[...rest.matchAll(/复用(?:自)?第\s*([\d零〇一二两三四五六七八九十百千]+)\s*集/g)].map(m=>parseNumber(m[1]));
      if(reuse.some(n=>!n||n>=number||n!==reuse[0]))throw invalid();
      last={name:`【${entry[1].slice(1,-1).trim()}】`,category,episode:number,reuseOf:reuse[0]||0,description:rest,raw:rest};
      entries.push(last);state.entries++;
    } else {
      if(!last||line.startsWith('#')||(/^[-*•]/.test(line)&&!field))throw invalid();
      last.description+='\n'+line;last.raw+='\n'+line;
    }
  }
  if(categories.size!==3||[...categories.values()].some(c=>!c.empty&&!c.entries))throw invalid();
  return entries.map(entry=>{
    const reuse=[...entry.raw.matchAll(/复用(?:自)?第\s*([\d零〇一二两三四五六七八九十百千]+)\s*集/g)].map(m=>parseNumber(m[1]));
    if(reuse.some(n=>!n||n>=number||n!==reuse[0]))throw invalid();
    return classifyEntry({...entry,reuseOf:reuse[0]||0});
  });
}
function validatePublicationAssets(items, parsed, number) {
  if(!Array.isArray(items)||items.length>5000)throw invalid();
  const whitelist=new Map(), seen=new Set();
  for(const entry of parsed) {
    if(entry.generatable===false)continue;
    const key=entry.category+'\0'+entry.name;
    if(whitelist.has(key)){if(whitelist.get(key).reuseOf!==entry.reuseOf)throw invalid();continue;}
    whitelist.set(key,entry);
  }
  return items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.name!=='string'||!['character','scene','prop'].includes(item.category)||seen.has(item.name))throw invalid();
    const entry=whitelist.get(item.category+'\0'+item.name);
    if(!entry||['episode','episodeNumber','number','episode_number'].some(key=>item[key]!==undefined&&episodeToken(item[key])!==number))throw invalid();
    if(item.episodes!==undefined&&(!Array.isArray(item.episodes)||item.episodes.length!==1||episodeToken(item.episodes[0])!==number))throw invalid();
    if(item.description!==undefined&&(typeof item.description!=='string'||item.description.length>500000))throw invalid();
    if(item.first_episode!==undefined&&(!episodeToken(item.first_episode)||episodeToken(item.first_episode)>number))throw invalid();
    seen.add(item.name);return {...item,entry};
  });
}
function publicationFirstEpisode(item, existing, number) {
  const old=existing.find(asset=>asset.name===item.name);
  if(old&&old.category!==item.category&&!(old.category==='character'&&item.category==='prop'))throw invalid();
  const prior=old?[old.first_episode,...(old.episodes||[])].map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=10000):[];
  const reuse=item.entry.reuseOf;
  if(reuse&&(!old||!prior.includes(reuse)))throw invalid();
  if(item.reuseOf!==undefined&&Number(item.reuseOf)!==reuse)throw invalid();
  const first=Math.min(number,...prior,...(reuse?[reuse]:[]));
  if(item.first_episode!==undefined&&![number,first,...(reuse?[reuse]:[])].includes(Number(item.first_episode)))throw invalid();
  return first;
}
function mergePublicationOutput(existing, output, number) {
  existing=String(existing||'');
  const headings=[];
  for(const match of existing.matchAll(/[^\n]*(?:\n|$)/g)) {
    if(unitHeaders(match[0]).some(unit=>unit.kind==='episode'))headings.push({index:match.index,number:episodeNumber({title:match[0]})});
  }
  const kept=[existing.slice(0,headings[0]?.index??existing.length)];
  headings.forEach((heading,index)=>{if(heading.number!==number)kept.push(existing.slice(heading.index,headings[index+1]?.index??existing.length));});
  kept.push(output);
  return kept.filter(Boolean).reduce((text,section)=>text+(text&&!text.endsWith('\n\n')?'\n\n':'')+section,'');
}
module.exports={parsePublicationOutput,validatePublicationAssets,publicationFirstEpisode,mergePublicationOutput};

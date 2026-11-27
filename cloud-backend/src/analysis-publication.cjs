const {unitHeaders, episodeNumber, parseNumber} = require('./collab-episodes.cjs');
const {chineseLabel} = require('../shared/episode-title.json');
const artRules = require('../shared/art-asset-rules.json');
const invalid = () => Object.assign(new Error('分析结果格式不正确，必须只包含本集的三类完整清单和合法资产'), {status:400});
const episodeToken = value => (typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value.trim()))&&Number.isInteger(Number(value))&&Number(value)>0&&Number(value)<=10000?Number(value):0;
const CATEGORIES = {人物:'character', 场景:'scene', 道具:'prop'};
const HARD_NON_VISUAL_ASSET = new RegExp(artRules.nonvisualAsset);
const NON_VISUAL = new RegExp(artRules.nonvisualCharacter,'iu');
const VISIBLE = new RegExp(artRules.visibleCharacter);
const ANTHROPOMORPHIC = new RegExp(artRules.anthropomorphicCharacter);
const NEGATED_CHARACTER = new RegExp(artRules.negatedCharacter,'g');
const stripNegatedVisibleTerms = value => String(value||'').replace(NEGATED_CHARACTER,'');
const positiveVisible = value => VISIBLE.test(stripNegatedVisibleTerms(value));
const positiveAnthropomorphic = value => ANTHROPOMORPHIC.test(stripNegatedVisibleTerms(value));
const HUMAN_FIELD = new RegExp(artRules.humanField,'g');
const HUMAN_DESCRIPTION = new RegExp(artRules.humanDescription,'g');
const OBJECT_VISUAL = new RegExp(artRules.objectVisualDescription,'gi');
const INAPPLICABLE_HUMAN_FIELD = new RegExp(artRules.inapplicableHumanField,'i');
const OBJECT_LIKE_HUMAN_FIELD = new RegExp(artRules.objectLikeHumanField,'i');
const CHARACTER_ATTRIBUTE_FRAGMENT = new RegExp(artRules.characterAttributeFragment,'i');
const CONTINUATION_FIELD = new RegExp(artRules.continuationField);
const REUSE_EPISODE = new RegExp('复用(?:自)?'+chineseLabel,'g');
const creaturePatterns = Object.fromEntries(['inanimateCreatureName','explicitCreature','explicitHumanForm','creatureDescription','creatureName','creatureSubject']
 .map(key=>[key,new RegExp(artRules[key])]));
const negatedHumanForm = new RegExp(artRules.negatedHumanForm,'g');
function isCreature(name,text) {
  if(creaturePatterns.inanimateCreatureName.test(name))return false;
  const content=text.includes('【资产描述】')?text.split('【资产描述】').at(-1):text;
  if(creaturePatterns.explicitCreature.test(content))return true;
  if(creaturePatterns.explicitHumanForm.test(content.replace(negatedHumanForm,'')))return false;
  if(creaturePatterns.creatureDescription.test(content))return true;
  return creaturePatterns.creatureName.test(name.replace(/[【】]/g,''))||creaturePatterns.creatureSubject.test(content);
}
function visibleHuman(text) {
  const fields=[...text.matchAll(HUMAN_FIELD)];
  if(fields.length){
    const applicable=fields.filter(([,value])=> !INAPPLICABLE_HUMAN_FIELD.test(value.trim())&&!OBJECT_LIKE_HUMAN_FIELD.test(value));
    const hasWardrobeOrMakeup=applicable.some(([field])=>/^(?:服装|穿着|妆造)/.test(field));
    const objectEvidence=new Set(text.match(OBJECT_VISUAL)||[]).size;
    return applicable.length>=2||(hasWardrobeOrMakeup&&objectEvidence<2);
  }
  return (text.match(HUMAN_DESCRIPTION)||[]).length>=2;
}
function classifyEntry(entry) {
  if(['character','prop'].includes(entry.category)&&HARD_NON_VISUAL_ASSET.test(entry.raw))return {...entry,generatable:false};
  if(entry.category!=='character')return entry;
  const text=entry.raw, visible=positiveVisible(text), anthropomorphic=positiveAnthropomorphic(text), human=visibleHuman(text);
  const creature=isCreature(entry.name,text);
  if(!anthropomorphic&&!human&&!creature&&new Set(text.match(OBJECT_VISUAL)||[]).size>=2)return {...entry,category:'prop'};
  if(NON_VISUAL.test(entry.name+' '+text)&&!anthropomorphic&&!(visible&&human))return {...entry,generatable:false};
  const reference=text.match(/参考【([^】]+)】/)?.[1]||'';
  const characterBase=name=>String(name||'').replace(/^【|】$/g,'').trim().split('-')[0].trim();
  const sameCharacterReference=reference&&characterBase(reference)===characterBase(entry.name);
  return {...entry,generatable:Boolean(visible||human||creature||entry.reuseOf||sameCharacterReference)};
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
    const field=CONTINUATION_FIELD.test(line);
    const entry=field?null:line.match(/^[-*•]\s*(【[^】]+】)\s*(.*)$/);
    const attribute=entry?.[1].slice(1,-1).trim();
    if(category==='character'&&attribute&&attribute.length<=36&&CHARACTER_ATTRIBUTE_FRAGMENT.test(attribute)){
      if(last){
        const value=entry[2].replace(/^（[^）]*）\s*/,'').trim();
        const fragment=attribute+(value?'：'+value:'');
        last.raw+='\n'+fragment;last.description+='\n'+fragment;
      }
      continue;
    }
    if(entry) {
      if(state.empty||/^【\s*】$/.test(entry[1]))throw invalid();
      const rest=entry[2], reuse=[...rest.matchAll(REUSE_EPISODE)].map(m=>parseNumber(m[1]));
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
    const reuse=[...entry.raw.matchAll(REUSE_EPISODE)].map(m=>parseNumber(m[1]));
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

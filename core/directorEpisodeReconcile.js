import {parseDirectorScenes} from './scriptImport.js';

const normalize = value => String(value ?? '').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
const kind = episode => episode?.kind === 'setting' || episode?.title === '设定和小传' ? 'setting' : 'episode';
const identity = episode => JSON.stringify([kind(episode),normalize(episode.title),normalize(episode.content)]);
const contentIdentity = episode => JSON.stringify([kind(episode),normalize(episode.content)]);
const titleIdentity = episode => JSON.stringify([kind(episode),normalize(episode.title)]);
const counts = (episodes,key) => {const result=new Map();episodes.forEach(ep=>{const value=key(ep);result.set(value,(result.get(value)||0)+1);});return result;};
const numbered = episodes => {let number=0;return episodes.map(ep=>kind(ep)==='setting'?0:++number);};

// Matching is based on unique evidence, never on array position. Detached old
// prompts/plans are archived at project level by updateDirectorProject.
export function reconcileDirectorEpisodes(previousEpisodes=[],parsedEpisodes=[]) {
  const previous=previousEpisodes.filter(Boolean),parsed=parsedEpisodes.filter(Boolean),used=new Set(),conflicts=[],invalidated=new Set();
  const previousNumbers=numbered(previous),nextNumbers=numbered(parsed);
  const previousCounts=[identity,contentIdentity,titleIdentity].map(key=>counts(previous,key));
  const nextCounts=[identity,contentIdentity,titleIdentity].map(key=>counts(parsed,key));
  const settingChanged=normalize(previous.find(ep=>kind(ep)==='setting')?.content)!==normalize(parsed.find(ep=>kind(ep)==='setting')?.content);
  const episodes=parsed.map((item,index)=>{
    let match=-1;
    if(item.id && previous.filter(ep=>ep.id===item.id).length===1 && parsed.filter(ep=>ep.id===item.id).length===1)match=previous.findIndex(ep=>ep.id===item.id && kind(ep)===kind(item));
    if(match<0){
      for(const [n,key] of [identity,contentIdentity,titleIdentity].entries()){
        if(n===2 && !normalize(item.title))continue;
        const value=key(item);
        if(previousCounts[n].get(value)===1 && nextCounts[n].get(value)===1){match=previous.findIndex((ep,i)=>!used.has(i)&&key(ep)===value);if(match>=0)break;}
      }
    }
    if(match<0 || used.has(match)){
      const candidates=previous.filter(ep=>identity(ep)===identity(item) || titleIdentity(ep)===titleIdentity(item));
      if(candidates.length)conflicts.push({type:'episode-identity',title:item.title || '',previousEpisodeIds:candidates.map(ep=>ep.id),message:'分集身份有歧义，旧历史已保留，未按位置继承计划'});
      return {...item,id:item.id && !previous.some(ep=>ep.id===item.id) ? item.id : crypto.randomUUID(),prompts:item.prompts || []};
    }
    used.add(match);const old=previous[match];
    const oldScenes=parseDirectorScenes(old.content,previousNumbers[match] || 1),newScenes=parseDirectorScenes(item.content,nextNumbers[index] || 1);
    const safeLabels=new Set(newScenes.filter(scene=>oldScenes.some(oldScene=>oldScene.label===scene.label && oldScene.content===scene.content)).map(scene=>scene.label));
    const quickSceneEdits=Object.fromEntries(Object.entries(old.quickSceneEdits || {}).filter(([label])=>safeLabels.has(label)));
    const activeQuickScenePlanIds={};
    for(const [label,planId] of Object.entries(old.activeQuickScenePlanIds || {})){
      const plan=(old.quickScenePlans || []).find(p=>p.id===planId),scene=newScenes.find(scene=>scene.label===label);
      const input=Object.hasOwn(quickSceneEdits,label)?String(quickSceneEdits[label] ?? ''):scene?.content;
      if(!settingChanged && safeLabels.has(label) && plan && plan.sceneLabel===label && plan.sourceSnapshot===input)activeQuickScenePlanIds[label]=planId;
      else if(planId)invalidated.add(planId);
    }
    const removedEdits=Object.fromEntries(Object.entries(old.quickSceneEdits || {}).filter(([label])=>!safeLabels.has(label)));
    return {...old,...item,id:old.id,prompts:old.prompts || [],quickScenePlans:old.quickScenePlans,
      quickSceneEdits,activeQuickScenePlanIds,
      ...(Object.keys(removedEdits).length?{quickSceneEditHistory:[...(old.quickSceneEditHistory || []),{episodeContent:old.content,edits:removedEdits}]}:{}),
    };
  });
  previous.forEach((episode,index)=>{if(!used.has(index))Object.values(episode.activeQuickScenePlanIds || {}).filter(Boolean).forEach(id=>invalidated.add(id));});
  return {episodes,invalidatedPlanIds:[...invalidated],conflicts};
}

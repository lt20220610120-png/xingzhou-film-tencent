const keys=['profileId','model','ratio','duration','resolution','libtvMode','libtvParams'];
function settingsFor(ep,label){const all=ep.storyboardDefaultSettings||{},scene=String(label||'').split('-').slice(0,2).join('-');return all.scenes?.[scene]||all.global;}
function applySettings(episodes,payload){
 const value=payload.settings,scope=payload.scope;
 if(!['project','scene'].includes(scope)||typeof payload.revision!=='string'||!payload.revision||payload.revision.length>128||!value||typeof value!=='object'||Array.isArray(value)||!['profileId','model','ratio','resolution'].every(k=>typeof value[k]==='string'&&value[k].trim())||(value.libtvParams!==undefined&&(!value.libtvParams||typeof value.libtvParams!=='object'||Array.isArray(value.libtvParams)))||(value.libtvMode!==undefined&&typeof value.libtvMode!=='string')||!Number.isFinite(value.duration)||value.duration<=0||value.duration>3600)throw Object.assign(Error('请补全生成参数和应用范围'),{status:400});
 const settings=Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,structuredClone(value[k])])),record={revision:payload.revision,settings};
 let count=0;
 for(const ep of episodes){
  if(ep.kind==='setting'||ep.title==='设定和小传')continue;
  if(scope==='scene'&&ep.id!==payload.episodeId)continue;
  if(scope==='scene'&&!new RegExp('^'+Number(String(payload.sceneId||'').split('-')[0])+'-\\d+$').test(payload.sceneId||''))throw Object.assign(Error('场景编号无效'),{status:400});
  if(scope==='scene'&&!(ep.storyboardPrompts||ep.prompts||[]).some(s=>s.label?.startsWith(payload.sceneId+'-')))throw Object.assign(Error('当前场景没有分镜'),{status:400});
  const old=ep.storyboardDefaultSettings||{};
  ep.storyboardDefaultSettings=scope==='project'?{global:record,scenes:{}}:{...old,scenes:{...old.scenes,[payload.sceneId]:record}};
  ep.storyboardPrompts=structuredClone(ep.storyboardPrompts||ep.prompts||[]).map(shot=>{
   if(scope==='scene'&&!shot.label?.startsWith(payload.sceneId+'-'))return shot;
   count++;return {...shot,generationConfig:{...shot.generationConfig,libtvMode:'auto',libtvParams:{},...settings,storyboardDefaultsRevision:record.revision}};
  });
  ep.storyboardWorkspacePolicy='published';
 }
 if(scope==='scene'&&!count)throw Object.assign(Error('分集或场景已变更，请刷新'),{status:409});
 return episodes;
}
module.exports={applySettings,settingsFor};

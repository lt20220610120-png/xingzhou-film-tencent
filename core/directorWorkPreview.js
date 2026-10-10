// Preview actual director work, independently of the imported source script.
export function directorWorkPreview(document={}) {
 const sections=[];
 for(const ep of document.episodes||[]) {
  const parts=[];
  for(const [scene,text] of Object.entries(ep.quickSceneEdits||{}))parts.push(`场景 ${scene} · 快速模式编辑\n${text}`);
  for(const [scene,text] of Object.entries(ep.sceneVisions||{}))parts.push(`场景 ${scene} · 导演构想\n${text}`);
  for(const prompt of ep.prompts||[])parts.push(`${prompt.label||'提示词'} · ${prompt.generationMode==='creative'?'创造模式':'快速模式'}\n${prompt.content||''}`);
  for(const reply of ep.manualSceneReplies||[])parts.push(`场景 ${reply.sceneLabel} · 原始回包\n${reply.output||''}`);
  if(parts.length)sections.push(`${ep.title||'分集'}\n\n${parts.join('\n\n')}`);
 }
 return sections.join('\n\n────────\n\n')||'此版本未记录导演创作内容。可切换到“原剧本”查看素材；不会将原剧本误报为导演成果。';
}

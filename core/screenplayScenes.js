const text=v=>typeof v==='string'?v:'';
export const screenplayCharacterCount=value=>Array.from(text(value).replace(/\s/g,'')).length;

/** A view of the original text; offsets preserve every character for local editing. */
export function splitScreenplayScenes(value){
 const raw=text(value),headings=[...raw.matchAll(/^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?(\d+)[ \t]*[-－—–][ \t]*(\d+)[ \t]+([^\r\n]+)$/gm)];
 const scenes=headings.map((m,i)=>{
  const start=m.index,end=headings[i+1]?.index??raw.length,header=m[3].replace(/\*\*[ \t]*$/,'').trim();
  return {id:`${Number(m[1])}-${Number(m[2])}`,episodeNumber:Number(m[1]),sceneNumber:Number(m[2]),header,start,end,text:raw.slice(start,end),body:raw.slice(start+m[0].length,end).trim()};
 });
 return {prefix:raw.slice(0,headings[0]?.index??raw.length),scenes};
}
export function validateScreenplayEpisode(value,number){
 const raw=text(value).trim(),{scenes}=splitScreenplayScenes(raw);
 const fail=message=>{throw Object.assign(new Error(message),{code:'FRAMEWORK_EPISODE_FORMAT'});};
 if(!scenes.length)fail('正文应为分场剧本：补全场次、地点、日夜内外、人物、动作与对白，不能使用故事摘要。');
 if(scenes.some((s,i)=>s.episodeNumber!==number||s.sceneNumber!==i+1))fail('剧本集号或场次编号与当前版本不一致，场次应从本集-1连续编号。');
 const heading=raw.match(/^[ \t]*第[ \t]*(\d+)[ \t]*集/m);if(heading&&Number(heading[1])!==number)fail('剧本标题集号与目标集不一致。');
 for(const scene of scenes){
  const metadata=[scene.header,...scene.body.split(/\r?\n/).slice(0,3)].join(' ');
  if(!/(?:日|夜|晨|晚|时间待确认)/.test(metadata)||!/(?:内|外|内外待确认)/.test(metadata)||!/^[ \t]*(?:出场)?人物[ \t]*[：:][^\n]+/m.test(scene.body))fail(`场次 ${scene.id} 需要地点、日夜内外及人物名单。`);
  if(!/^[ \t]*[△▲][^\n]+/m.test(scene.body)&&!/^[ \t]*(?!(?:(?:出场)?人物|时间|地点|场景|场次|日夜|内外|镜头)[ \t]*[：:])[^\n：:]{1,20}[：:][^\n]+/m.test(scene.body))fail(`场次 ${scene.id} 需要可表演的动作或人物对白。`);
 }
 return raw;
}

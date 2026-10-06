const fields = ['title', 'summary', 'purpose', 'source'];
const text = value => typeof value === 'string' ? value : '';
const id = () => `outline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const newOutlineGroup = () => ({id:id(),title:'',goal:'',events:[]});
export const newOutlineEvent = () => ({id:id(),title:'',summary:'',purpose:'',source:''});
export function readRewriteOutline(raw) {
  if (!raw) return {groups:[]};
  let data = raw;
  if (typeof data === 'string') {
    const value = data.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { data = JSON.parse(value); } catch { throw new Error('大纲结构无法识别，请保留原始结果并重新生成或编辑。'); }
  }
  data = data.macroOutline || data;
  if (!Array.isArray(data.groups)) throw new Error('大纲需要大事件组，每组包含小事件。');
  const used = new Set();
  const identity = (value, fallback) => {
    const key = text(value) || fallback;
    if (used.has(key)) throw new Error('大纲事件编号重复，请重新生成或修正。');
    used.add(key);return key;
  };
  return {groups:data.groups.map((group,i)=>({id:identity(group.id,`group-${i+1}`),title:text(group.title),goal:text(group.goal),source:text(group.source),
    events:(Array.isArray(group.events)?group.events:[]).map((event,j)=>({id:identity(event.id,`group-${i+1}-event-${j+1}`),...Object.fromEntries(fields.map(key=>[key,text(event[key])]))})),
  }))};
}
export function validateRewriteOutline(raw) {
  const data = readRewriteOutline(raw);
  if (!data.groups.length || data.groups.some(g=>!g.title.trim()||!g.goal.trim()||!g.events.length||g.events.some(e=>!e.title.trim()||!e.purpose.trim()))) {
    throw new Error('请补齐大事件名称、阶段目标，以及小事件名称和它的作用，再确认大纲。');
  }
  return data;
}
export const copyOutlineGroups = groups => groups.map(group=>({...group,id:id(),events:group.events.map(event=>({...event,id:id()}))}));
export function rewriteOutlineText(raw) {
  if (!raw) return '';
  const data = readRewriteOutline(raw);
  return data.groups.map((group,i)=>[`【大事件 ${i+1}：${group.title}】`,`阶段目标：${group.goal}`,group.source&&`来源：${group.source}`,
    ...group.events.map((event,j)=>[`${j+1}、${event.title}`,event.summary&&`提纲：${event.summary}`,`作用与因果：${event.purpose}`,event.source&&`来源：${event.source}`].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n')).join('\n\n');
}
export function moveOutlineGroup(data, groupId, delta) {
  const groups=[...data.groups],index=groups.findIndex(g=>g.id===groupId),to=index+delta;
  if(index<0||to<0||to>=groups.length)return data;
  [groups[index],groups[to]]=[groups[to],groups[index]];return {...data,groups};
}
export function moveOutlineEvent(data, groupId, eventId, toGroupId, delta=0) {
  const group=data.groups.find(g=>g.id===groupId),to=data.groups.find(g=>g.id===toGroupId);
  const index=group?.events.findIndex(e=>e.id===eventId)??-1;if(index<0||!to)return data;
  if(groupId===toGroupId){const events=[...group.events],destination=index+delta;if(destination<0||destination>=events.length)return data;
    [events[index],events[destination]]=[events[destination],events[index]];return {...data,groups:data.groups.map(g=>g.id===groupId?{...g,events}:g)};
  }
  const event=group.events[index];return {...data,groups:data.groups.map(g=>g.id===groupId?{...g,events:g.events.filter(e=>e.id!==eventId)}:g.id===toGroupId?{...g,events:[...g.events,event]}:g)};
}
export const REWRITE_OUTLINE_RULE='只整理阶段式故事骨架。大事件是持续一个较长阶段、围绕共同目标推进的事件组（如相遇、相爱、赴约、成长为首领），不是每集或每场内容。每组列出必要的小事件，每个小事件保留核心行动、简短提纲和它服务阶段目标的作用与因果；不用设计逐集对白、场景或动作细节，不按第1集第2集流水账分组，不分配集数。输出纯JSON：{"groups":[{"id":"group-1","title":"大事件／阶段名称","goal":"本阶段共同目标、起点终点与转折","source":"来源依据，推断注明","events":[{"id":"event-1","title":"小事件名称","summary":"核心行动的短提纲","purpose":"为什么需要这个事件，它如何引出人物、推动目标或连接下一事件","source":"原文依据，集场仅用作来源标签"}]}]}。按故事推进顺序组织各大事件及小事件，编号唯一，覆盖材料真正结尾，不补材料外结局。';

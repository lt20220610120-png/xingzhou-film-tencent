import { normalizeCreatorProject } from './creatorWorkspace.js';
import { splitFullScript } from './scriptImport.js';

const copy = value => JSON.parse(JSON.stringify(value));
const uid = () => `rewrite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const REWRITE_STAGES = [{key:'settings',label:'设定'},{key:'outline',label:'主线'},{key:'characters',label:'人物'},{key:'detail',label:'细纲'}];
export const rewriteSources = project => [project.creator?.source,...(project.creator?.references||[])].filter(Boolean).map((book,index)=>{
  if(index!==0||book.analysis)return book;
  const sections=project.creator?.sections||{},analysis={settings:sections.settings?.input||'',outline:sections.outline?.input||sections.events?.input||'',characters:sections.characters?.input||''};
  return Object.values(analysis).some(Boolean)?{...book,analysis}:book;
});
export const rewriteState = project => ({ selections:{},versions:[],activeVersionId:null,...project.creator?.rewrite });
export function parseRewriteObject(raw) {
  if(raw && typeof raw==='object')return raw;
  const text=String(raw||'').trim();
  for(const candidate of [text,...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),m=>m[1]),text.slice(text.indexOf('{'),text.lastIndexOf('}')+1)]) {
    try { const parsed=JSON.parse(candidate);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed; } catch {}
  }
  throw new Error('无法识别拆解或细纲结构，原始输出已保存在任务历史，可编辑后再次采用。');
}
const change=(state,id,fn)=>({...state,scriptProjects:state.scriptProjects.map(raw=>{
  if(raw.id!==id)return raw;
  return {...fn(normalizeCreatorProject(raw,'script')),updatedAt:new Date().toISOString()};
})});
export const addRewriteSource=(state,id,document)=>change(state,id,p=>{
  if(!document.content?.trim())throw new Error('对标剧本没有正文');
  const source={...copy(document),id:uid(),name:document.name||document.fileName||'对标剧本',episodes:splitFullScript(document.content).episodes.map(e=>({...e,id:uid()})),analysis:{}};
  return {...p,creator:{...p.creator,...(!p.creator.source?{source}:{references:[...p.creator.references,source]})}};
});
export const removeRewriteSource=(state,id,sourceId)=>change(state,id,p=>{
  const books=rewriteSources(p).filter(b=>b.id!==sourceId),workflow=rewriteState(p);
  const selections=Object.fromEntries(Object.entries(workflow.selections).map(([k,ids])=>[k,ids.filter(i=>i!==sourceId)]));
  return {...p,creator:{...p.creator,source:books[0]||null,references:books.slice(1),rewrite:{...workflow,selections}}};
});
export const saveRewriteAnalysis=(state,id,sourceId,raw)=>change(state,id,p=>{
  const result=parseRewriteObject(raw);
  if(!['settings','outline','characters'].every(k=>typeof result[k]==='string'&&result[k].trim()))throw new Error('拆解必须包含非空的设定、主线与人物，原始结果已留在历史。');
  const update=b=>b.id===sourceId?{...b,analysis:{...b.analysis,...result,createdAt:new Date().toISOString()}}:b;
  if(!rewriteSources(p).some(b=>b.id===sourceId))throw new Error('对标来源已移除，不能写入拆解');
  return {...p,creator:{...p.creator,source:p.creator.source?update(p.creator.source):null,references:p.creator.references.map(update)}};
});
export const selectRewriteSources=(state,id,key,ids)=>change(state,id,p=>({...p,creator:{...p.creator,rewrite:{...rewriteState(p),selections:{...rewriteState(p).selections,[key]:[...new Set(ids)]}}}}));
export function validateRewritePlan(raw) {
  const plan=parseRewriteObject(raw),episodes=plan.episodes,events=plan.majorEvents;
  if(!Array.isArray(episodes)||!episodes.length||!Array.isArray(events)||!events.length)throw new Error('细纲需要主要事件范围和每集详细内容');
  const eventIds=new Set(events.map(e=>e.id));
  if(eventIds.size!==events.length||events.some(e=>typeof e.id!=='string'||!e.id.trim()||!e.title?.trim()))throw new Error('主要事件需要唯一编号和名称');
  const coverage=new Set();
  for(const event of events){
    if(!Number.isInteger(event.startEpisode)||!Number.isInteger(event.endEpisode)||event.startEpisode<1||event.endEpisode<event.startEpisode||event.endEpisode>episodes.length)throw new Error('主要事件的集数范围无效');
    for(let n=event.startEpisode;n<=event.endEpisode;n++)coverage.add(n);
  }
  for(let i=0;i<episodes.length;i++) {
    const ep=episodes[i];
    if(ep.number!==i+1||typeof ep.outline!=='string'||!ep.outline.trim()||!coverage.has(i+1))throw new Error('细纲必须连续分集，每集包含详细内容并对应主要事件');
    if(!Array.isArray(ep.eventIds)||!ep.eventIds.length||ep.eventIds.some(id=>!eventIds.has(id)||!events.some(e=>e.id===id&&ep.number>=e.startEpisode&&ep.number<=e.endEpisode)))throw new Error('本集主要事件编号与集数范围不一致');
  }
  return copy(plan);
}
const snapshot=p=>({sections:copy(p.creator.sections),episodes:copy(p.episodes),selections:copy(rewriteState(p).selections)});
const planText=plan=>[
  ...plan.majorEvents.map(e=>`【${e.title}：第${e.startEpisode}—${e.endEpisode}集】\n${e.events||''}\n${e.timeline||''}`),
  ...plan.episodes.map(e=>`【${e.title||`第${e.number}集`}】\n${e.outline}\n悬念与伏笔：${e.hook||''}\n连续性：${e.continuity||''}`),
].join('\n\n');
const saveActive=p=>{
  const w=rewriteState(p);return {...w,versions:w.versions.map(v=>v.id===w.activeVersionId?{...v,snapshot:snapshot(p)}:v)};
};
export const addRewritePlan=(state,id,raw)=>change(state,id,p=>{
  const plan=validateRewritePlan(raw),w=saveActive(p);
  const sections={...copy(p.creator.sections),detail:{...p.creator.sections.detail,output:planText(plan),accepted:true,stale:false,locked:false}};
  const version={id:uid(),number:Math.max(0,...w.versions.map(v=>v.number||0))+1,createdAt:new Date().toISOString(),plan,snapshot:{sections,selections:copy(w.selections),episodes:plan.episodes.map(ep=>({id:uid(),type:'episode',title:ep.title||`第${ep.number}集`,content:ep.outline,result:'',outline:ep.outline,hook:ep.hook||'',continuity:ep.continuity||'',eventIds:ep.eventIds,sourceEpisodeIds:[],generationVersions:[],generationVersion:0,finalConfirmed:false,stale:false}))}};
  return {...p,creator:{...p.creator,rewrite:{...w,versions:[...w.versions,version]}}};
});
export const applyRewriteVersion=(state,id,versionId)=>change(state,id,p=>{
  let w=saveActive(p);const version=w.versions.find(v=>v.id===versionId);
  if(!version)throw new Error('找不到细纲版本');
  if(w.activeVersionId===versionId)return {...p,creator:{...p.creator,rewrite:w}};
  // Preserve even pre-upgrade manuscripts before the first edition is applied.
  if(!w.activeVersionId&&p.episodes.some(e=>e.result?.trim()||e.content?.trim()))w={...w,versions:[...w.versions,{id:uid(),number:Math.max(0,...w.versions.map(v=>v.number||0))+1,name:'原有稿件',createdAt:new Date().toISOString(),plan:null,snapshot:snapshot(p)}]};
  return {...p,episodes:copy(version.snapshot.episodes),creator:{...p.creator,sections:copy(version.snapshot.sections),rewrite:{...w,activeVersionId:versionId,selections:copy(version.snapshot.selections)}}};
});
export const deleteRewriteVersion=(state,id,versionId)=>change(state,id,p=>{
  const w=rewriteState(p);if(w.activeVersionId===versionId)throw new Error('当前采用版本不能删除，请先切换');
  return {...p,creator:{...p.creator,rewrite:{...w,versions:w.versions.filter(v=>v.id!==versionId)}}};
});
export function prepareRewriteTask(project,target={}) {
  if(project.creator?.mode!=='rewrite')return project;
  const books=rewriteSources(project),w=rewriteState(project);
  if(target.task==='rewriteAnalyze') {
    const book=books.find(b=>b.id===target.sourceId);if(!book)throw new Error('找不到对标剧本');
    return {...project,episodes:[],creator:{...project.creator,source:book,references:[],sections:{},chat:[],story:{events:[],characters:[]}}};
  }
  const key=target.section||'episode',ids=w.selections[key]||[];
  const selected=books.filter(b=>ids.includes(b.id));
  const references=selected.map(book=>({...book,enabled:true,content:book.analysis?Object.entries(book.analysis).filter(([k])=>['settings','outline','characters'].includes(k)).map(([k,v])=>`【${k}】\n${v}`).join('\n\n')||book.content:book.content}));
  const episodes=target.episodeId?project.episodes.slice(0,project.episodes.findIndex(e=>e.id===target.episodeId)+1):[];
  const sections=Object.fromEntries(Object.entries(project.creator.sections).map(([k,v])=>[k,{...v,input:''}]));
  return {...project,episodes,creator:{...project.creator,source:null,references,sections,story:{events:[],characters:[]}}};
}
export const REWRITE_ANALYSIS_RULE='完整拆解当前唯一对标剧本，输出 JSON 对象，三个值均为详细中文字符串：{"settings":"时代、地域风土、社会背景、架空体系、世界规则与个人金手指；明确区分人人可用的世界能力和主角专属能力，来源依据与推断","outline":"剧本主线而非单个人命运：编号主要事件从开端到真实结尾，每项包含各人物小事件如何交织、实际时间、因果、转折及来源集场","characters":"主要人物详细分析性格底色、动机、关系、从剧本开始到结束的个人事件链和命运变化；次要人物简写。把剧本当真实世界理解，不虚构材料外结局"}。不要拆其他剧本，不生成新作。';
export const REWRITE_PLAN_RULE='只依据新作当前采用的设定、主线、人物生成细纲候选。把主线主要事件分配到连续集数，再把人物小事件、行动、对白要点、知情变化、伏笔和因果衔接落实到每一集。输出纯JSON：{"majorEvents":[{"id":"event-1","title":"主要事件","startEpisode":1,"endEpisode":7,"events":"交织的小事件","timeline":"时间与因果"}],"episodes":[{"number":1,"title":"第1集","eventIds":["event-1"],"outline":"本集完整详细规划，不是几句话概述","hook":"悬念与伏笔","continuity":"前后集衔接及人物知情状态"}]}。必须每集有详细规划，集号从1到结局连续，与事件范围一致；集数按用户要求和实际故事决定，不照搬对标。';

import {assertRewriteIdentityReady,assertCanonicalRewriteProse} from '../../core/rewriteConversion.js';
import React,{useRef,useState,useEffect} from 'react';
import {Play,Square,Check,Lock} from 'lucide-react';
import {readRewriteOutline} from '../../core/rewriteOutline.js';
import {readRewriteMainline,outlineEventOptions,rewriteMainlineText} from '../../core/rewriteMainline.js';
import {rewriteStoryInput,validateRewriteStory,alignRewriteStory,REWRITE_STORY_RULE,storyIdentityCurrent,stampStoryIdentity} from '../../core/rewriteStory.js';
import {updateCreatorSection,updateCreatorProject,adoptCreatorRecord} from '../../core/creatorWorkspace.js';
import {RewriteEventReferences} from './RewriteEventReferences.jsx';
import {FormattedText,FormattedEditor} from '../components/FormattedText.jsx';

export function RewriteStoryBoard({project,state,setState,getState,agent,profile,onError}){
 const latest=useRef(state);latest.current=state;const stopped=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopped.current=true;};},[]);
 const [selected,setSelected]=useState(''),[batch,setBatch]=useState(false),[instruction,setInstruction]=useState('');
 const current=()=> (getState?.()||latest.current).scriptProjects.find(p=>p.id===project.id);
 const section=project.creator.sections.outline,macro=project.creator.sections.macroOutline;
 let outline,data,options;try{outline=readRewriteOutline(macro?.output);data=readRewriteMainline(section?.output);options=outlineEventOptions(outline);}catch(e){return <p className="creator-error">{e.message}</p>;}
 const id=options.some(o=>o.eventId===selected)?selected:options[0]?.eventId,option=options.find(o=>o.eventId===id),group=outline.groups.find(g=>g.id===option?.groupId),event=group?.events.find(e=>e.id===id),item=data.eventGroups.find(e=>e.eventId===id);
 const activity=agent.getActivity?.('script',project.id,{section:'outline',task:'rewriteStory'})||{},busy=batch||activity.running;
 const needsWork=options.filter(o=>{const row=data.eventGroups.find(e=>e.eventId===o.eventId);return !row?.story?.trim()||!storyIdentityCurrent(project,row);});
 const ready=macro?.accepted&&(!macro.stale||macro.locked)&&options.length,done=options.filter(o=>data.eventGroups.some(e=>e.eventId===o.eventId&&e.story?.trim())).length;
 const attempt=fn=>{try{fn();onError('');}catch(e){onError(e.message);}};
 const update=(patch)=>attempt(()=>{
  const row={id:`story-${id}`,groupId:option.groupId,eventId:id,title:option.title,story:'',...item,...patch,episodes:[],...(item?.episodes?.length?{legacyEpisodes:item.episodes}:{})};
  const next={...data,format:'story-v1',eventGroups:item?data.eventGroups.map(e=>e.eventId===id?row:e):[...data.eventGroups,row]};
  setState(s=>updateCreatorSection(s,'script',project.id,'outline',{output:JSON.stringify(next),accepted:false}));
 });
 const references=refs=>attempt(()=>setState(s=>{const p=s.scriptProjects.find(p=>p.id===project.id);return updateCreatorProject(s,'script',project.id,{rewrite:{...p.creator.rewrite,eventReferences:{...p.creator.rewrite?.eventReferences,[id]:refs}},sections:{outline:{accepted:false,stale:!!p.creator.sections.outline.output}}});}));
 const run=async(ids,includeLegacy=false)=>{
  if(busy||!ids.length)return;stopped.current=false;setBatch(true);onError('');
  try{for(const eventId of ids){if(stopped.current||!mounted.current)break;
   const target={section:'outline',side:'output',task:'rewriteStory',format:'rewriteStory',eventIds:[eventId],includeLegacy};
   rewriteStoryInput(current(),target,{strict:true});
   if(current().creator.sections.outline.locked)throw new Error('请先解锁主线故事稿。');
   const recordId=await agent.run({kind:'script',projectId:project.id,target,profile,scope:'project',instruction:`${REWRITE_STORY_RULE}\n${includeLegacy?'可参考原有主线文字重新整理，最终稿不要分集。':''}\n用户要求：${instruction||'依据已确定的完整事件链展开本次小事件，写充分的具体经过。'}`});
   await new Promise(resolve=>setTimeout(resolve,0));
   if(stopped.current)break;
   // Verify against current state before scheduling React's update. Changed input leaves a candidate in history.
   adoptCreatorRecord(getState?.()||latest.current,'script',project.id,recordId);
   setState(s=>adoptCreatorRecord(s,'script',project.id,recordId));
   await new Promise(resolve=>setTimeout(resolve,0));
  }}catch(e){if(mounted.current)onError(e.message);}finally{if(mounted.current)setBatch(false);}
 };
 const stop=()=>{stopped.current=true;agent.cancel('script',project.id,{section:'outline',task:'rewriteStory'});};
 const orphaned=[...(data.archivedEventGroups||[]),...data.eventGroups.filter(e=>!options.some(o=>o.eventId===e.eventId))];
 return <div className="rewrite-story-board">
  <div className="rewrite-story-toolbar"><div><strong>新作主线 · 完整故事稿</strong><small>{done} / {options.length} 个小事件已展开 · 此处不分集</small></div><div className="creator-inline-actions">
   {busy?<button className="secondary" onClick={stop}><Square size={14}/>停止完善</button>:<button className="primary" disabled={!ready||!profile||section.locked||!needsWork.length} onClick={()=>{if(needsWork.some(o=>data.eventGroups.some(r=>r.eventId===o.eventId&&r.story?.trim()))&&!window.confirm('重新完善全部需复核事件？当前稿会保留在历史，其他事件不变。'))return;run(needsWork.map(o=>o.eventId));}}><Play size={14}/>{needsWork.some(o=>data.eventGroups.some(r=>r.eventId===o.eventId&&r.story?.trim()))?'一键重新完善需复核事件':'一键完善未完成事件'}</button>}
   <button className="secondary" disabled={busy||section.locked||!ready||done!==options.length} onClick={()=>attempt(()=>{const aligned=alignRewriteStory(section.output,macro.output);validateRewriteStory(aligned,macro.output,options.map(o=>o.eventId));assertRewriteIdentityReady(current());assertCanonicalRewriteProse(current(),aligned.eventGroups.map(e=>[e.story,e.continuity].filter(Boolean).join('\n')).join('\n'));const stamped=stampStoryIdentity(current(),aligned);setState(s=>updateCreatorSection(s,'script',project.id,'outline',{output:JSON.stringify(stamped),accepted:true,stale:false}));})}><Check size={14}/>{section.accepted&&!section.stale?'已确认故事稿':'确认整部故事稿'}</button>
   <button className="secondary" disabled={!section.accepted||busy} onClick={()=>setState(s=>updateCreatorSection(s,'script',project.id,'outline',{locked:!section.locked}))}><Lock size={14}/>{section.locked?'解锁':'锁定'}</button></div></div>
  {!ready&&<p className="creator-warning">请先在大纲页确认新作的大事件与小事件，主线将自动沿用这条时间线。</p>}
  {section.stale&&<p className="creator-warning">大纲、设定或参考发生变化，请逐项复核故事稿后重新确认。</p>}
  {busy&&<p role="status" className="creator-muted">{activity.label||'依次完善事件'} · 每次读取全剧骨架和已有故事稿</p>}
  <div className="rewrite-story-layout"><nav aria-label="新作故事事件链">{outline.groups.map((g,i)=><section key={g.id}><strong>{options.find(o=>o.groupId===g.id)?.code.replace(/\d+$/,'')||i+1} · {g.title}</strong>{g.events.map(e=>{const o=options.find(o=>o.eventId===e.id),written=data.eventGroups.some(x=>x.eventId===e.id&&x.story?.trim());return <button key={e.id} className={e.id===id?'active':''} onClick={()=>setSelected(e.id)}><span>{o.code} · {e.title}</span><small>{written?(storyIdentityCurrent(project,data.eventGroups.find(r=>r.eventId===e.id))?'已展开':'需复核'):'待完善'}</small></button>;})}</section>)}</nav>
   <section className="rewrite-story-editor">{event?<>
    <header><div><small>{group.title}</small><h3>{option.code} · {event.title}</h3></div><button className="rewrite-soft-action" disabled={busy||!ready||!profile||section.locked} onClick={()=>{if(!item?.story?.trim()||window.confirm('重新完善此事件？当前人工稿会留在历史，其余事件不变。'))run([id]);}}><Play size={14}/>{item?.story?.trim()?'重新完善此事件':'完善此事件'}</button></header>
    <div className="rewrite-story-skeleton"><strong>大纲已确定</strong><p>{event.summary}</p><p>作用与衔接：{event.purpose}</p><small>阶段目标：{group.goal}</small></div>
    <RewriteEventReferences project={project} event={event} onChange={references} readOnly={section.locked}/>
    <label className="rewrite-story-instruction">本次补充要求<input aria-label="事件完善要求" value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="可留空，或补充发生方式、人物反应等要求"/></label>
    <FormattedEditor key={item?.id||"empty"} commitDelay={1200} aria-label="小事件完整故事稿" readOnly={section.locked} value={item?.story||''} onChange={e=>update({story:e.target.value})} placeholder="点击“完善此事件”或“一键完善未完成事件”，Agent 会读取整部大纲、已确认设定及绑定素材，展开具体故事。你也可以直接写作。"/>
    <label className="rewrite-story-continuity">前后衔接与待确认问题<textarea aria-label="故事衔接核对" readOnly={section.locked} value={item?.continuity||''} onChange={e=>update({continuity:e.target.value})}/></label>
    {(item?.episodes?.length>0||item?.legacyEpisodes?.length>0)&&<details><summary>旧版逐集资料（保留）</summary><FormattedText text={rewriteMainlineText({eventGroups:[{...item,story:'',continuity:'',episodes:item.legacyEpisodes||item.episodes}]})}/></details>}
   </>:<p className="creator-muted">确认大纲后，这里会自动列出所有小事件。</p>}</section></div>
  {(data.legacyText||orphaned.length>0)&&<details className="rewrite-story-legacy"><summary>原有主线与已脱离当前大纲的内容（保留）</summary><div className="rewrite-mainline-note"><span>可参考原有内容，沿新作大纲整理成不分集的故事稿。</span><button className="rewrite-soft-action" disabled={busy||!ready||!profile||section.locked} onClick={()=>{if(window.confirm('按当前大纲重新完善全部小事件？现有稿件保留在历史。'))run(options.map(o=>o.eventId),true);}}>整理为事件故事稿</button></div><FormattedText text={[data.legacyText,rewriteMainlineText({eventGroups:orphaned})].filter(Boolean).join('\n\n')}/></details>}
 </div>;
}

import React,{useEffect,useRef,useState} from 'react';
import {Bot,Send,RefreshCw,BookMarked,CheckCircle2,LoaderCircle} from 'lucide-react';
import {ChoiceField} from './ProductionControls.jsx';
import {productionProjectCandidates} from '../../core/productionProject.js';
import {ProductionAgentStatus} from './ProductionAgentStatus.jsx';
import {ProductionGoals} from './ProductionGoals.jsx';

const toolSummaries={inspect:'已读取当前任务、制作设置与进度。',pause:'已暂停新任务派发，已提交的远端任务继续保留。',continue:'已接受继续制作指令。',update_settings:'已更新当前任务设置，已有成果继续保留。',run_stage:'已接收制作工序指令。',set_scope:'已保存本次临时制作范围。',clear_scope:'已解除本次临时范围。'};
export function readableConversationText(value){
 let text=String(value??'').replace(/^Error invoking remote method '[^']+': Error:\s*/,'');
 const legacyTool=text.match(/^工具已执行：xingzhou_(?:task|project) \/ ([^；]+)/);
 if(legacyTool)return toolSummaries[legacyTool[1]]||'已完成制作操作并核对回执。';
 text=text.replace(/\\r\\n|\\n/g,'\n').replace(/\\t/g,'\t');
 return text.replace(/Agent 回包过大/g,'旧版接收连接已中断；升级后可接续原任务。').replace(/Selected model is at capacity\. Please try a different model\./g,'当前模型繁忙，请稍后重试或切换模型。');
}


export function conversationRows(events){const rows=[];for(const event of events){if(!event.text?.trim())continue;const step=event.role==='system'||event.role==='log';if(step){let group=rows.at(-1);if(group?.kind!=='steps'){group={kind:'steps',id:'steps-'+event.id,events:[]};rows.push(group);}group.events.push(event);}else rows.push(event);}return rows;}
const operationNames={project:'读取项目与剧本',assets:'读取美术素材',bindings:'核对提示词关联',generations:'读取视频任务',refresh:'查询原任务',archive:'归档原片',post_status:'检查后期凭据',inspect:'读取制作状态',continue:'接续制作',pause:'暂停派发',set_scope:'调整本次范围',clear_scope:'恢复默认范围'};
function ReplyText({text}){return <div className="agent-reply-text">{readableConversationText(text).split(/(```[\s\S]*?```)/g).map((part,i)=>part.startsWith('```')?<pre key={i}><code>{part.replace(/^```[^\n]*\n?/,'').replace(/```$/,'')}</code></pre>:<div key={i}>{part.split('\n').map((line,n)=><div className={/^#{1,4} /.test(line)?'agent-reply-heading':''} key={n}>{line.replace(/^#{1,4} /,'').split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((chunk,k)=>chunk.startsWith('**')?<strong key={k}>{chunk.slice(2,-2)}</strong>:chunk.startsWith('`')?<code key={k}>{chunk.slice(1,-1)}</code>:chunk)}{!line&&<br/>}</div>)}</div>)}</div>;}
function StepGroup({row}){const failures=row.events.filter(e=>/未完成|失败|错误/.test(e.text));return <details className="agent-step-group"><summary>{failures.length?'⚠':'›'} 执行过程 · {row.events.length} 个步骤{failures.length?' · '+failures.length+' 项提示':''}</summary><div>{row.events.map(e=><details className="agent-step" key={e.id}><summary><span>{operationNames[e.operation]||readableConversationText(e.text)}</span><time>{new Date(e.at).toLocaleTimeString('zh-CN',{hour12:false})}</time></summary><p>{readableConversationText(e.text)}</p>{e.tool&&<small>{e.tool} / {e.operation}</small>}{e.args&&<><b>调用参数</b><pre>{e.args}</pre></>}{e.result&&<><b>返回结果</b><pre>{e.result}</pre></>}</details>)}</div></details>;}

export function ProductionConversation({run,production,api,onSaveDefault}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[models,setModels]=useState([]),[error,setError]=useState(''),[candidates,setCandidates]=useState([]),[rule,setRule]=useState(run.config.workflowRules||''),[notice,setNotice]=useState('');
 const pendingActs=useRef(0);const pane=useRef(null),composer=useRef(null),follow=useRef(true),owner=useRef(run.id);owner.current=run.id;
 const [connection,setConnection]=useState(null);
 useEffect(()=>{setBusy(false);follow.current=true;setText('');setError('');setModels([]);setRule(run.config.workflowRules||'');setNotice('');setCandidates([]);},[run.id]);
 const events=[...(run.logs||[]).map(e=>({...e,role:'log'})),...(run.conversation||[])].sort((a,b)=>a.at-b.at);
 useEffect(()=>{if(follow.current&&pane.current)pane.current.scrollTop=pane.current.scrollHeight;},[run.id,events.length,events.map(e=>e.text?.length||0).join(','),busy]);
 useEffect(()=>{if(!composer.current)return;composer.current.style.height='auto';composer.current.style.height=Math.min(composer.current.scrollHeight,180)+'px';},[text]);
 const act=async fn=>{const id=run.id;pendingActs.current++;setBusy(true);setError('');setNotice('');try{await fn(id);}catch(e){if(owner.current===id)setError(readableConversationText(e.message));}finally{pendingActs.current--;if(owner.current===id)setBusy(pendingActs.current>0);}};
 const load=()=>act(async id=>{const [conn,rows]=await Promise.all([api.productionConnect({path:run.config.agentPath,protocol:run.config.agentProtocol}),api.collabListProjects()]);if(owner.current!==id)return;setConnection(conn);setModels(conn.models||[]);setCandidates(productionProjectCandidates(rows,run.projectId));setNotice('模型与正常协作项目已读取，已排除回收站。');});
 useEffect(()=>{let cancelled=false,pending=false;setConnection(null);const refresh=async()=>{if(cancelled||pending||document.hidden||!run.config.agentPath)return;pending=true;try{const conn=await api.productionConnect({path:run.config.agentPath,protocol:run.config.agentProtocol});if(!cancelled){setConnection(conn);setModels(conn.models||[]);}}catch(e){if(!cancelled)setConnection({connected:false,error:readableConversationText(e.message)});}finally{pending=false;}};void refresh();const timer=setInterval(refresh,60000);return()=>{cancelled=true;clearInterval(timer);};},[run.id,run.config.agentPath,run.config.agentProtocol]);
 const send=()=>{const message=text.trim();if(!message)return;setText('');follow.current=true;void act(async id=>{await production.chat(id,{text:message,model:run.config.agentModel});});};
 return <section className="furnace-conversation" aria-label="制作 Agent 对话">
  <header><div><Bot size={20}/><div><b>制作 Agent</b><small>沟通、纠正与工作日志</small></div></div><button type="button" disabled={busy} onClick={load}><RefreshCw size={14}/>刷新模型与项目</button></header>
  <details className="furnace-agent-details" open><summary>智能体连接、模型与制作目标</summary><div className="furnace-agent-status-wrap"><ProductionAgentStatus connection={connection} modelControl={<ChoiceField label="制作 Agent 模型" value={run.config.agentModel||''} options={models.length?models:run.config.agentModel?[{id:run.config.agentModel,name:run.config.agentModel}]:[]} onChange={v=>act(()=>production.updateAgentModel(run.id,v))} disabled={busy||!models.length}/>}/>{connection?.error&&<small className="production-status-muted">账号状态读取失败：{connection.error}。可点击刷新重试。</small>}</div><ProductionGoals run={run}/></details>
  <div className="furnace-chat-controls"><ChoiceField label="接续协作项目" value={run.collabProjectId||run.config.collabProjectId||''} options={candidates.length?candidates.map(p=>({id:p.id,name:p.name+' · '+p.id.slice(0,8)})):(run.collabProjectId?[{id:run.collabProjectId,name:'当前协作项目 · '+run.collabProjectId.slice(0,8)}]:[])} placeholder="自动识别，未开启时自动创建" disabled={busy||run.status==='running'} onChange={v=>act(async()=>{await production.bindProject(run.id,v);setNotice('协作项目已更换，点击继续或发送接续指令。');})}/></div>
  <div ref={pane} role="log" aria-label="工作日志与对话消息" aria-live="polite" className="furnace-conversation-messages" onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<65;}}>
   {!events.length&&<p className="furnace-chat-empty">可以询问当前进度，或发送“读取已有协作项目，继续补齐图片”等指令。</p>}
   {conversationRows(events).map(e=>e.kind==='steps'?<StepGroup key={e.id} row={e}/>:<article key={e.id} className={`furnace-chat-message ${e.role}`}><div><b>{e.role==='user'?'我':'Agent'}</b><time>{new Date(e.at).toLocaleTimeString('zh-CN',{hour12:false})}</time></div><ReplyText text={e.text}/></article>)}
   {busy&&<p className="furnace-chat-thinking"><LoaderCircle size={16}/>Agent 正在处理，可继续发送调整指令…</p>}
  </div>
  {error&&<p role="alert" className="furnace-chat-error">{error}</p>}{notice&&<p className="furnace-chat-notice">{notice}</p>}
  <div className="furnace-chat-compose"><textarea ref={composer} aria-label="发送制作指令" value={text} maxLength={8000} rows={2} onChange={e=>setText(e.target.value)} placeholder="说说要改什么，或让 Agent 接着完成当前制作…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><div className="furnace-chat-compose-footer"><span className="furnace-chat-model"><Bot size={14}/>{run.config.agentModel||'未选择模型'}</span><small>Enter 发送 · Shift + Enter 换行</small><button className="primary" type="button" aria-label="发送" title="发送" disabled={!text.trim()||!run.config.agentModel} onClick={send}><Send size={17}/></button></div></div>
  <details className="furnace-rule-editor"><summary><BookMarked size={15}/>保存为默认制作流程</summary><p>填写已确认有效的做法，保存后用于本任务和之后的新任务。</p><textarea aria-label="默认制作流程规则" value={rule} onChange={e=>setRule(e.target.value)} rows={3} maxLength={8000}/><button type="button" disabled={busy||!rule.trim()} onClick={()=>act(async()=>{await production.saveRule(run.id,rule);onSaveDefault(rule);setNotice('已保存为当前账号的默认制作流程。');})}>保存默认流程</button></details>
 </section>;
}

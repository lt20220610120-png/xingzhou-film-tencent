import React,{useEffect,useRef,useState} from 'react';
import {Bot,Send,RefreshCw,BookMarked} from 'lucide-react';
import {ChoiceField} from './ProductionControls.jsx';
import {productionProjectCandidates} from '../../core/productionProject.js';
import {ProductionAgentStatus} from './ProductionAgentStatus.jsx';
import {ProductionGoals} from './ProductionGoals.jsx';
export function ProductionConversation({run,production,api,onSaveDefault}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[models,setModels]=useState([]),[model,setModel]=useState(run.config.agentModel||''),[error,setError]=useState(''),[candidates,setCandidates]=useState([]),[rule,setRule]=useState(run.config.workflowRules||''),[notice,setNotice]=useState('');
 const pane=useRef(null),follow=useRef(true),owner=useRef(run.id);owner.current=run.id;
 const [connection,setConnection]=useState(null);
 useEffect(()=>{setBusy(false);follow.current=true;setText('');setError('');setModels([]);setModel(run.config.agentModel||'');setRule(run.config.workflowRules||'');setNotice('');setCandidates([]);},[run.id]);
 const events=[...(run.logs||[]).map(e=>({...e,role:'log'})),...(run.conversation||[])].sort((a,b)=>a.at-b.at);
 useEffect(()=>{if(follow.current&&pane.current)pane.current.scrollTop=pane.current.scrollHeight;},[run.id,events.length,busy]);
 const act=async fn=>{const id=run.id;setBusy(true);setError('');setNotice('');try{await fn(id);}catch(e){if(owner.current===id)setError(e.message);}finally{if(owner.current===id)setBusy(false);}};
 const load=()=>act(async id=>{const [conn,rows]=await Promise.all([api.productionConnect({path:run.config.agentPath,protocol:run.config.agentProtocol}),api.collabListProjects()]);if(owner.current!==id)return;setConnection(conn);setModels(conn.models||[]);setModel(old=>(conn.models||[]).some(m=>m.id===old)?old:conn.models?.[0]?.id||'');setCandidates(productionProjectCandidates(rows,run.projectId));setNotice('模型与正常协作项目已读取，已排除回收站。');});
 useEffect(()=>{let cancelled=false,pending=false;setConnection(null);const refresh=async()=>{if(cancelled||pending||document.hidden||!run.config.agentPath)return;pending=true;try{const conn=await api.productionConnect({path:run.config.agentPath,protocol:run.config.agentProtocol});if(!cancelled){setConnection(conn);setModels(conn.models||[]);}}catch(e){if(!cancelled)setConnection({connected:false,error:e.message});}finally{pending=false;}};void refresh();const timer=setInterval(refresh,60000);return()=>{cancelled=true;clearInterval(timer);};},[run.id,run.config.agentPath,run.config.agentProtocol]);
 const send=()=>{if(!text.trim()||busy)return;const message=text;void act(async id=>{await production.chat(id,{text:message,model});if(owner.current===id)setText('');});};
 return <section className="furnace-conversation" aria-label="制作 Agent 对话">
  <header><div><Bot size={20}/><div><b>制作 Agent</b><small>沟通、纠正与工作日志</small></div></div><button type="button" disabled={busy} onClick={load}><RefreshCw size={14}/>刷新模型与项目</button></header>
  <div style={{padding:'0 18px'}}><ProductionAgentStatus connection={connection}/>{connection?.error&&<small className="production-status-muted">账号状态读取失败：{connection.error}。可点击刷新重试。</small>}</div>
  <ProductionGoals run={run}/>
  <div className="furnace-chat-controls"><ChoiceField label="对话模型" value={model} options={models.length?models:run.config.agentModel?[{id:run.config.agentModel,name:run.config.agentModel}]:[]} onChange={setModel} disabled={busy}/><ChoiceField label="接续协作项目" value={run.collabProjectId||run.config.collabProjectId||''} options={candidates.length?candidates.map(p=>({id:p.id,name:p.name+' · '+p.id.slice(0,8)})):(run.collabProjectId?[{id:run.collabProjectId,name:'当前协作项目 · '+run.collabProjectId.slice(0,8)}]:[])} placeholder="自动识别，未开启时自动创建" disabled={busy||run.status==='running'} onChange={v=>act(async()=>{await production.bindProject(run.id,v);setNotice('协作项目已更换，点击继续或发送接续指令。');})}/></div>
  <div ref={pane} role="log" aria-label="工作日志与对话消息" aria-live="polite" className="furnace-conversation-messages" onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<65;}}>
   {!events.length&&<p className="furnace-chat-empty">可以询问当前进度，或发送“读取已有协作项目，继续补齐图片”等指令。</p>}
   {events.map(e=><article key={e.id} className={`furnace-chat-message ${e.role} ${e.kind||''}`}><div><b>{e.role==='user'?'我':e.role==='assistant'?'Agent':e.role==='system'?'执行结果':'工作日志'}</b><time>{new Date(e.at).toLocaleTimeString('zh-CN',{hour12:false})}</time></div><p>{e.text}</p></article>)}
   {busy&&<p className="furnace-chat-empty">Agent 正在处理…</p>}
  </div>
  {error&&<p role="alert" className="furnace-chat-error">{error}</p>}{notice&&<p className="furnace-chat-notice">{notice}</p>}
  <div className="furnace-chat-compose"><textarea aria-label="发送制作指令" value={text} maxLength={8000} rows={3} onChange={e=>setText(e.target.value)} placeholder="说说这一步该怎么做，例如：复用已发布的清单，继续生图。" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();send();}}}/><div><small>Ctrl + Enter 发送 · 每条指令都会记录执行结果</small><button className="primary" type="button" disabled={busy||!text.trim()||!model} onClick={send}><Send size={15}/>发送</button></div></div>
  <details className="furnace-rule-editor"><summary><BookMarked size={15}/>保存为默认制作流程</summary><p>填写已确认有效的做法，保存后用于本任务和之后的新任务。</p><textarea aria-label="默认制作流程规则" value={rule} onChange={e=>setRule(e.target.value)} rows={3} maxLength={8000}/><button type="button" disabled={busy||!rule.trim()} onClick={()=>act(async()=>{await production.saveRule(run.id,rule);onSaveDefault(rule);setNotice('已保存为当前账号的默认制作流程。');})}>保存默认流程</button></details>
 </section>;
}

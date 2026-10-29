import React from 'react';
import './ProductionMonitoring.css';
const windowName=minutes=>minutes===300?'5 小时额度':minutes===10080?'每周额度':minutes?`${minutes>=60?minutes/60+' 小时':minutes+' 分钟'}额度`:'额度窗口（时长未提供）';
function Quota({window,label}){return <div className="production-quota"><div><b>{label||windowName(window.minutes)}</b><span>{window?`已用 ${window.usedPercent}%`:'未提供'}</span></div>{window?<><progress max={100} value={window.usedPercent} aria-label={label||windowName(window.minutes)}/><small>{window.resetsAt?`${new Date(window.resetsAt*1000).toLocaleString('zh-CN',{hour12:false})} 重置`:'重置时间未提供'} · {window.bucket}</small></>:<small>服务未返回此窗口，不估算额度</small>}</div>;}
export function ProductionAgentStatus({connection}){
 if(!connection?.connected)return null;const info=connection.status;
 if(!info)return <p className="production-status-muted">连接已建立；该连接未提供账号、额度或 Skill 信息。</p>;
 const five=info.windows.find(w=>w.minutes===300),week=info.windows.find(w=>w.minutes===10080);
 return <section className="production-agent-status" aria-label="智能体账号与额度">
  <div className="production-account"><span className="production-account-avatar">C</span><div><b>{info.account?.email||({apiKey:'API Key 连接',chatgpt:'ChatGPT 账号'}[info.account?.type]||'已认证账号')}</b><small>{info.account?.plan?`${info.account.plan.toUpperCase()} · `:''}Codex 官方连接 · 本机登录</small></div><time title={new Date(info.checkedAt).toLocaleString('zh-CN')}>{new Date(info.checkedAt).toLocaleTimeString('zh-CN',{hour12:false})} 读取</time></div>
  <div className="production-quota-grid"><Quota window={five} label="5 小时额度"/><Quota window={week} label="每周额度"/>{info.windows.filter(w=>w!==five&&w!==week).map(w=><Quota key={w.id} window={w}/>)}</div>
  {info.errors?.limits&&<small className="production-status-muted">额度暂不可读取，连接和已保存任务仍保留。</small>}
  <details className="production-capabilities"><summary>Skill：{info.skills?`${info.skills.enabled} 个已启用 / ${info.skills.total} 个已发现`:'暂不可读取'}<span>MCP：{info.mcp?`${info.mcp.items.length}${info.mcp.truncated?'+':''} 个服务`:'暂不可读取'}</span></summary>
   <p>以下是当前连接目录发现的能力；实际调用以任务日志为准。切换账号请在本机 Codex 中完成，再刷新连接。</p>
   <ul>{info.skills?.items.map((s,i)=><li key={i}><b>{s.name}</b><span>{s.enabled?'已启用':'未启用'}</span><small>{s.description}</small></li>)}</ul>{info.skills?.errors>0&&<small>{info.skills.errors} 项 Skill 读取异常</small>}
   {info.mcp?.items.length>0&&<ul>{info.mcp.items.map((s,i)=><li key={i}><b>{s.name}</b><span>{({connected:'已连接',notStarted:'未启动',starting:'连接中',disabled:'已停用',failed:'连接失败',authenticationRequired:'待授权'}[s.status]||'运行状态未提供')} · {s.tools} 个工具</span></li>)}</ul>}
  </details>
 </section>;
}

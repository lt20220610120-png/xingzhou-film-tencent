import React from 'react';

const labels={'read-error':'阅读中断返回',digest:'已完成的事实汇总','digest-error':'汇总中断返回','plan-error':'规划中断返回','plan-group-error':'分集规划中断返回','settings-error':'设定提取中断返回','settings-section':'已完成的设定提取片段','review-error':'原文对照返回',plan:'阶段规划输出'};
export function IPTaskHistory({record,onDelete}) {
 return <details className="ip-task-history"><summary>{record.task==='plan'?'分集规划':record.task==='settings'?'设定提取':'分集转写'} · {record.status==='completed'?'已完成':record.status==='running'?'运行中':record.status==='failed'?'失败':record.status==='cancelled'?'已停止':'已中断'} · {record.model}</summary>
  {onDelete&&<button className="ghost danger" disabled={record.status==='running'} onClick={onDelete}>删除任务记录</button>}{record.error&&<p className="creator-error">{record.error}</p>}
  <pre className="creator-doc-view">{record.instruction}{'\n'}{record.output}{'\n'}{record.partialText}</pre>
  {!!record.diagnostics?.length&&<details><summary>过程记录（{record.diagnostics.length} 条）</summary>{record.diagnostics.map((item,index)=><details key={index}><summary>{item.type==='episode-checkpoint'?`已保存进度 · ${item.stage} · ${item.complete?'此步完成':'自动接续中'}`:labels[item.type]||'阶段返回'} · {new Date(item.createdAt).toLocaleString()}</summary><pre className="creator-doc-view">{item.content}</pre></details>)}</details>}
 </details>;
}

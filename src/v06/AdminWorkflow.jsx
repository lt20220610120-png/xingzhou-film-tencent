import React,{useEffect,useState} from 'react';
import {mediaModelChoices} from '../../core/modelChoices.js';
import './AdminWorkflow.css';
const statuses={queued:'等待',preparing:'AI 检查',submitting:'提交中',submitted:'生成 / 下载中',downloaded:'已归档',blocked:'生成前待核对',failed:'上游失败',uncertain:'提交结果待核对'};
const runLabels={paused:'已暂停',running:'运行中','needs-attention':'需要处理','awaiting-post':'原片齐全 · 等待后期'};
export function AdminWorkflow({account,state,api,active=true,onNavigate}){
 const [runs,setRuns]=useState([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const books=(state.generationWorkflow?.books||[]).filter(b=>(!b.accountId||b.accountId===account.id)&&(!b.importedBinding||b.importedBinding.accountId===account.id));
 const [bookId,setBook]=useState(books[0]?.id||''),[mode,setMode]=useState('semi'),[modelKey,setModel]=useState(''),[aiId,setAi]=useState(state.activeApiId||''),[folder,setFolder]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [ratio,setRatio]=useState('9:16'),[duration,setDuration]=useState(32),[resolution,setResolution]=useState('720p'),[visualStyle,setVisualStyle]=useState('真人电影级'),[imagePrimary,setImagePrimary]=useState('志-image-2'),[imageFallback,setImageFallback]=useState('龙-image-2'),[upscaleTarget,setUpscaleTarget]=useState('1080p'),[editorTemplate,setEditorTemplate]=useState('待选择 OpenFilm 模板'),[videoChannel,setVideoChannel]=useState(''),[post,setPost]=useState({music:'使用我准备的音乐，按情绪换曲并淡入淡出',subtitles:'统一字幕样式，待配置',ending:'使用指定尾帧，待提供',versions:'成片、无字幕版'}),[agentKind,setAgentKind]=useState('codex'),[preflight,setPreflight]=useState(null);
 const [issuesOnly,setIssues]=useState(true),choices=mediaModelChoices(state,'video'),chosen=choices.find(c=>c.id===modelKey);
 const run=runs.find(r=>r.id===selected)||runs[0],book=books.find(b=>b.id===bookId);
 const refresh=async()=>{try{setRuns(await api.adminWorkflowList());}catch(e){setError(e.message);}};
 useEffect(()=>{if(!active||!account.isAdmin)return;let alive=true;const load=async()=>{try{const rows=await api.adminWorkflowList();if(alive)setRuns(rows);}catch(e){if(alive)setError(e.message);}};void load();const timer=setInterval(load,5000);return()=>{alive=false;clearInterval(timer);};},[active,account.id]);
 const act=async action=>{setBusy(true);setError('');try{await action();await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const runPreflight=()=>{const checks=[
  ['剧本项目',!!book,book?'已选择提示词项目':'先选择导演台/图视生成项目'],
  ['Agent',!!aiId,aiId?'已连接检查模型':'选择 Codex、WorkBuddy 或其他已接入 Agent'],
  ['视频渠道与模型',!!chosen&&!!videoChannel,chosen&&videoChannel?`${videoChannel} · ${chosen.name}`:'选择视频生成渠道和模型'],
  ['输出目录',!!folder,folder||'选择本机项目输出目录'],
  ['画面与时长',!!visualStyle&&!!ratio&&Number(duration)>0,`${visualStyle} · ${ratio} · ${duration}秒`],
  ['生图渠道',!!imagePrimary&&!!imageFallback,`${imagePrimary}（优先）→ ${imageFallback}（失败回退）`],
  ['人工快照',mode==='auto'||confirmed,mode==='auto'?'全自动模式不要求人工锁定':'半自动必须勾选已核对提示词和图片'],
  ['后期模板',!!editorTemplate&&editorTemplate!=='待选择 OpenFilm 模板',editorTemplate]
 ];setPreflight({ok:checks.every(c=>c[1]),checks,at:new Date().toLocaleTimeString()});};
 const stageState=(idx)=>{if(!run)return idx<3?'ready':'waiting';if(idx===0)return 'done';if(idx===1)return run.items.some(i=>i.status==='preparing')?'running':'done';if(idx===2)return run.items.some(i=>['blocked','uncertain'].includes(i.status))?'attention':'done';if(idx===3)return run.status==='running'?'running':run.items.every(i=>['downloaded','failed'].includes(i.status))?'done':'waiting';return 'waiting';};
 const stageText={ready:'可开始',waiting:'等待前置',running:'运行中',done:'已完成',attention:'需处理'};
 const create=()=>act(async()=>{await api.saveState(state);const result=await api.adminWorkflowCreate({bookId,outputRoot:folder,settings:{mode,agentKind,profileId:chosen?.profileId,model:chosen?.model,aiProfileId:aiId,videoChannel,visualStyle,imagePrimary,imageFallback,ratio,duration:Number(duration),resolution,upscaleTarget,editorTemplate,humanConfirmed:confirmed,post}});setSelected(result.id);});
 if(!account.isAdmin)return null;
 return <section className="admin-workflow" aria-label="制作工作流总控">
  <header className="wf-heading"><div><small>管理员工作区</small><h2>制作工作流总控</h2><p>先配置，后启动。切换页面后继续运行；关闭软件后保留进度，下次手动继续。</p></div><button onClick={refresh}>刷新进度</button></header>
  <div className="wf-stages">{[['剧本与提示词','导演台项目与分段','director'],['美术素材','项目协作清单与生图','collab'],['素材关联','按条核对 @ 引用','generation'],['视频生成','逐条提交、查询、下载'],['逐集归档','齐一集交一集'],['1080p 超分','Topaz 接入后自动接续'],['剪辑与输出','OpenFilm / CodeDance 接入']].map(([name,note,nav],i)=>{const s=stageState(i);return <div key={name} className={'wf-stage-'+s}><small>{String(i+1).padStart(2,'0')} · {stageText[s]}</small><strong>{name}</strong><span>{note}</span>{nav&&<button onClick={()=>onNavigate?.(nav)}>打开</button>}</div>})}</div>
  <div className="wf-preflight"><div><strong>预跑检查</strong><span>只检查配置与依赖，不提交生成、不产生费用。</span></div><button onClick={runPreflight} disabled={busy}>运行预跑检查</button>{preflight&&<div className={preflight.ok?'wf-pass':'wf-fail'}><b>{preflight.ok?'通过':'有待处理项'}</b><small>{preflight.at}</small>{!preflight.ok&&<ul>{preflight.checks.filter(c=>!c[1]).map(c=><li key={c[0]}>{c[0]}：{c[2]}</li>)}</ul>}</div>}</div>
  <div className="wf-columns"><section className="wf-card"><h3>新建工作流</h3><p>使用已准备的整本提示词与素材快照。整份剧本的自动拆解、美术生成及后期适配仍待接通。</p>
   <label>项目<select value={bookId} onChange={e=>{setBook(e.target.value);setConfirmed(false);}}><option value="">选择图视生成中的项目</option>{books.map(b=><option key={b.id} value={b.id}>{b.name} · {b.entries.length} 条</option>)}</select></label>
   {!books.length&&<button onClick={()=>onNavigate?.('generation')}>去图视生成准备提示词和素材</button>}
   <div className="wf-mode"><button aria-pressed={mode==='semi'} onClick={()=>setMode('semi')}>半自动</button><button aria-pressed={mode==='auto'} onClick={()=>setMode('auto')}>全自动接续</button></div>
   <p>{mode==='semi'?'保留你核对过的提示词与选图，AI 检查后依次生成、下载。':'从已备提示词开始，AI 按条选择图片并校验，明确项继续生成，疑问项单独停下。'}</p>
   <label>Agent 类型<select value={agentKind} onChange={e=>setAgentKind(e.target.value)}><option value="codex">Codex</option><option value="workbuddy">WorkBuddy</option><option value="other">其他兼容 Agent</option></select></label>
   <label>AI 检查 / 关联模型<select value={aiId} onChange={e=>setAi(e.target.value)}><option value="">选择已接入的 AI / Agent</option>{(state.apiProfiles||[]).map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label>
   <small>当前自动检查依据提示词、素材名称与类别；需要看图的疑问请回关联页面核对。</small>
   <div className="wf-required"><strong>启动前必须设置</strong><span>Agent 只负责按这些规则执行，不会自行替换用户选择。</span></div>
   <label>视觉风格<select value={visualStyle} onChange={e=>setVisualStyle(e.target.value)}><option>真人电影级</option><option>写实动漫</option><option>3D动漫</option><option>2D动漫</option></select></label>
   <label>视频生成渠道<select value={videoChannel} onChange={e=>setVideoChannel(e.target.value)}><option value="">选择视频渠道</option><option>行舟影视已接入渠道</option><option>本机 Agent 代理渠道</option><option>其他已配置渠道</option></select></label>
   <div className="wf-parameters"><label>画面比例<select value={ratio} onChange={e=>setRatio(e.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option></select></label><label>单条最高秒数<input type="number" min="1" max="3600" value={duration} onChange={e=>setDuration(e.target.value)}/></label><label>生成分辨率<select value={resolution} onChange={e=>setResolution(e.target.value)}><option>480p</option><option>720p</option><option>1080p</option></select></label></div>
   <div className="wf-parameters"><label>生图优先渠道<input value={imagePrimary} onChange={e=>setImagePrimary(e.target.value)} /></label><label>生图失败回退<input value={imageFallback} onChange={e=>setImageFallback(e.target.value)} /></label><label>超分目标<select value={upscaleTarget} onChange={e=>setUpscaleTarget(e.target.value)}><option>1080p</option><option>保持原分辨率</option></select></label></div>
   <small>条目已有时长优先；超出模型范围会拦截该条。超分目标为横屏 1920×1080 或竖屏 1080×1920。</small>
   <label>输出目录<button aria-label="选择输出目录" disabled={busy} onClick={()=>act(async()=>{const path=await api.adminWorkflowFolder();if(path)setFolder(path);})}>{folder||'选择文件夹'}</button></label>
   <details open><summary>后期交接规则（启动前设置）</summary><label>OpenFilm / CodeDance 模板<input value={editorTemplate} onChange={e=>setEditorTemplate(e.target.value)} /></label>{[['music','配乐与情绪规则'],['subtitles','字幕样式'],['ending','尾帧规则'],['versions','导出版本']].map(([key,label])=><label key={key}>{label}<textarea rows={2} value={post[key]} onChange={e=>setPost({...post,[key]:e.target.value})}/></label>)}</details>
   {mode==='semi'&&<label className="wf-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>本项目提示词、图片选择已人工核对</label>}
   <button className="wf-primary" disabled={busy||!book||!chosen||!aiId||!folder||mode==='semi'&&!confirmed} onClick={create}>保存预设并创建工作流</button><small>创建只保存预设；预跑通过后，点击右侧“开始 / 继续”才会调用 Agent 和视频接口。</small>
  </section>
  <section className="wf-card"><h3>运行与待处理</h3>{!runs.length?<p className="wf-empty">创建工作流后，在这里开始、暂停和查看逐集进度。</p>:<>
   <label>工作流<select value={run?.id||''} onChange={e=>setSelected(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{r.name} · {runLabels[r.status]}</option>)}</select></label>
   <div className="wf-summary"><strong>{run.items.filter(i=>i.status==='downloaded').length} / {run.items.length}</strong><span>视频已归档 · {runLabels[run.status]}</span></div>
   <p role="status">{run.message}</p><div className="wf-actions"><button className="wf-primary" disabled={busy||run.status==='running'||run.status==='awaiting-post'} onClick={()=>act(()=>api.adminWorkflowAction({id:run.id,action:'start'}))}>开始 / 继续</button><button disabled={busy||run.status!=='running'} onClick={()=>act(()=>api.adminWorkflowAction({id:run.id,action:'pause'}))}>暂停</button><button onClick={()=>act(()=>api.adminWorkflowOpen({id:run.id}))}>打开输出文件夹</button></div>
   <p>已提交的任务只查询原结果；失败或提交状态不明的条目不会自动重发。</p>
   <h4>分集交接</h4><div className="wf-episodes">{[...new Set(run.items.map(i=>i.episode))].map(ep=>{const items=run.items.filter(i=>i.episode===ep),ready=run.episodes.find(e=>e.number===ep);return <article key={ep}><strong>第 {ep} 集</strong><span>{items.filter(i=>i.status==='downloaded').length} / {items.length} 条</span><small>{ready?'本集清单已生成 · 待超分接入':'等待本集素材齐全'}</small></article>;})}</div>
   <label className="wf-check"><input type="checkbox" checked={issuesOnly} onChange={e=>setIssues(e.target.checked)}/>只看待核对与失败</label>
   <div className="wf-items">{run.items.filter(i=>!issuesOnly||['blocked','failed','uncertain'].includes(i.status)).map(i=><article key={i.id}><strong>{i.label} · {statuses[i.status]}</strong>{i.error&&<p>{i.error}</p>}{i.status==='blocked'&&<button disabled={busy} onClick={()=>act(()=>api.adminWorkflowAction({id:run.id,action:'retry',itemId:i.id}))}>重新检查该条</button>}</article>)}</div>
  </>}{error&&<p role="alert" className="wf-error">{error}</p>}</section></div>
 </section>;
}

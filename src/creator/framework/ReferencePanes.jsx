import React,{useState} from 'react';
import {Plus,Sparkles,Upload} from 'lucide-react';
import {CreatorDialog,SourceDialog} from '../CreatorDialogs.jsx';
import {Heading,AgentSelect,Panel,Empty,Tag,Field} from './FrameworkParts.jsx';

export function ReferencesPane({state,api,f,command,run,busy,onError,navigate}){
 const [sourceId,setSourceId]=useState(''),[tab,setTab]=useState('components'),[choose,setChoose]=useState(false);
 const source=f.sources.find(s=>s.id===sourceId)||f.sources[0];
 const accept=value=>{const source={...value,id:`source_${crypto.randomUUID()}`};if(command({type:'source.add',source})){setSourceId(source.id);setChoose(false);setTab('original');}};
 const upload=async()=>{try{const file=await api.importFullScript();if(file?.content?.trim())accept({name:file.fileName,content:file.content,filePath:file.filePath});else if(file)onError('文档没有可读取的文本。');}catch(e){onError(e.message);}};
 const insert=(c,withChildren=false)=>{if(!command({type:'component.confirm',id:c.id}))return;const content=c.adapted??c.summary??c.original;
 const group={title:c.title,goal:content,confirmed:false,source:{sourceId:c.sourceId,sourceEventId:c.sourceEventId,componentId:c.id}};command(withChildren?{type:'component.insertGroup',id:c.id,group:{...group,events:c.children||[]}}:{type:'group.add',group});};
 return <><Heading title="对标剧本" help="导入原稿，提取大事件；选中的卡片加入创作后继续修改。"><button className="secondary" onClick={upload}><Upload size={15}/>上传 TXT / Word</button><button className="secondary" onClick={()=>setChoose(true)}>从果子库选择</button><button className="primary" disabled={busy||!source?.content} onClick={()=>run({task:'frameworkExtract',sourceId:source.id})}><Sparkles size={15}/>提取大小事件</button></Heading>
 {source?<><div className="fw-toolbar"><select aria-label="对标来源" value={source.id} onChange={e=>setSourceId(e.target.value)}>{f.sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><div className="fw-seg"><button className={tab==='components'?'active':''} onClick={()=>setTab('components')}>事件卡片</button><button className={tab==='original'?'active':''} onClick={()=>setTab('original')}>来源原文</button></div><small>{source.content?.length.toLocaleString()} 字</small></div>
 {tab==='original'?<Panel title={source.name}><pre className="fw-reference-text">{source.content}</pre></Panel>:<><div className="fw-story-board">{f.components.filter(c=>c.sourceId===source.id).map(c=><article className="fw-story-card fw-reference-card" key={c.id}><header><strong>{c.title}</strong><Tag>对标素材</Tag></header><Field label={`${c.title}改稿`} draftKey={c.id+'adapt'} value={c.adapted??c.summary??c.original??''} placeholder="直接修改为你的故事" onCommit={adapted=>command({type:'component.update',id:c.id,patch:{adapted}})}/><details className="fw-card-notes"><summary>原文与拆解的小事件 · {c.children?.length||0}</summary><p>{c.original}</p>{c.children?.map((e,i)=><p key={e.id||i}><b>{i+1}. {e.title}</b><br/>{e.summary}</p>)}</details><footer>{!!c.children?.length&&<button className="secondary" onClick={()=>insert(c,true)}>连同小事件加入</button>}<button className="primary" onClick={()=>insert(c)}>加入大事件</button></footer></article>)}</div>{!f.components.some(c=>c.sourceId===source.id)&&<Empty>点击“提取大小事件”，拆解结果会以卡片显示在这里。</Empty>}</>}</>:<div className="fw-reference-empty"><Upload size={32}/><h3>从一份对标剧本开始</h3><p>支持 TXT、Word，也可以使用果子库里的稿件。</p><div className="fw-actions"><button className="primary" onClick={upload}>上传剧本 / 小说</button><button className="secondary" onClick={()=>setChoose(true)}>选择果子库稿件</button></div></div>}
 {choose&&<SourceDialog title="选择果子库稿件" state={state} api={api} onClose={()=>setChoose(false)} onError={onError} onChoose={accept}/>}</>;
}

export function SimulationPane({f,rows,run,busy,records,review,navigate,simulationRequest={}}){
 const [mode,setMode]=useState(simulationRequest.mode||'reorder'),[goal,setGoal]=useState(''),[components,setComponents]=useState([]);
 const {layer='groups',groupId}=simulationRequest,current=f.groups.find(g=>g.id===groupId),targetRows=rows.filter(r=>r.group?.id===groupId);
 const [after,setAfter]=useState(layer==='group'?simulationRequest.afterEventId||targetRows.at(-1)?.event.id||'':simulationRequest.afterGroupId||f.groups.at(-1)?.id||'');
 const matching=records.filter(r=>r.target?.task==='frameworkSimulate'&&r.target.layer===layer&&(layer!=='group'||r.target.groupId===groupId));
 return <div className="fw-simulation-tools"><p><strong>{layer==='group'?current?.title||'当前大事件':'大事件主线'}</strong></p><small>自动参考灵感、设定和全剧卡片。</small><div className="fw-seg"><button className={mode==='reorder'?'active':''} onClick={()=>setMode('reorder')}>排列与检查</button><button className={mode==='infer'?'active':''} onClick={()=>setMode('infer')}>向后推理</button></div>
 {mode==='infer'&&<label className="fw-field"><span>从这里继续</span><select aria-label="推理起点" value={after} onChange={e=>setAfter(e.target.value)}><option value="">从头推理</option>{(layer==='group'?targetRows.map(r=>({id:r.event.id,title:r.code+' · '+r.event.title})):f.groups).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>}
 <Field label="补充要求（可留空）" draftKey={`simulation-${layer}-${groupId||'all'}`} value={goal} onCommit={setGoal} rows={4} placeholder="例如：检查 A 与 B 的因果，或推理相遇后的下一步。"/>
 <details><summary>参考对标卡片（可选）</summary>{f.components.filter(c=>c.confirmed).map(c=><label className="fw-check" key={c.id}><input type="checkbox" checked={components.includes(c.id)} onChange={e=>setComponents(e.target.checked?[...components,c.id]:components.filter(id=>id!==c.id))}/>{c.title}</label>)}{!f.components.some(c=>c.confirmed)&&<p>暂无已确认对标卡片。</p>}</details>
 <AgentSelect purpose="simulation" label="模拟接口与 Agent"/><button className="primary" disabled={busy||layer==='group'&&!current} onClick={()=>run({task:'frameworkSimulate',layer,mode,...(layer==='group'?{groupId}:{}),componentIds:components,...(mode==='infer'&&after?(layer==='group'?{afterEventId:after}:{afterGroupId:after}):{})},goal)}><Sparkles size={15}/>{mode==='infer'?'推理后续卡片':'模拟排序与衔接'}</button>
 <small>固定卡片会保留；新方案先预览，再由你采用。</small>{navigate&&<button className="secondary" disabled={busy} onClick={()=>navigate('world')}>打开持续世界推演</button>}{matching.length>0&&<details><summary>本处模拟记录 · {matching.length}</summary>{matching.slice().reverse().map(r=><div className="fw-note" key={r.id}><button className="secondary" onClick={()=>review(r.id)}>{r.target.mode==='infer'?'向后推理':'排列组合'} · {r.status==='adopted'?'已采用':'查看结果'}</button></div>)}</details>}</div>;
}

export function ReferenceCardPicker({f,command,onClose}){
 const [selected,setSelected]=useState([]),[search,setSearch]=useState(''),[withChildren,setWithChildren]=useState(false),[added,setAdded]=useState(0);
 const used=new Set(f.groups.map(g=>g.source?.componentId).filter(Boolean));
 const shown=f.components.filter(c=>`${c.title} ${c.summary||''}`.includes(search));
 const available=selected.filter(id=>f.components.some(c=>c.id===id)&&!used.has(id));
 const toggle=id=>setSelected(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 const insert=()=>{if(command({type:'components.insertGroups',ids:available,withChildren})){setAdded(n=>n+available.length);setSelected([]);}};
 return <CreatorDialog title="选择对标事件卡片" onClose={onClose} className="fw-reference-picker">
  <div className="fw-toolbar"><input aria-label="搜索对标事件" placeholder="搜索事件标题或内容" value={search} onChange={e=>setSearch(e.target.value)}/><button className="secondary" onClick={()=>setSelected(shown.filter(c=>!used.has(c.id)).map(c=>c.id))}>全选当前结果</button><button className="secondary" onClick={()=>setSelected([])}>清空选择</button></div>
  <div className="fw-picker-list">{shown.map(c=><label key={c.id} className={`fw-picker-item ${used.has(c.id)?'added':''}`}><input type="checkbox" aria-label={`选择${c.title}`} checked={available.includes(c.id)} disabled={used.has(c.id)} onChange={()=>toggle(c.id)}/><div><strong>{c.title}</strong><small>{used.has(c.id)?'已加入':f.sources.find(s=>s.id===c.sourceId)?.name||'对标素材'}</small><p>{c.adapted??c.summary??c.original}</p></div></label>)}</div>
  {!shown.length&&<Empty>{f.components.length?'没有匹配的事件。':'请先在“对标剧本”导入原稿并提取事件。'}</Empty>}
  <footer><label className="fw-check"><input type="checkbox" checked={withChildren} onChange={e=>setWithChildren(e.target.checked)}/>连同小事件加入</label><small role="status">{added?`本次已加入 ${added} 张`:`已选 ${available.length} 张`}</small><button className="secondary" onClick={onClose}>完成</button><button className="primary" disabled={!available.length} onClick={insert}>加入选中 {available.length} 张</button></footer>
 </CreatorDialog>;
}

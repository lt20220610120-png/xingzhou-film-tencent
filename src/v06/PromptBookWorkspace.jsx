import React,{useEffect,useRef,useState} from 'react';
import {Upload,FolderOpen,Trash2} from 'lucide-react';
import {parsePromptBook,bookOutline,entryValue,saveEntryValue,mergeEpisodeMedia,clearPromptBook,bookSharedReferences,restoreEntryReference} from '../../core/promptBook.js';
import {GenerationComposer} from './GenerationComposer.jsx';
import {linkedPromptBook,loadFreshBinding,validateLinkedSubmission} from '../../core/promptArtBinding.js';
import {beginImportedBinding,importedEntryValue,validateImportedSubmission} from '../../core/importedArtBinding.js';
import ImportedArtBindingPanel from './ImportedArtBindingPanel.jsx';
import {returnToManual,importedAutoSummary} from '../../core/importedArtAuto.js';

export function PromptBookWorkspace({state,setState,api,onSubmit,accountId}){
 const workflow=state.generationWorkflow||{},books=(workflow.books||[]).filter(book=>(!book.linkedProjectId||book.accountId===accountId)&&(!book.importedBinding||book.importedBinding.accountId===accountId));
 const book=books.find(b=>b.id===workflow.selectedBookId)||books[0];
 const entry=book?.entries.find(e=>e.id===book.selectedEntryId)||book?.entries[0];
 const outline=book?bookOutline(book):[];
 const episode=outline.find(e=>e.number===entry?.episode),scene=episode?.scenes.find(s=>s.number===entry?.scene);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const importing=useRef(false);
 const [linkedProjects,setLinkedProjects]=useState(null),[linkedProjectId,setLinkedProjectId]=useState(''),[linkedAvailable,setLinkedAvailable]=useState(false);
 const scope=useRef(accountId);scope.current=accountId;
 useEffect(()=>{let alive=true;api.promptArtStatus?.().then(status=>{if(alive)setLinkedAvailable(Boolean(status?.enabled));});return()=>{alive=false;};},[api]);
 const changeWorkflow=transform=>setState(current=>({...current,generationWorkflow:{...transform(current.generationWorkflow||{}),updatedAt:new Date().toISOString()}}));
 const updateBook=(id,transform)=>changeWorkflow(workflow=>({...workflow,books:(workflow.books||[]).map(b=>b.id===id?transform(b):b)}));
 const select=id=>updateBook(book.id,b=>({...b,selectedEntryId:id}));
 const pickLinked=async()=>{
  setError('');try{const rows=(await api.promptArtList({accountId})).filter(row=>!row.projectId.startsWith('imported:'));if(scope.current!==accountId)return;setLinkedProjects(rows);setLinkedProjectId(rows[0]?.projectId||'');}catch(problem){setError(problem.message);}
 };
 const importLinked=async()=>{
  if(importing.current||!linkedProjectId)return;importing.current=true;setBusy(true);setError('');
  try{
   const {saved,snapshot}=await loadFreshBinding({api,projectId:linkedProjectId,accountId,localSources:state.directorProjects});
   const next=linkedPromptBook(snapshot,saved.decisions,accountId);
   if(scope.current!==accountId)throw Error('账号已变化，未载入旧账号项目');
   if(books.some(book=>book.id===next.id)&&!window.confirm('重新载入会替换本联动项目在图视生成中的编辑；已生成视频保留。继续载入？'))return;
   changeWorkflow(workflow=>({...workflow,selectedBookId:next.id,books:[...(workflow.books||[]).filter(book=>book.id!==next.id),next]}));
   setLinkedProjects(null);const ready=Object.values(next.drafts).filter(draft=>draft.referenceBindingMode==='confirmed').length;
   setNotice(`已载入 ${next.entries.length} 条，其中 ${ready} 条关联和图片就绪；其余条目保留待核对。`);
  }catch(problem){setError(problem.message);}finally{importing.current=false;setBusy(false);}
 };
 const importDocument=async standalone=>{
  if(importing.current)return;importing.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(!api.importFullScript)throw new Error('请在桌面软件内导入文档。');
   const document=await api.importFullScript();if(!document)return;
   const parsed=parsePromptBook(document.content,document.fileName);
   const next=standalone===true?beginImportedBinding(parsed,accountId):parsed;
   changeWorkflow(workflow=>({...workflow,selectedBookId:next.id,books:[...(workflow.books||[]),next]}));
   setNotice(`已读取 ${next.entries.length} 条提示词。每条修改自动保存；重复编号已按文档出现顺序区分。`);
  }catch(e){setError(e.message);}finally{importing.current=false;setBusy(false);}
 };
 const importFolder=async mode=>{
  if(importing.current||!entry)return;importing.current=true;setBusy(true);setError('');setNotice('');
  const bookId=book.id,episodeNumber=entry.episode;
  try{
   if(book.importedBinding?.stage==='generation')throw Error('请先返回独立关联，再导入新增素材并核对');
   if(!api.generationImportEpisodeMedia)throw new Error('请在最新版桌面软件内导入素材文件夹。');
   const result=await api.generationImportEpisodeMedia({mode,episode:episodeNumber});if(!result)return;
   updateBook(bookId,b=>mergeEpisodeMedia(b,result.episodes,result.scenes));
   const known=new Set(book.entries.map(e=>String(e.episode)));
   const extra=Object.keys(result.episodes).filter(n=>!known.has(n)&&result.episodes[n].length);
   setNotice([`已读取 ${result.count} 个素材，按场景挂载并自动去重；旧版集文件夹仍按集共享。`,...result.warnings,extra.length?`第 ${extra.join('、')} 集当前没有提示词，素材已保留。`:''].filter(Boolean).join(' '));
  }catch(e){setError(e.message);}finally{importing.current=false;setBusy(false);}
 };
 const importFiles=async kind=>{
  if(importing.current||!entry)return;importing.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(book.importedBinding?.stage==='generation')throw Error('请先返回独立关联，再导入新增素材并核对');
   if(!api.generationImportEpisodeFiles)throw new Error('请更新桌面软件后再导入本集素材。');
   const result=await api.generationImportEpisodeFiles({episode:entry.episode,kind});if(!result)return;
   updateBook(book.id,b=>mergeEpisodeMedia(b,result.episodes));
   setNotice(`已将 ${result.count} 个${{image:'图片',audio:'音频',video:'视频'}[kind]}素材挂载到第 ${entry.episode} 集，切换本集提示词仍可使用。`);
  }catch(e){setError(e.message);}finally{importing.current=false;setBusy(false);}
 };
 const clearCurrent=async()=>{
  if(!book||importing.current||!window.confirm(`确定清除“${book.name}”的全部提示词、编辑进度和已导入素材吗？生成结果不受影响。`))return;
  importing.current=true;setBusy(true);setError('');setNotice('');
  try{
   const allRefs=b=>[...Object.values(b.episodeMedia||{}).flat(),...Object.values(b.sceneMedia||{}).flat(),...Object.values(b.drafts||{}).flatMap(d=>d.extraReferences||[])];
   const localRefs=[];
   for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);if(key!=='xz-generation-drafts'&&!key?.startsWith('xz-shot-draft:'))continue;
    const data=JSON.parse(localStorage.getItem(key)||'{}');localRefs.push(...(key==='xz-generation-drafts'?Object.values(data||{}).flatMap(d=>d?.references||[]):data?.value?.references||[]));
   }
   const jobs=await api.generationList?.()||[];
   const generationWorkflow={...clearPromptBook(workflow,book.id),updatedAt:new Date().toISOString()};
   await api.saveState?.({...state,generationWorkflow});
   setState(current=>({...current,generationWorkflow:{...clearPromptBook(current.generationWorkflow||{},book.id),updatedAt:generationWorkflow.updatedAt}}));
   const retainedPaths=[...books.filter(b=>b.id!==book.id).flatMap(allRefs),...jobs.flatMap(job=>job.references||[]),...localRefs].map(r=>r.filePath).filter(Boolean);
   try{await api.generationDeleteBookMedia?.({paths:allRefs(book).map(r=>r.filePath).filter(Boolean),retainedPaths});
    setNotice('当前提示词项目与素材已清除，可导入新项目。');
   }catch(e){setNotice('当前提示词项目已清除，但部分本地素材文件未能删除。');}
  }catch(e){setError(e.message);}finally{importing.current=false;setBusy(false);}
 };
 const references=entry?bookSharedReferences(book,entry):[];
 const bindingActive=book?.importedBinding&&book.importedBinding.stage!=='manual';
 const currentValue=entry?(bindingActive?importedEntryValue(book,entry):entryValue(book,entry)):null;
 const reviewing=book?.importedBinding?.stage==='review';
 const canRestore=!bindingActive&&!book?.linkedProjectId&&!currentValue?.referenceBindingMode;
 const removedIds=new Set(book?.drafts?.[entry?.id]?.excludedIds||[]);
 const restoreOne=ref=>{updateBook(book.id,b=>restoreEntryReference(b,entry.id,ref.id));setNotice(`已恢复 ${ref.name}，仅影响当前条目 ${entry.label}。`);};
 const exitAssociation=async()=>{
  const currentBook=book,projectId=`imported:${book.id}`;
  updateBook(book.id,returnToManual);setBusy(false);setError('');setNotice('已返回原编辑模式，提示词、素材和 AI 整理进度均已保留。');
  requestAnimationFrame(()=>document.querySelector('.generation-composer')?.scrollIntoView({block:'start'}));
  try{
   const saved=await api.promptArtLoad({accountId,projectId});
   if(scope.current!==accountId)return;
   if(saved?.enabled){
    const next=await api.promptArtSave({accountId,projectId,baseRevision:saved.revision,data:{...saved,enabled:false}});
    if(scope.current===accountId)updateBook(currentBook.id,current=>({...current,importedBinding:{...current.importedBinding,storeRevision:next.revision}}));
   }
  }catch(problem){if(scope.current===accountId)setError(`已退出。撤销旧关联记录失败：${problem.message}；请勿在其他窗口使用旧关联。`);}
 };
 const startAssociation=async()=>{
  if(importing.current)return;importing.current=true;setBusy(true);setError('');
  try{
   let revision=book.importedBinding?.storeRevision||0;
   if(book.importedBinding){
    const projectId=`imported:${book.id}`,saved=await api.promptArtLoad({accountId,projectId});
    if((saved?.revision||0)!==revision)throw Error('关联已被其他窗口更新，请重新打开项目');
    if(saved){const next=await api.promptArtSave({accountId,projectId,baseRevision:revision,data:{...saved,enabled:false}});revision=next.revision;}
   }
   if(scope.current!==accountId)throw Error('账号已变化');
   updateBook(book.id,current=>{const next=beginImportedBinding(current,accountId);return {...next,importedBinding:{...next.importedBinding,storeRevision:revision}};});
  }catch(problem){setError(problem.message);}finally{importing.current=false;setBusy(false);}
 };
 const saveGenerationValue=value=>{
  if(bindingActive){
   if(value.prompt!==currentValue.prompt||JSON.stringify(value.references)!==JSON.stringify(currentValue.references)){setError('请点击“返回独立关联”修改提示词或选图，然后重新确认');return;}
   const preferences=Object.fromEntries(Object.entries(value).filter(([key])=>!['prompt','references','extraReferences','excludedIds','overrides','referenceBindingMode'].includes(key)&&!key.startsWith('binding')));
   updateBook(book.id,current=>({...current,settings:{...current.settings,...preferences},drafts:{...current.drafts,[entry.id]:{...current.drafts?.[entry.id],...preferences}}}));return;
  }
  updateBook(book.id,b=>saveEntryValue(b,entry.id,value,currentValue));
 };
 const submit=async input=>{
  if(book.linkedProjectId)await validateLinkedSubmission({api,book,entry,value:input,accountId,localSources:state.directorProjects});
  if(bindingActive)validateImportedSubmission(await api.promptArtLoad({accountId,projectId:input.bindingProjectId}),input,accountId);
  return onSubmit({...input,promptBookId:book.id,promptEntryId:entry.id,promptLabel:entry.label});
 };
 return <section className="prompt-book-workspace" aria-label="整本提示词与素材">
  {linkedAvailable&&<div className="prompt-art-actions"><button disabled={busy} onClick={()=>importDocument(true)}>上传提示词并先关联图片</button>{book&&!book.linkedProjectId&&!reviewing&&<button disabled={busy} onClick={startAssociation}>{book.importedBinding?'返回独立关联':'先关联现有提示词与图片'}</button>}{reviewing&&<button disabled={busy} onClick={()=>importFiles('image')}>上传本集图片</button>}</div>}
  {linkedAvailable&&<div className="prompt-art-panel"><button disabled={busy} onClick={pickLinked}>从联动美术项目载入</button>{linkedProjects&&<><label>联动项目<select aria-label="联动项目" disabled={busy} value={linkedProjectId} onChange={event=>setLinkedProjectId(event.target.value)}>{linkedProjects.map(project=><option key={project.projectId} value={project.projectId}>{project.name}</option>)}</select></label>{!linkedProjects.length&&<p>请先到项目协作的清单核实开启“提示词联动美术”。</p>}<button disabled={busy||!linkedProjectId} onClick={importLinked}>载入已确认关联</button></>}</div>}
  <div className="prompt-book-toolbar"><div><h2>整本提示词与素材</h2><p>上传含【1-1-1】编号的 TXT 或 Word（.docx），按集、场景逐条生成。提示词与素材会保存在本机，直到清除当前项目。</p></div><div className="prompt-book-actions"><button className="secondary" disabled={busy} onClick={importDocument}><Upload size={16}/>{busy?'正在导入…':'上传整本提示词'}</button><button className="danger" disabled={busy||!book} onClick={clearCurrent}><Trash2 size={16}/>清除当前项目</button></div></div>
  {books.length>0&&<label className="prompt-book-select">提示词文档<select aria-label="提示词文档" disabled={busy} value={book.id} onChange={e=>{const id=e.target.value;changeWorkflow(workflow=>({...workflow,selectedBookId:id}));setNotice('');setError('');}}>{books.map(b=><option key={b.id} value={b.id}>{b.name}（{b.entries.length} 条）</option>)}</select></label>}
  {error&&<p className="collab-error" role="alert">{error}</p>}{notice&&<p className="prompt-book-notice" role="status">{notice}</p>}
  {entry&&<>
   <nav className="prompt-book-navigation" aria-label="提示词目录">
    <label>集数<select aria-label="提示词集数" disabled={busy} value={entry.episode} onChange={e=>select(outline.find(x=>x.number===+e.target.value).scenes[0].entries[0].id)}>{outline.map(x=><option key={x.number} value={x.number}>第 {x.number} 集</option>)}</select></label>
    <label>场景<select aria-label="提示词场景" disabled={busy} value={entry.scene} onChange={e=>select(episode.scenes.find(x=>x.number===+e.target.value).entries[0].id)}>{episode.scenes.map(x=><option key={x.number} value={x.number}>场景 {x.number}</option>)}</select></label>
    <div className="prompt-book-entries" aria-label="场景提示词">{scene.entries.map(e=><button key={e.id} aria-pressed={e.id===entry.id} className={e.id===entry.id?'active':''} disabled={busy} onClick={()=>select(e.id)}>{e.label}</button>)}</div>
   </nav>
   <div className="prompt-book-media"><div><strong>场景 {entry.episode}-{entry.scene} 素材</strong><small>{references.length?`图片 ${references.filter(r=>r.kind==='image').length} · 视频 ${references.filter(r=>r.kind==='video').length} · 音频 ${references.filter(r=>r.kind==='audio').length}；按场挂载，集级素材共享，移除只影响当前条目`:'尚未导入素材，可直接编辑提示词并生成'}</small></div><button disabled={busy} onClick={()=>importFolder('episode')}><FolderOpen size={15}/>导入本集文件夹</button><button disabled={busy} onClick={()=>importFolder('series')}><FolderOpen size={15}/>导入整部素材文件夹</button>{references.length>0&&<details className="prompt-book-media-details"><summary>查看当前场景已挂载素材（{references.length}）</summary><div>{references.map(ref=>{const removed=removedIds.has(ref.id);return <button type="button" key={ref.id} className={removed?'prompt-media-removed':'prompt-media-included'} disabled={busy||!canRestore||!removed} aria-label={removed?`恢复素材 ${ref.name}`:`已保留素材 ${ref.name}`} title={removed?(canRestore?'点击仅恢复这一个素材':'请在关联页面修改并重新确认'):'本条已保留'} onClick={()=>restoreOne(ref)}>{ref.kind==='image'?'图片':ref.kind==='audio'?'音频':'视频'} · {ref.name}<b>{removed?'↶ 恢复':'已保留'}</b></button>;})}</div></details>}</div>
   <div className="prompt-book-current"><strong>正在编辑 {entry.label}</strong>{entry.recommendedDurationSeconds&&<span className="prompt-duration">建议生成时长 {entry.recommendedDurationSeconds} 秒{entry.durationStatus==='needs-review'?' · 时长待复核':''}</span>}<span>文字修改自动保存</span>{canRestore&&!!book.drafts?.[entry.id]?.excludedIds?.length&&<button disabled={busy} onClick={()=>updateBook(book.id,b=>({...b,drafts:{...b.drafts,[entry.id]:{...b.drafts[entry.id],excludedIds:[],autoReferenceExclusions:[],autoReferenceSignature:null}}}))}>恢复本条移除的素材</button>}</div>
   {bindingActive&&!reviewing&&<div className="imported-binding-summary"><span>AI 关联结果：{importedAutoSummary(book).ready} 条就绪，{importedAutoSummary(book).pending} 条待处理</span><button onClick={startAssociation}>查看待处理项</button><button onClick={exitAssociation}>返回原编辑模式</button></div>}
   {reviewing?<ImportedArtBindingPanel key={`${book.id}/${accountId}`} book={book} entry={entry} state={state} api={api} accountId={accountId} onUpdate={transform=>updateBook(book.id,transform)} onBusy={setBusy} onExit={exitAssociation} onSelect={select}/>:<GenerationComposer key={`${book.id}/${entry.id}/${bindingActive?'bound':'manual'}`} state={state} api={api} kind="video" value={currentValue} referenceCandidates={bindingActive?[]:references} onChange={saveGenerationValue} onSubmit={submit} onPick={importFiles} disabled={busy} episodeReferences/>}
  </>}
 </section>;
}

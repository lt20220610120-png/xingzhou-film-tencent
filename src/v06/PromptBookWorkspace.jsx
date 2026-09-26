import React,{useRef,useState} from 'react';
import {Upload,FolderOpen,Trash2} from 'lucide-react';
import {parsePromptBook,bookOutline,entryValue,saveEntryValue,mergeEpisodeMedia,clearPromptBook} from '../../core/promptBook.js';
import {GenerationComposer} from './GenerationComposer.jsx';

export function PromptBookWorkspace({state,setState,api,onSubmit}){
 const workflow=state.generationWorkflow||{},books=workflow.books||[];
 const book=books.find(b=>b.id===workflow.selectedBookId)||books[0];
 const entry=book?.entries.find(e=>e.id===book.selectedEntryId)||book?.entries[0];
 const outline=book?bookOutline(book):[];
 const episode=outline.find(e=>e.number===entry?.episode),scene=episode?.scenes.find(s=>s.number===entry?.scene);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const importing=useRef(false);
 const changeWorkflow=transform=>setState(current=>({...current,generationWorkflow:{...transform(current.generationWorkflow||{}),updatedAt:new Date().toISOString()}}));
 const updateBook=(id,transform)=>changeWorkflow(workflow=>({...workflow,books:(workflow.books||[]).map(b=>b.id===id?transform(b):b)}));
 const select=id=>updateBook(book.id,b=>({...b,selectedEntryId:id}));
 const importDocument=async()=>{
  if(importing.current)return;importing.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(!api.importFullScript)throw new Error('请在桌面软件内导入文档。');
   const document=await api.importFullScript();if(!document)return;
   const next=parsePromptBook(document.content,document.fileName);
   changeWorkflow(workflow=>({...workflow,selectedBookId:next.id,books:[...(workflow.books||[]),next]}));
   setNotice(`已读取 ${next.entries.length} 条提示词。每条修改自动保存；重复编号已按文档出现顺序区分。`);
  }catch(e){setError(e.message);}finally{importing.current=false;setBusy(false);}
 };
 const importFolder=async mode=>{
  if(importing.current||!entry)return;importing.current=true;setBusy(true);setError('');setNotice('');
  const bookId=book.id,episodeNumber=entry.episode;
  try{
   if(!api.generationImportEpisodeMedia)throw new Error('请在最新版桌面软件内导入素材文件夹。');
   const result=await api.generationImportEpisodeMedia({mode,episode:episodeNumber});if(!result)return;
   updateBook(bookId,b=>mergeEpisodeMedia(b,result.episodes));
   const known=new Set(book.entries.map(e=>String(e.episode)));
   const extra=Object.keys(result.episodes).filter(n=>!known.has(n)&&result.episodes[n].length);
   setNotice([`已读取 ${result.count} 个素材，按集共享并自动去重。`,...result.warnings,extra.length?`第 ${extra.join('、')} 集当前没有提示词，素材已保留。`:''].filter(Boolean).join(' '));
  }catch(e){setError(e.message);}finally{importing.current=false;setBusy(false);}
 };
 const importFiles=async kind=>{
  if(importing.current||!entry)return;importing.current=true;setBusy(true);setError('');setNotice('');
  try{
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
   const allRefs=b=>[...Object.values(b.episodeMedia||{}).flat(),...Object.values(b.drafts||{}).flatMap(d=>d.extraReferences||[])];
   const generationWorkflow={...clearPromptBook(workflow,book.id),updatedAt:new Date().toISOString()};
   await api.saveState?.({...state,generationWorkflow});
   setState(current=>({...current,generationWorkflow:{...clearPromptBook(current.generationWorkflow||{},book.id),updatedAt:generationWorkflow.updatedAt}}));
   const jobs=await api.generationList?.().catch(()=>[])||[];
   const retainedPaths=[...books.filter(b=>b.id!==book.id).flatMap(allRefs),...jobs.flatMap(job=>job.references||[])].map(r=>r.filePath).filter(Boolean);
   try{await api.generationDeleteBookMedia?.({paths:allRefs(book).map(r=>r.filePath).filter(Boolean),retainedPaths});
    setNotice('当前提示词项目与素材已清除，可导入新项目。');
   }catch(e){setNotice('当前提示词项目已清除，但部分本地素材文件未能删除。');}
  }catch(e){setError(e.message);}finally{importing.current=false;setBusy(false);}
 };
 const references=entry?(book.episodeMedia?.[entry.episode]||[]):[];
 const currentValue=entry?entryValue(book,entry):null;
 return <section className="prompt-book-workspace" aria-label="整本提示词与素材">
  <div className="prompt-book-toolbar"><div><h2>整本提示词与素材</h2><p>上传含【1-1-1】编号的 TXT 或 Word（.docx），按集、场景逐条生成。提示词与素材会保存在本机，直到清除当前项目。</p></div><button disabled={busy} onClick={importDocument}><Upload size={16}/>{busy?'正在导入…':'上传整本提示词'}</button>{book&&<button className="danger" disabled={busy} onClick={clearCurrent}><Trash2 size={15}/>清除当前项目</button>}</div>
  {books.length>0&&<label className="prompt-book-select">提示词文档<select aria-label="提示词文档" disabled={busy} value={book.id} onChange={e=>{const id=e.target.value;changeWorkflow(workflow=>({...workflow,selectedBookId:id}));setNotice('');setError('');}}>{books.map(b=><option key={b.id} value={b.id}>{b.name}（{b.entries.length} 条）</option>)}</select></label>}
  {error&&<p className="collab-error" role="alert">{error}</p>}{notice&&<p className="prompt-book-notice" role="status">{notice}</p>}
  {entry&&<>
   <nav className="prompt-book-navigation" aria-label="提示词目录">
    <label>集数<select aria-label="提示词集数" disabled={busy} value={entry.episode} onChange={e=>select(outline.find(x=>x.number===+e.target.value).scenes[0].entries[0].id)}>{outline.map(x=><option key={x.number} value={x.number}>第 {x.number} 集</option>)}</select></label>
    <label>场景<select aria-label="提示词场景" disabled={busy} value={entry.scene} onChange={e=>select(episode.scenes.find(x=>x.number===+e.target.value).entries[0].id)}>{episode.scenes.map(x=><option key={x.number} value={x.number}>场景 {x.number}</option>)}</select></label>
    <div className="prompt-book-entries" aria-label="场景提示词">{scene.entries.map(e=><button key={e.id} aria-pressed={e.id===entry.id} className={e.id===entry.id?'active':''} disabled={busy} onClick={()=>select(e.id)}>{e.label}</button>)}</div>
   </nav>
   <div className="prompt-book-media"><div><strong>第 {entry.episode} 集素材</strong><small>{references.length?`图片 ${references.filter(r=>r.kind==='image').length} · 视频 ${references.filter(r=>r.kind==='video').length} · 音频 ${references.filter(r=>r.kind==='audio').length}；同集共享，移除只影响当前条目`:'尚未导入素材，可直接编辑提示词并生成'}</small></div><button disabled={busy} onClick={()=>importFolder('episode')}><FolderOpen size={15}/>导入本集文件夹</button><button disabled={busy} onClick={()=>importFolder('series')}><FolderOpen size={15}/>导入整部素材文件夹</button>{references.length>0&&<details className="prompt-book-media-details"><summary>查看本集已挂载素材（{references.length}）</summary><div>{references.map(ref=><span key={ref.id}>{ref.kind==='image'?'图片':ref.kind==='audio'?'音频':'视频'} · {ref.name}</span>)}</div></details>}</div>
   <div className="prompt-book-current"><strong>正在编辑 {entry.label}</strong><span>文字修改自动保存</span>{!!book.drafts?.[entry.id]?.excludedIds?.length&&<button disabled={busy} onClick={()=>updateBook(book.id,b=>({...b,drafts:{...b.drafts,[entry.id]:{...b.drafts[entry.id],excludedIds:[]}}}))}>恢复本条移除的素材</button>}</div>
   <GenerationComposer key={`${book.id}/${entry.id}`} state={state} api={api} kind="video" value={currentValue} onChange={value=>updateBook(book.id,b=>saveEntryValue(b,entry.id,value,currentValue))} onSubmit={input=>onSubmit({...input,promptBookId:book.id,promptEntryId:entry.id,promptLabel:entry.label})} onPick={importFiles} disabled={busy} episodeReferences/>
  </>}
 </section>;
}

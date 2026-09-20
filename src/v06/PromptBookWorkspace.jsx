import React,{useRef,useState} from 'react';
import {Upload,FolderOpen} from 'lucide-react';
import {parsePromptBook,bookOutline,entryValue,saveEntryValue,mergeEpisodeMedia} from '../../core/promptBook.js';
import {GenerationComposer} from './GenerationComposer.jsx';

export function PromptBookWorkspace({state,setState,api,onSubmit}){
 const workflow=state.generationWorkflow||{},books=workflow.books||[];
 const book=books.find(b=>b.id===workflow.selectedBookId)||books[0];
 const entry=book?.entries.find(e=>e.id===book.selectedEntryId)||book?.entries[0];
 const outline=book?bookOutline(book):[];
 const episode=outline.find(e=>e.number===entry?.episode),scene=episode?.scenes.find(s=>s.number===entry?.scene);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const importing=useRef(false);
 const updateBook=(id,transform)=>setState(current=>({...current,generationWorkflow:{...current.generationWorkflow,books:(current.generationWorkflow?.books||[]).map(b=>b.id===id?transform(b):b)}}));
 const select=id=>updateBook(book.id,b=>({...b,selectedEntryId:id}));
 const importDocument=async()=>{
  if(importing.current)return;importing.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(!api.importFullScript)throw new Error('请在桌面软件内导入文档。');
   const document=await api.importFullScript();if(!document)return;
   const next=parsePromptBook(document.content,document.fileName);
   setState(current=>({...current,generationWorkflow:{...current.generationWorkflow,selectedBookId:next.id,books:[...(current.generationWorkflow?.books||[]),next]}}));
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
 const references=entry?(book.episodeMedia?.[entry.episode]||[]):[];
 const currentValue=entry?entryValue(book,entry):null;
 return <section className="prompt-book-workspace" aria-label="整本提示词与素材">
  <div className="prompt-book-toolbar"><div><h2>整本提示词与素材</h2><p>上传含【1-1-1】编号的 TXT 或 Word（.docx），按集、场景逐条生成。</p></div><button disabled={busy} onClick={importDocument}><Upload size={16}/>{busy?'正在导入…':'上传整本提示词'}</button></div>
  {books.length>0&&<label className="prompt-book-select">提示词文档<select aria-label="提示词文档" disabled={busy} value={book.id} onChange={e=>{const id=e.target.value;setState(current=>({...current,generationWorkflow:{...current.generationWorkflow,selectedBookId:id}}));setNotice('');setError('');}}>{books.map(b=><option key={b.id} value={b.id}>{b.name}（{b.entries.length} 条）</option>)}</select></label>}
  {error&&<p className="collab-error" role="alert">{error}</p>}{notice&&<p className="prompt-book-notice" role="status">{notice}</p>}
  {entry&&<>
   <nav className="prompt-book-navigation" aria-label="提示词目录">
    <label>集数<select aria-label="提示词集数" disabled={busy} value={entry.episode} onChange={e=>select(outline.find(x=>x.number===+e.target.value).scenes[0].entries[0].id)}>{outline.map(x=><option key={x.number} value={x.number}>第 {x.number} 集</option>)}</select></label>
    <label>场景<select aria-label="提示词场景" disabled={busy} value={entry.scene} onChange={e=>select(episode.scenes.find(x=>x.number===+e.target.value).entries[0].id)}>{episode.scenes.map(x=><option key={x.number} value={x.number}>场景 {x.number}</option>)}</select></label>
    <div className="prompt-book-entries" aria-label="场景提示词">{scene.entries.map(e=><button key={e.id} aria-pressed={e.id===entry.id} className={e.id===entry.id?'active':''} disabled={busy} onClick={()=>select(e.id)}>{e.label}</button>)}</div>
   </nav>
   <div className="prompt-book-media"><div><strong>第 {entry.episode} 集素材</strong><small>{references.length?`${references.length} 个素材 · 同集共享，移除只影响当前条目`:'尚未导入素材，可直接编辑提示词并生成'}</small></div><button disabled={busy} onClick={()=>importFolder('episode')}><FolderOpen size={15}/>导入本集文件夹</button><button disabled={busy} onClick={()=>importFolder('series')}><FolderOpen size={15}/>导入整部素材文件夹</button></div>
   <div className="prompt-book-current"><strong>正在编辑 {entry.label}</strong><span>文字修改自动保存</span>{!!book.drafts?.[entry.id]?.excludedIds?.length&&<button disabled={busy} onClick={()=>updateBook(book.id,b=>({...b,drafts:{...b.drafts,[entry.id]:{...b.drafts[entry.id],excludedIds:[]}}}))}>恢复本条移除的素材</button>}</div>
   <GenerationComposer key={`${book.id}/${entry.id}`} state={state} api={api} kind="video" value={currentValue} onChange={value=>updateBook(book.id,b=>saveEntryValue(b,entry.id,value,currentValue))} onSubmit={input=>onSubmit({...input,promptBookId:book.id,promptEntryId:entry.id,promptLabel:entry.label})} onImportingChange={value=>{importing.current=value;setBusy(value);}} disabled={busy} episodeReferences/>
  </>}
 </section>;
}

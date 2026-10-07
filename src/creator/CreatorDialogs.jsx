import {FormattedText} from '../components/FormattedText.jsx';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Save } from 'lucide-react';
import { ipBodyCount } from '../../core/ipWorkspace.js';
import { creatorExportStatus } from '../../core/creatorExportStatus.js';
import {frameworkDraftText} from '../../core/frameworkWorkflow.js';
import { buildCreatorText, archiveCreatorProject } from '../../core/creatorWorkspace.js';

export function CreatorDialog({title,onClose,children,className='',headerActions}) {
 return createPortal(<div className="veil creator-veil" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} className={`creator-dialog ${className}`}><header><h2>{title}</h2>{headerActions&&<div className="creator-dialog-actions">{headerActions}</div>}<button className="ghost" aria-label="关闭窗口" onClick={onClose}><X size={18}/></button></header>{children}</section></div>,document.body);
}
export function ExportDialog({project,kind,api,setState,onClose,archive=false,initialSide='output',single=false}) {
 const [contentScope,setContentScope]=useState('script'),[side,setSide]=useState(initialSide),[includeSections,setIncludeSections]=useState(!single&&kind==='script'&&project.creator.mode==='rewrite'),[format,setFormat]=useState('docx'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState('');
 const framework=project.creator.mode==='framework',staged=framework&&contentScope!=='script';
 const content=staged?frameworkDraftText(project,contentScope):buildCreatorText(project,kind,side,{includeSections});
 const {missing,unconfirmed,shortIP}=creatorExportStatus(project,kind,side);
 const submit=async()=>{setError('');setBusy(true);try{
  if(!content.trim())throw new Error('所选范围没有可导出的内容');
  if(archive){if(project.creator.mode==='ip'&&!project.episodes.some(e=>e.type==='episode'))throw new Error('请先完成分集正文再收录');if(missing.length||unconfirmed.length)throw new Error('请先完成缺失集和终稿复核；当前内容仍可导出为草稿');setState(s=>archiveCreatorProject(s,project.id,{side,includeSections,stageDraft:shortIP}));setSuccess(shortIP?'已收录阶段版本，继续改稿不会改变此版本':'已收录完成版本，后续改稿会保留这一版本');}
  else{const name=`${project.name}-${staged?(contentScope==='story'?'故事稿':'集纲'):side==='input'?'原稿':'剧本'}${staged||unconfirmed.length||shortIP?'-草稿':''}`;const path=api.saveCreatorDocument?await api.saveCreatorDocument({name,content,format}):format==='txt'?await api.saveTxt({name,content}):null;if(!path&&format==='docx'&&!api.saveCreatorDocument)throw new Error('此浏览器预览环境不支持 Word 保存，请在桌面应用导出');if(path)setSuccess('文件已导出');}
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 return <CreatorDialog title={archive?'收录剧本库':single?'导出本集':'导出整部作品'} onClose={onClose} className="creator-export-dialog"><div className="creator-export-options">{framework&&!archive&&!single&&<label>导出范围<select aria-label="框架导出范围" value={contentScope} onChange={e=>{setContentScope(e.target.value);setSuccess('');}}><option value="script">分集剧本正文</option><option value="story">大事件与完整故事稿</option><option value="plan">当前集纲</option></select></label>}
  {((kind==='fruit'&&project.creator.mode!=='ip')||project.creator.mode==='free')&&<label>内容<select aria-label="导出内容" value={side} onChange={e=>{setSide(e.target.value);setSuccess('');}}><option value="output">{kind==='fruit'?'Skill 输出':project.creator.mode==='rewrite'?'我的新作':'转换稿（右侧）'}</option><option value="input">{kind==='fruit'?'原始稿':'原稿（左侧）'}</option></select></label>}
  {!single&&project.creator.mode==='rewrite'&&side==='output'&&<label className="creator-check"><input type="checkbox" checked={includeSections} onChange={e=>setIncludeSections(e.target.checked)}/>包含设定、主线、人物与细纲</label>}
  {!archive&&<label>文件格式<select value={format} onChange={e=>setFormat(e.target.value)}><option value="docx">Word（.docx）</option><option value="txt">TXT</option></select></label>}
 </div>{shortIP&&<p className="creator-warning">当前正文 {ipBodyCount(project).toLocaleString()} 字，尚未达到 {project.creator.ip.duration} 分钟版的篇幅目标。当前内容将标为阶段稿，字数不代表实际成片时长。</p>}{!staged&&missing.length>0&&<p className="creator-warning">以下节点在所选一侧为空：{missing.map(e=>e.title).join('、')}。导出不会用另一侧补位。</p>}{!staged&&unconfirmed.length>0&&<p className="creator-warning">{unconfirmed.map(e=>e.title).join('、')}尚待确认或复核，导出文件将标记为草稿。</p>}<p className="creator-muted">预览与文件内容一致。{archive?'收录后保存此时内容，继续修改不会改变这一版本。':project.creator.mode==='ip'?'包含设定、小传与当前分集正文。':project.creator.mode==='framework'?(staged?'当前阶段内容导出为草稿。':'仅包含分场剧本正文。'):''}</p><FormattedText className="creator-export-preview" text={content||'所选范围暂无内容'}/>{error&&<p role="alert" className="creator-error">{error}</p>}{success&&<p role="status">{success}</p>}<footer><button className="secondary" onClick={onClose}>关闭</button><button className="primary" disabled={busy||!!success} onClick={submit}>{archive?<Save size={16}/>:<Download size={16}/>} {busy?'处理中…':archive?'确认收录':'导出文件'}</button></footer></CreatorDialog>;
}
export function SourceDialog({state,onClose,onChoose,api,title='选择对标来源',onError}) {
 const [side,setSide]=useState('output'),[search,setSearch]=useState('');
 const upload=async()=>{try{const file=await api.importFullScript();if(file?.content?.trim())onChoose({name:file.fileName,content:file.content,filePath:file.filePath});else if(file)throw new Error('文档没有可读取的文本');}catch(e){onError(e.message);}};
 return <CreatorDialog title={title} onClose={onClose}><div className="creator-source-tools"><input placeholder="搜索果子项目" value={search} onChange={e=>setSearch(e.target.value)}/><select value={side} onChange={e=>setSide(e.target.value)}><option value="output">果子转换稿</option><option value="input">果子原始稿</option></select><button className="primary" onClick={upload}>上传 TXT / Word</button></div><div className="creator-source-list">{(state.fruitProjects||[]).filter(p=>p.creator?.mode!=='ip'&&p.name.includes(search)).map(p=>{const content=buildCreatorText(p,'fruit',side,{});return <button className="secondary" key={p.id} disabled={!content.trim()} onClick={()=>onChoose({name:p.name,content,sourceProjectId:p.id,sourceSide:side,sourceUpdatedAt:p.updatedAt})}><strong>{p.name}</strong><span>{p.episodes?.length||0}集 · {content.length}字{!content.trim()?' · 此侧暂无内容':''}</span></button>;})}{!state.fruitProjects?.length&&<p className="creator-muted">果子库暂无项目，可以直接上传剧本文档。</p>}</div></CreatorDialog>;
}

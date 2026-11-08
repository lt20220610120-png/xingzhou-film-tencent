import React,{useEffect,useRef} from 'react';
import {X,Download,Folder,Layers,Clapperboard,Image,AudioLines} from 'lucide-react';
import './art-export-dialogs.css';

function ExportDialog({title,label,onClose,children,wide=false}){
 const ref=useRef(null);
 useEffect(()=>{const node=ref.current;node.showModal();const cancel=e=>{e.preventDefault();onClose();};node.addEventListener('cancel',cancel);return()=>{node.removeEventListener('cancel',cancel);node.close();};},[]);
 return <dialog ref={ref} aria-label={label} className={`art-export-dialog${wide?' wide':''}`} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><header><div className="art-export-title"><Download size={18}/><h2>{title}</h2></div><button className="art-export-close" type="button" aria-label="关闭导出弹窗" onClick={onClose}><X size={17}/></button></header>{children}</dialog>;
}
export function ArtExportChoiceDialog({versions=[],version,onVersionChange,loading,error,exporting,onClose,onChoose}){
 return <ExportDialog wide title="导出项目素材" label="选择整部剧图片导出方式" onClose={onClose}>
  <div className="art-export-config"><label>版本<select aria-label="导出提示词版本" value={version||''} disabled={!versions.length||loading} onChange={e=>onVersionChange(e.target.value)}>{!versions.length&&<option value="">{loading?'读取中…':'暂无提示词'}</option>}{versions.map(row=><option key={row.id} value={row.id}>{row.label}{row.current?' · 最新':''}</option>)}</select></label><small>选择素材的文件夹组织方式</small></div>
  <div className="art-export-layouts">{[['flat','全部汇总',Folder],['episode','按集整理',Layers],['scene','按场景整理',Clapperboard],['prompt','按提示词',Image]].map(([id,text,Icon])=><button key={id} type="button" disabled={exporting||id==='prompt'&&(!versions.length||loading)} onClick={()=>onChoose(id)}><Icon size={16}/><span>{text}</span></button>)}</div>
  <p role="status" className="art-export-note">{loading?'正在读取最新关联，其他导出方式可直接使用。':'按提示词导出会将对应素材分别放入每条提示词的文件夹。'}</p>{error&&<p role="alert" className="art-export-error">{error}</p>}
 </ExportDialog>;
}
export function ArtExportAudioDialog({onClose,onChoose}){
 return <ExportDialog title="导出内容" label="选择是否导出对应音频" onClose={onClose}>
  <p className="art-export-description">是否包含已采用、并关联到当前范围的人物音色？</p>
  <div className="art-export-audio-options"><button type="button" onClick={()=>onChoose(false)}><Image size={16}/>仅图片</button><button type="button" className="primary" onClick={()=>onChoose(true)}><AudioLines size={16}/>图片与音频</button></div>
  <p className="art-export-note">素材按所选目录一起保存。</p>
 </ExportDialog>;
}

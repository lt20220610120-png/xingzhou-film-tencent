import React,{useRef,useState} from 'react';
import {normalizeCapabilities} from '../../core/modelCapabilities.js';
export function FnkoImageConfiguration({form,update}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const latest=useRef(form);latest.current=form;
 const rows=(form.modelCatalog||[]).filter(m=>(m.kind||m.type)==='image');
 const choose=id=>{const row=rows.find(m=>m.id===id);update('model',id);update('capabilities',normalizeCapabilities(row?.capabilities||{}));};
 const read=async()=>{
  const source=form;setBusy(true);setMessage('');
  try{
   const all=await window.xingzhou.discoverModels({endpoint:form.endpoint,apiKey:form.apiKey,purpose:'image'});
   if(['endpoint','apiKey'].some(key=>latest.current[key]!==source[key]))throw Error('接口已变化，请重新读取型号');
   const next=all.filter(m=>m.kind==='image'||m.id?.startsWith('ft-image-')).map(m=>({...m,kind:'image'}));
   update('modelCatalog',next);const selected=next.find(m=>m.id===form.model)||next[0];update('model',selected?.id||'');update('capabilities',normalizeCapabilities(selected?.capabilities||{}));
   setMessage(next.length?`已读取 ${next.length} 个当前账号可用的图片型号；旧目录已替换，历史作品保留。`:'当前账号无可用图片型号，旧目录已移除；请核对Key和模型权限。');
  }catch(error){setMessage(error.message||'目录读取失败，未删除旧配置');}finally{setBusy(false);}
 };
 return <section className="video-provider-config"><button type="button" disabled={busy||!form.apiKey?.trim()} onClick={read}>{busy?'正在读取…':'拉取／刷新图片型号与参数'}</button>
  {!!rows.length&&<label>图片型号<select aria-label="图片型号目录" value={form.model} onChange={event=>choose(event.target.value)}>{rows.map(row=><option key={row.id} value={row.id}>{row.name||row.id}</option>)}</select></label>}
  {message&&<p role="status" className="generation-limits">{message}</p>}
 </section>;
}

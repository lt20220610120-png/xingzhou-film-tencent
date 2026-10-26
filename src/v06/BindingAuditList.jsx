import React from 'react';
import {bindingImages} from '../../core/promptArtBinding.js';

export const bindingCategoryLabels={character:'人物',scene:'场景',prop:'道具'};
const usages={visible:'画面使用',voice:'仅声音',mentioned:'仅提及'};
// The default view is a compact audit list; technical controls stay in details.
export default function BindingAuditList({cards,needs,category='all',renderImage,renderControls}){
 const groups=Object.entries(bindingCategoryLabels).filter(([key])=>category==='all'||category===key);
 return <div className="binding-audit-list" role="region" aria-label="本条已关联资产" tabIndex={0}>{groups.map(([key,label])=>{
  const rows=cards.filter(card=>card.category===key).flatMap(card=>{const need=needs.find(need=>need.cardUid===card.uid&&need.visibility!=='excluded');return need?[{card,need}]:[];});
  return <section className="binding-audit-group" key={key} aria-label={`已关联${label}`}><h3>{label}<span>{rows.length}</span></h3><div className="binding-audit-rows">{rows.map(({card,need})=>{
   const image=bindingImages(card).find(image=>image.id===need.imageId);
   return <details key={card.uid} className="binding-audit-row"><summary><b>{card.name.replace(/[【】]/g,'')}</b><span className="binding-audit-usage">{usages[need.visibility]}</span><span className="binding-audit-check">已关联</span></summary><div className="binding-audit-detail"><p>{need.reason||'已从本场景清单关联'}</p>{need.visibility==='visible'&&<small>{image?'图片已选定':'待出图 / 选图'}</small>}{renderImage?.(card,need,image)}{renderControls?.(card,need)}</div></details>;
  })}{!rows.length&&<p className="binding-audit-empty">本条未关联{label}</p>}</div></section>;
 })}</div>;
}

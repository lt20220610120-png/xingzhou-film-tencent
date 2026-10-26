import React from 'react';
import {bindingCategoryLabels} from './BindingAuditList.jsx';

export default function SceneInventoryDisclosure({cards,needs,entryLabel,disabled,onToggle,children}){
 return <details className="scene-inventory-disclosure"><summary><b>本场景资产清单</b><span>{Object.entries(bindingCategoryLabels).map(([key,label])=>`${label} ${cards.filter(card=>card.category===key).length}`).join(' · ')}</span><span className="scene-inventory-target">关联到 {entryLabel}</span></summary><div className="scene-inventory-disclosure-body">{Object.entries(bindingCategoryLabels).map(([key,label])=><section key={key}><h3>{label} <small>{cards.filter(card=>card.category===key).length}</small></h3><div>{cards.filter(card=>card.category===key).map(card=>{
  const selected=needs.some(need=>need.cardUid===card.uid&&need.visibility!=='excluded');
  return <article className={selected?'assigned':''} key={card.uid}><b>{card.name.replace(/[【】]/g,'')}</b><button type="button" aria-label={`${selected?'取消关联':'关联本条'} ${card.name}`} aria-pressed={selected} disabled={disabled} onClick={()=>onToggle(card,!selected)}>{selected?'已关联 · 取消':'关联本条'}</button></article>;
 })}</div></section>)}{children}</div></details>;
}

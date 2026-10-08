import {identityTaskInput,changeRewriteIdentity} from './rewriteIdentity.js';
import {conversionTaskInput,applyIdentityConversion} from './rewriteConversion.js';
export const isRewriteIdentityTask=t=>['rewriteIdentity','rewriteConvert'].includes(t?.task);
export const rewriteIdentityTaskInput=(p,t)=>t.task==='rewriteConvert'?conversionTaskInput(p,t):identityTaskInput(p,t);
export function applyRewriteIdentityRecord(p,record){
 if(!['pending','candidate','completed','success'].includes(record.status)||!record.output?.trim())throw new Error('人物候选尚未完整完成，不能采用。');
 const next=record.target.task==='rewriteConvert'?applyIdentityConversion(p,record.target,record.output):changeRewriteIdentity(p,{type:'candidate',value:record.output});
 return {...next,creator:{...next.creator,records:next.creator.records.map(r=>r.id===record.id?{...r,status:'adopted',adoptedAt:new Date().toISOString()}:r)}};
}

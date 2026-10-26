import assert from 'node:assert/strict';
import {bindingSnapshot} from './promptArtBinding.js';
import {selectBindingVersion} from './promptBindingVersions.js';
import {newArtReview,applyArtReviewCandidate} from './artReview.js';
export function fixture(){
 const project={id:crypto.randomUUID(),episodes:[{id:'ep',episodeNumber:1,content:'1-1 客厅 日 内\n张三喝水。',prompts:[1,2,3].map(n=>({id:'p'+n,label:'1-1-'+n,content:'【基础设定】\n人物：张三（参考@），肤色偏深、短黑发。\n场景：客厅\n道具：水杯'}))}]};
 let record=newArtReview(project.episodes[0]);record=applyArtReviewCandidate(record,project.episodes[0],{items:[{id:'a',category:'character',name:'【张三】',description:'成年男性，短发，灰色短袖。',ready:true}],mapping:[{sceneId:'1-1',assets:[{category:'character',name:'【张三】'}]}],inventory:'清单',complete:true,warnings:[]});
 const ledger={episodes:{1:record}},assets=[];let saved=null,calls=0;
 const output=messages=>{const data=JSON.parse(messages[1].content);return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:'张三',reason:'基础设定明确出现张三'})),missing:[]})};
 const api={promptArtLoad:async()=>structuredClone(saved),promptArtSave:async p=>{assert.equal(p.baseRevision,saved?.revision||0);saved={...structuredClone(p.data),revision:(saved?.revision||0)+1};return structuredClone(saved)},aiChat:async p=>{calls++;return output(p.messages)}};
 const getContext=()=>({project,ledger,assets});
 return {project,ledger,assets,api,getContext,output,get calls(){return calls},get saved(){return saved},set saved(value){saved=value},snapshot:()=>selectBindingVersion(bindingSnapshot(project,ledger,assets,saved?.snapshot),saved)};
}

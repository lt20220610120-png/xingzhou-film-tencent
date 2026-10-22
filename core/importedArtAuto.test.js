import test from 'node:test';
import assert from 'node:assert/strict';
import * as auto from './importedArtAuto.js';
import {parsePromptBook,entryValue} from './promptBook.js';
import {beginImportedBinding,importedEntryValue} from './importedArtBinding.js';
function fixture(){
 const book=beginImportedBinding(parsePromptBook('【1-1-1】【基础信息】\n人物：刘娜\n场景：客厅\n道具：无\n【1-1-2】【基础信息】\n人物：刘娜\n场景：客厅\n道具：刘娜的杯子\n【2-1-1】【基础信息】\n人物：陌生人\n场景：街道\n道具：无','测试','book'),'a');
 book.sceneMedia={'1-1':[{id:'person',name:'刘娜.png',kind:'image',url:'a'},{id:'room',name:'客厅.png',kind:'image',url:'b'},{id:'cup',name:'刘娜的杯子.png',kind:'image',url:'c'}]};
 return book;
}
const call=async messages=>{
 const data=JSON.parse(messages[1].content);
 if(!data.entry)return JSON.stringify({cards:data.cards.map(card=>({...card,category:{person:'character',room:'scene',cup:'prop'}[card.uid],description:'文件名与提示词一致',certainty:'clear',sourceName:card.name}))});
 return JSON.stringify({certainty:'clear',needs:data.previousNeeds.map(need=>({...need,reason:'本条明确入镜'}))});
};
test('退出直接恢复原编辑，保留原稿、素材、旧编辑和AI进度',()=>{
 const book=fixture();book.drafts[book.entries[0].id]={prompt:'原来的手改词',excludedIds:['cup'],duration:8};
 book.importedBinding.decisions.keep={confirmed:false};
 const manual=auto.returnToManual(book);
 assert.equal(manual.importedBinding.stage,'manual');assert.equal(entryValue(manual,manual.entries[0]).prompt,'原来的手改词');
 assert.equal(manual.sceneMedia,book.sceneMedia);assert.equal(manual.importedBinding.decisions,book.importedBinding.decisions);
});
test('一键贯通身份与逐条关联，明确条目自动就绪，缺素材只保留疑问，不提交视频',async()=>{
 let book=fixture(),calls=0,saves=0;
 const result=await auto.runImportedAuto({book,call:async messages=>{calls++;return call(messages);},save:async next=>{book=next;saves++;}});
 assert.equal(result.ready,2);assert.equal(result.pending,1);assert.equal(calls,3);assert(saves>=3);
 assert.deepEqual(importedEntryValue(book,book.entries[0]).references.map(ref=>ref.id),['person','room']);
 assert.deepEqual(importedEntryValue(book,book.entries[1]).references.map(ref=>ref.id),['person','room','cup']);
 assert.equal(book.importedBinding.decisions[book.entries[0].id].confirmedBy,'ai');
 const again=await auto.runImportedAuto({book,call:async()=>assert.fail('恢复不应重复已完成付费请求'),save:async()=>{}});
 assert.equal(again.ready,2);
});
test('未知身份不自动确认，AI自称不确定的条目不放行',async()=>{
 let book=fixture();
 await auto.runImportedAuto({book,call:async messages=>{
  const answer=JSON.parse(await call(messages));
  if(answer.cards)answer.cards.find(card=>card.uid==='cup').certainty='uncertain';
  else answer.certainty='uncertain';
  return JSON.stringify(answer);
 },save:async next=>{book=next;}});
 assert.equal(book.importedBinding.metadata.cup.confirmed,false);
 assert.equal(auto.importedAutoSummary(book).ready,0);
 assert.equal(auto.importedAutoSummary(book).pending,3);
});
test('停止不应用晚回包，已经完成的身份保存；人工身份不被AI覆盖',async()=>{
 let book=fixture(),stopped=false,count=0;
 await assert.rejects(auto.runImportedAuto({book,call:async messages=>{const result=await call(messages);if(++count===2)stopped=true;return result;},isStopped:()=>stopped,save:async next=>{book=next;}}),/停止/);
 assert.equal(book.importedBinding.metadata.person.confirmed,true);assert.equal(Object.keys(book.importedBinding.decisions).length,0);
});

test('只关联当前第二条：不从第一条跑、不请求其他场景，保留其他决定',async()=>{
 let book=fixture(),calls=[];
 const target=book.entries[1].id,first=book.entries[0].id;
 book.importedBinding.decisions[first]={confirmed:false,autoIssue:'既有待处理结果'};
 const old=structuredClone(book.importedBinding.decisions[first]);
 const result=await auto.runImportedAuto({book,targetEntryId:target,call:async messages=>{const data=JSON.parse(messages[1].content);calls.push(data);return call(messages);},save:async next=>{book=next;}});
 assert.equal(calls.length,2);assert.equal(calls[1].entry.id,target);
 assert(calls[0].prompts.length===1&&calls[0].prompts[0].label===book.entries[1].label);
 assert.deepEqual(book.importedBinding.decisions[first],old);
 assert.deepEqual(Object.keys(book.importedBinding.decisions).sort(),[first,target].sort());
 assert.equal(result.ready,1);assert.equal(importedEntryValue(book,book.entries[1]).referenceBindingMode,'confirmed');
});

test('无效单条目标立即拒绝，不能回退成整本运行',async()=>{
 await assert.rejects(auto.runImportedAuto({book:fixture(),targetEntryId:'missing',call:async()=>assert.fail('不能请求AI'),save:async()=>assert.fail('不能改数据')}),/当前提示词不存在/);
});

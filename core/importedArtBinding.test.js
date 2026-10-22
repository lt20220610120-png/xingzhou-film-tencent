import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePromptBook,mergeEpisodeMedia} from './promptBook.js';
import {beginImportedBinding,importedSnapshot,importedDecision,importedEntryValue,validateImportedSubmission,applyInventoryAi,runBindingRepair,runImportedEntry} from './importedArtBinding.js';
import {compileEntryBinding,entryBindingSignature,applyBindingAi} from './promptArtBinding.js';
const prompt=(people,props)=>`【基础信息】\n人物：${people}\n场景：客厅\n道具：${props}\n【镜头】\n人物在客厅活动。`;
function fixture(){
 let book=mergeEpisodeMedia(parsePromptBook(`【1-1-1】${prompt('张三','无')}\n【1-1-2】${prompt('张三、李四','杯子')}\n【2-1-1】${prompt('王五','无')}`,'旧素材剧','book'),{},{
  '1-1':[['a','张三','character'],['b','李四','character'],['room','客厅','scene'],['cup','杯子','prop'],['phone','手机','prop']].map(([id,name,category])=>({id,name,category,kind:'image',filePath:`C:/media/${id}.png`})),
  '2-1':[{id:'w',name:'王五',category:'character',kind:'image',filePath:'C:/media/w.png'}]
 });
 book=beginImportedBinding(book,'account');
 for(const ref of Object.values(book.sceneMedia).flat())book.importedBinding.metadata[ref.id]={name:ref.name,category:ref.category,confirmed:true};
 return book;
}
function confirmed(book){
 const snapshot=importedSnapshot(book);
 for(const entry of snapshot.entries)book.importedBinding.decisions[entry.id]={...importedDecision(snapshot,entry),confirmed:true};
 return book;
}
test('已有图片独立关联只提交本条子集，原文件、其他条素材和集场身份保持',()=>{
 const book=confirmed(fixture()),value=importedEntryValue(book,book.entries[0]);
 assert.deepEqual(value.references.map(ref=>ref.id),['a','room']);
 assert.match(value.prompt,/@image1/);assert.match(value.prompt,/@image2/);
 assert.equal(value.references[0].filePath,'C:/media/a.png');assert.equal(value.references[0].assetId,undefined);
 assert.deepEqual(importedEntryValue(book,book.entries[1]).references.map(ref=>ref.id),['a','b','room','cup']);
 assert.equal(book.sceneMedia['1-1'].length,5);
 assert.equal(importedEntryValue(book,book.entries[2]).referenceBindingMode,'pending');
 assert.deepEqual(JSON.parse(JSON.stringify(book)),book);
});
test('提交以独立确认记录为准，错账号、换图片、顺序改变、改词均阻断',()=>{
 const book=confirmed(fixture()),snapshot=importedSnapshot(book),saved={enabled:true,accountId:'account',snapshot,decisions:book.importedBinding.decisions},value=importedEntryValue(book,book.entries[0]);
 assert.deepEqual(validateImportedSubmission(saved,value,'account').references,value.references);
 assert.throws(()=>validateImportedSubmission(saved,value,'other'),/账号/);
 assert.throws(()=>validateImportedSubmission(saved,{...value,prompt:value.prompt+'x'},'account'),/修改/);
 assert.throws(()=>validateImportedSubmission(saved,{...value,references:[...value.references].reverse()},'account'),/修改/);
 assert.throws(()=>validateImportedSubmission(saved,{...value,references:value.references.map(ref=>({...ref,filePath:'C:/wrong.png'}))},'account'),/修改/);
});
test('新图片、分类或原词变更须重新确认，多套同名图片不擅自选',()=>{
 const book=confirmed(fixture()),entry=book.entries[0];
 book.importedBinding.metadata.a.category='prop';
 assert.equal(importedEntryValue(book,entry).referenceBindingMode,'pending');
 const book2=confirmed(fixture());book2.sceneMedia['1-1'].push({...book2.sceneMedia['1-1'][0],id:'a2',filePath:'C:/media/a2.png'});
 book2.importedBinding.metadata.a2={name:'张三',category:'character',confirmed:true};
 const snapshot=importedSnapshot(book2),decision=importedDecision(snapshot,snapshot.entries[0],book2.importedBinding.decisions);
 assert.equal(decision.confirmed,false);assert.equal(decision.needs[0].cardUid,null);
 book2.importedBinding.prompts[entry.id]+='新镜头';
 assert.equal(importedEntryValue(book2,entry).referenceBindingMode,'pending');
});
test('人物所有者不决定杯子类别；未确认的身份不能编译生成',()=>{
 const book=fixture();book.importedBinding.metadata.cup={name:'张三-杯子',category:'prop',confirmed:false};
 book.importedBinding.prompts[book.entries[1].id]=prompt('张三','张三-杯子');
 const snapshot=importedSnapshot(book),entry=snapshot.entries[1],decision=importedDecision(snapshot,entry);
 assert.equal(decision.needs[0].cardUid,'a');assert.equal(decision.needs.at(-1).cardUid,'cup');
 assert.throws(()=>compileEntryBinding(snapshot,entry,{...decision,confirmed:true}),/未核实/);
});
test('重复编号和既有手工引用不能直接放行；无基础信息可由AI补齐并待确认',()=>{
 let book=fixture();book.entries.push({...book.entries[0],id:'duplicate'});
 let snapshot=importedSnapshot(book);assert(snapshot.entries[0].duplicateLabel);
 assert.throws(()=>compileEntryBinding(snapshot,snapshot.entries[0],{...importedDecision(snapshot,snapshot.entries[0]),confirmed:true}),/重复编号/);
 book=fixture();book.importedBinding.prompts[book.entries[0].id]+='@image1';snapshot=importedSnapshot(book);
 assert.throws(()=>compileEntryBinding(snapshot,snapshot.entries[0],{...importedDecision(snapshot,snapshot.entries[0]),confirmed:true}),/已有手动引用/);
 book=fixture();book.importedBinding.prompts[book.entries[0].id]='张三在客厅说话';snapshot=importedSnapshot(book);
 const entry=snapshot.entries[0],decision=importedDecision(snapshot,entry);
 assert(decision.issue);
 const next=applyBindingAi(snapshot,entry,decision,{needs:[{text:'张三',start:0,end:2,category:'character',cardUid:'a',visibility:'visible',reason:'原文出现'},{text:'客厅',start:3,end:5,category:'scene',cardUid:'room',visibility:'visible',reason:'原文出现'}]});
 assert.equal(next.issue,'');assert.equal(next.confirmed,false);
});
test('AI身份建议必须一图一身份并保留人工锁定，不覆盖图片本身',()=>{
 const book=fixture();book.importedBinding.metadata.cup.confirmed=false;
 const snapshot=importedSnapshot(book),rows=snapshot.cards.filter(card=>card.sceneIds.includes('1-1')).map(card=>({uid:card.uid,name:card.name,category:card.category,description:'依据'}));
 rows[0].name='不能覆盖';rows.find(row=>row.uid==='cup').name='杯子（张三所有）';
 const next=applyInventoryAi(snapshot,'1-1',book.importedBinding.metadata,{cards:rows});
 assert.equal(next.a.name,'张三');assert.equal(next.cup.name,'杯子（张三所有）');assert.equal(next.cup.confirmed,false);
 assert.throws(()=>applyInventoryAi(snapshot,'1-1',{}, {cards:rows.slice(1)}),/完整/);
 assert.throws(()=>applyInventoryAi(snapshot,'1-1',{}, {cards:rows.map(()=>rows[0])}),/无效/);
});
test('Agent仅修正已收到的错误答案最多两次，网络失败不重发，停止不应用结果',async()=>{
 let count=0;
 const options={messages:[],call:async()=>String(++count),validate:raw=>{if(raw!=='3')throw Error('格式错');return raw;}};
 assert.equal(await runBindingRepair(options),'3');assert.equal(count,3);
 count=0;await assert.rejects(runBindingRepair({...options,validate:()=>{throw Error('仍不确定');}}),/三次/);assert.equal(count,3);
 count=0;await assert.rejects(runBindingRepair({...options,call:async()=>{count++;throw Error('网络断开');}}),/网络/);assert.equal(count,1);
 let stopped=false;await assert.rejects(runBindingRepair({...options,call:async()=>{stopped=true;return '3';},isStopped:()=>stopped}),/停止/);
});
test('AI逐条关联不发送本机路径，人工锁定不允许被更大的范围吞掉',async()=>{
 const book=fixture(),snapshot=importedSnapshot(book),entry=snapshot.entries[0],decision=importedDecision(snapshot,entry);
 decision.needs[0].locked=true;
 await runImportedEntry({snapshot,entry,decision,call:async messages=>{
  assert(!JSON.stringify(messages).includes('C:/media'));assert(!JSON.stringify(messages).includes('xzmedia:'));
  return JSON.stringify({needs:decision.needs});
 }});
 const changed=decision.needs.map((need,index)=>index?need:{...need,text:entry.prompt.slice(need.start,need.end+1),end:need.end+1});
 assert.throws(()=>applyBindingAi(snapshot,entry,decision,{needs:changed}),/锁定/);
 assert.equal(entryBindingSignature(snapshot,entry),decision.signature);
});

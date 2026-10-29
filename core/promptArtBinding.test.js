import test from 'node:test';
import assert from 'node:assert/strict';
import {newArtReview,editArtReview,reviewSceneSignature} from './artReview.js';
import {bindingSnapshot,currentEntryBinding,saveDistribution,entryBindingSignature,proposeEntryBinding,bindingProblems,compileEntryBinding,applyBindingAi,linkedPromptBook,validateCompiledBinding,validateLinkedSubmission} from './promptArtBinding.js';
import {entryValue} from './promptBook.js';
import {matchBasicReferences} from './automaticReferences.js';

function fixture(){
 const episode={id:'episode',episodeNumber:1,title:'第1集',content:'1-1 客厅 日 内\n张三拿起杯子。',prompts:[
  {id:'p1',label:'1-1-1',content:'【基础信息】\n人物：张三\n场景：客厅\n道具：无\n【镜头】\n张三说话。'},
  {id:'p2',label:'1-1-2',content:'【基础设定】\n人物：张三、李四\n场景：客厅\n道具：张三-杯子\n【镜头】\n张三把杯子递给李四。'}]};
 const project={id:'project',name:'虚构测试剧',director_project_id:'director',episodes:[episode]};
 const assets=[['a','character','【张三-白衣】'],['b','character','【李四-常服】'],['room','scene','【客厅】'],['cup','prop','【张三-杯子】'],['phone','prop','【手机】']].map(([id,category,name])=>({id,category,name,images:[{id:id+'-img',url:'https://example.com/'+id+'.png'}]}));
 let record=newArtReview(episode);record.scenes[0].items=assets.map(asset=>({id:'review-'+asset.id,category:asset.category,name:asset.name,description:'已核实外观',ready:true}));record.scenes[0].mappingReady=true;
 record=editArtReview(record,{type:'approve',sceneId:'1-1'},'u');record.published={'1-1':{...structuredClone(record.scenes[0]),signature:reviewSceneSignature(record.scenes[0])}};
 const ledger={episodes:{1:record}},snapshot=bindingSnapshot(project,ledger,assets),decisions=Object.fromEntries(snapshot.entries.map(entry=>[entry.id,{...proposeEntryBinding(snapshot,entry),confirmed:true}]));
 return {project,ledger,assets,snapshot,decisions};
}
test('compiled references replace empty director placeholders after anchoring without modifying source',()=>{const f=fixture();f.project.episodes[0].prompts[0].content=f.project.episodes[0].prompts[0].content.replace('张三','张三（参考@）');const snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot),entry=snapshot.entries[0],decision={...proposeEntryBinding(snapshot,entry),confirmed:true};const result=compileEntryBinding(snapshot,entry,decision);assert.match(result.prompt,/张三（参考@image1）/);assert(!result.prompt.includes('（参考@）'));assert(entry.prompt.includes('（参考@）'));});
test('提前关联保留类别、每条只选必要子集，杯子不混入人物引用',()=>{
 const {snapshot,decisions}=fixture();
 const first=compileEntryBinding(snapshot,snapshot.entries[0],decisions.p1),second=compileEntryBinding(snapshot,snapshot.entries[1],decisions.p2);
 assert.deepEqual(first.references.map(row=>row.assetId),['a','room']);
 assert.deepEqual(second.references.map(row=>row.assetId),['a','b','room','cup']);
 assert.match(second.prompt,/张三（参考@image1）/);assert.match(second.prompt,/张三-杯子（参考@image4）/);
 assert.ok(second.references.every(row=>row.assetId!=='phone'));
});
test('同场多条复用同一人物图片，不复制生成资产',()=>{
 const {snapshot,decisions}=fixture(),book=linkedPromptBook(snapshot,decisions,'u');
 const values=book.entries.map(entry=>entryValue(book,entry));
 assert.equal(values[0].references[0].imageId,values[1].references[0].imageId);
 assert.equal(book.entries[0].sourcePromptId,'p1');assert.equal(book.accountId,'u');
 assert.equal(matchBasicReferences(values[0],values[1].references),values[0]);
});
test('逗号多人列表按已知人物卡片补全，描述与所有者道具不混入人物',()=>{
 const f=fixture();f.project.episodes[0].prompts[0].content='【基础信息】\n人物：张三，李四\n场景：客厅\n道具：张三-杯子\n【镜头】\n两人递杯子。';
 const snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot),decision=proposeEntryBinding(snapshot,snapshot.entries[0]);
 assert.deepEqual(decision.needs.filter(row=>row.category==='character').map(row=>row.text),['张三','李四']);
 assert.equal(decision.needs.filter(row=>row.category==='prop').length,1);
});
test('人物属性和服装描述不会被拆成独立人物卡片',()=>{
 const f=fixture();f.project.episodes[0].prompts[0].content='【基础信息】\n人物：张三（参考@image1），肤色偏深、短黑发略显凌乱，穿牛仔裤和旧胶鞋\n场景：客厅\n道具：张三-杯子\n【镜头】\n张三进入画面。';
 const snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot),decision=proposeEntryBinding(snapshot,snapshot.entries[0]);
 assert.deepEqual(decision.needs.filter(row=>row.category==='character').map(row=>row.text),['张三']);
});
test('无图片时仍可确认卡片用途，视频须等选图且发布就绪',()=>{
 const f=fixture();f.assets[0].images=[];const snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot),entry=snapshot.entries[0],decision={...proposeEntryBinding(snapshot,entry),confirmed:true};
 assert.deepEqual(bindingProblems(snapshot,entry,decision),[]);
 assert.throws(()=>compileEntryBinding(snapshot,entry,decision),/选定有效图片/);
 const book=linkedPromptBook(snapshot,{p1:decision},'u');assert.equal(book.drafts[book.entries[0].id].referenceBindingMode,'pending');
});
test('多妆造和多图保留歧义，不全部自动挂载',()=>{
 const f=fixture();f.ledger.episodes[1].scenes[0].items.push({id:'black',category:'character',name:'【张三-黑衣】',description:'黑衣',ready:true});
 const snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot),entry=snapshot.entries[0],decision=proposeEntryBinding(snapshot,entry);
 assert.equal(decision.needs[0].cardUid,null);
 assert.match(bindingProblems(snapshot,entry,decision,{requireConfirmed:false}).join(' '),/正确类别/);
});
test('缺基础信息与同编号多批次不能被误认为已关联完成',()=>{
 const f=fixture();f.project.episodes[0].prompts[0].content='没有结构的提示词';f.project.episodes[0].prompts.push({...f.project.episodes[0].prompts[0],id:'another'});
 const snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot),entry=snapshot.entries[0],decision={...proposeEntryBinding(snapshot,entry),confirmed:true};
 assert.equal(entry.duplicateLabel,true);assert.match(bindingProblems(snapshot,entry,decision).join(' '),/基础|批次/);
});
test('原文、卡片、发布状态和图片变化使对应关联失效，签名URL刷新不失效',()=>{
 const f=fixture(),entry=f.snapshot.entries[0],before=entryBindingSignature(f.snapshot,entry);
 f.assets[0].images[0].url+='?signature=new';
 let snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot);assert.equal(entryBindingSignature(snapshot,snapshot.entries[0]),before);
 f.assets[0].images.push({id:'new-image',url:'https://example.com/new.png'});
 snapshot=bindingSnapshot(f.project,f.ledger,f.assets,f.snapshot);assert.notEqual(entryBindingSignature(snapshot,snapshot.entries[0]),before);
 assert.throws(()=>compileEntryBinding(snapshot,snapshot.entries[0],f.decisions.p1),/已更新/);
});
test('AI 原文位置、分类和候选身份都必须有效，漏项不应用',()=>{
 const {snapshot,decisions}=fixture(),entry=snapshot.entries[0],decision=decisions.p1;
 assert.throws(()=>applyBindingAi(snapshot,entry,decision,{needs:[]}),/完整/);
 const needs=decision.needs.map(row=>({...row,reason:'来自基础信息'}));
 assert.equal(applyBindingAi(snapshot,entry,decision,{needs}).origin,'ai');
 assert.throws(()=>applyBindingAi(snapshot,entry,decision,{needs:[{...needs[0],start:999},...needs.slice(1)]}),/依据/);
 assert.throws(()=>applyBindingAi(snapshot,entry,decision,{needs:[needs[0]]}),/漏掉/);
 assert.throws(()=>applyBindingAi(snapshot,entry,decision,{needs:[{...needs[0],cardUid:snapshot.cards.find(card=>card.category==='prop').uid},needs[1]]}),/类别/);
});
test('AI 保留人工锁定选择，无法确定的 null 卡片保留待核对',()=>{
 const {snapshot,decisions}=fixture(),entry=snapshot.entries[0],decision=structuredClone(decisions.p1);decision.needs[0].locked=true;
 const needs=decision.needs.map(row=>({...row,visibility:'excluded',reason:'仅提及',cardUid:null}));
 const result=applyBindingAi(snapshot,entry,decision,{needs});assert.deepEqual(result.needs[0],decision.needs[0]);
 const uncertain=applyBindingAi(snapshot,entry,decisions.p1,{needs:decisions.p1.needs.map(row=>({...row,reason:'不确定',cardUid:null}))});
 assert.match(bindingProblems(snapshot,entry,uncertain,{requireConfirmed:false}).join(' '),/未关联/);
});
test('生成前禁止删图、改词、悬空引用或模型丢弃必需图',()=>{
 const {snapshot,decisions}=fixture(),book=linkedPromptBook(snapshot,decisions,'u'),value=entryValue(book,book.entries[0]);
 assert.doesNotThrow(()=>validateCompiledBinding(value,['image']));
 assert.throws(()=>validateCompiledBinding({...value,references:value.references.slice(1)},['image']),/素材已修改/);
 assert.throws(()=>validateCompiledBinding({...value,prompt:value.prompt+'修改'},['image']),/提示词已修改/);
 assert.throws(()=>validateCompiledBinding(value,[]),/不支持/);
});
test('提交重新读取云源与本机确认，已更新或账号切换时阻断',async()=>{
 const f=fixture(),book=linkedPromptBook(f.snapshot,f.decisions,'u'),entry=book.entries[0],value=entryValue(book,entry);
 const api={promptArtLoad:async()=>({enabled:true,snapshot:f.snapshot,decisions:f.decisions}),collabGetProject:async()=>f.project,collabListAssets:async()=>f.assets,artReviewLoadLocal:async()=>f.ledger};
 await validateLinkedSubmission({api,book,entry,value,accountId:'u'});
 await assert.rejects(validateLinkedSubmission({api,book,entry,value,accountId:'other'}),/账号/);
 f.project.episodes[0].prompts[0].content+='后续修改';
 await assert.rejects(validateLinkedSubmission({api,book,entry,value,accountId:'u'}),/已更新/);
});

test('旧解析的属性伪卡片被重建，合法人工选择保留',()=>{
 const {snapshot,decisions}=fixture(),entry=snapshot.entries[0],old=structuredClone(decisions.p1);
 old.signature='legacy';old.needs[0].locked=true;
 old.needs.push({...old.needs[0],id:'junk',text:'肤色偏深',start:200,end:204});
 const next=currentEntryBinding(snapshot,entry,old);
 assert.deepEqual(next.needs.map(n=>n.text),['张三','客厅']);
 assert.equal(next.needs[0].locked,true);assert.equal(next.confirmed,false);
});
test('AI不能把外貌、否定句和时间作为资产，即使原文位置正确',()=>{
 const {snapshot}=fixture();
 for(const [category,text] of [['character','肤色偏深'],['character','短黑发略显凌乱'],['character','牛仔裤和旧胶鞋'],['character','同一时段无其他具名人物入镜'],['scene','日间']]){
  const entry={...snapshot.entries[0],prompt:text};
  assert.throws(()=>applyBindingAi(snapshot,entry,{needs:[]},{needs:[{category,text,start:0,end:text.length,visibility:'visible',reason:'测试',cardUid:null}]}),/误识别/);
 }
});
test('分发保存不要求逐条确认，但整场发布和有效图片仍是生成前提',()=>{
 const {snapshot,decisions}=fixture(),entry=snapshot.entries[0];
 const ready=saveDistribution(snapshot,entry,{...decisions.p1,confirmed:false});
 assert.equal(ready.confirmed,true);assert.doesNotThrow(()=>compileEntryBinding(snapshot,entry,ready));
 const unresolved=saveDistribution(snapshot,entry,{...ready,needs:ready.needs.map(n=>({...n,cardUid:null}))});
 assert.equal(unresolved.confirmed,false);
 snapshot.cards[0].publishedSceneIds=[];
 const unpublished=saveDistribution(snapshot,entry,{...ready,signature:entryBindingSignature(snapshot,entry)});
 assert.throws(()=>compileEntryBinding(snapshot,entry,unpublished),/尚未核实发布/);
});

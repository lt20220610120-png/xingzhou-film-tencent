import test from 'node:test';
import assert from 'node:assert/strict';
import {applySceneDistribution,sceneDistributionMessages,assignSceneCard,resolveSceneMissing,sceneDistributionStamp,shouldDistributeSceneEntry} from './scenePromptDistribution.js';
import {currentEntryBinding,saveDistribution,compileEntryBinding,entryBindingSignature} from './promptArtBinding.js';

function fixture(){
 const entry={id:'p',sceneId:'1-1',label:'1-1-1',sceneReady:true,prompt:'【基础设定】\n人物：李大川，肤色偏深，短黑发凌乱，牛仔裤和旧胶鞋\n场景：夜，外景为积水道路，内景为破旧面包车驾驶室\n道具：手机\n【镜头】\n他接起电话。'};
 const cards=[['person','character','【李大川-日常服】'],['room','scene','【积水道路上的面包车-夜-内/外】'],['phone','prop','【李大川手机】'],['cup','prop','【杯子】']].map(([uid,category,name])=>({uid,category,name,description:'',sceneIds:['1-1'],publishedSceneIds:['1-1'],assetId:uid,images:[{id:uid+'-img',url:'https://example.com/'+uid}]}));
 const snapshot={projectId:'project',cards,entries:[entry]};
 const raw={assignments:cards.map(c=>({cardUid:c.uid,visibility:c.uid==='cup'?'excluded':'visible',evidence:({person:'李大川',room:'破旧面包车驾驶室',phone:'手机',cup:''})[c.uid],reason:c.uid==='cup'?'本条未使用杯子':'提示词中明确使用'})),missing:[]};
 return {entry,snapshot,raw,decision:currentEntryBinding(snapshot,entry)};
}
test('场景别名以已有关联卡身份分发，肤色与衣着不生成卡片',()=>{
 const f=fixture(),d=applySceneDistribution(f.snapshot,f.entry,f.decision,f.raw);
 assert.equal(d.needs.filter(n=>n.category==='character').length,1);
 assert.equal(d.needs.find(n=>n.category==='scene').cardUid,'room');
 assert.deepEqual(compileEntryBinding(f.snapshot,f.entry,saveDistribution(f.snapshot,f.entry,d)).references.map(r=>r.assetId),['person','room','phone']);
 const input=JSON.parse(sceneDistributionMessages(f.snapshot,f.entry,f.decision)[1].content);
 assert.equal('prompt' in input,false);assert.equal(input.cards.length,4);assert.equal(JSON.stringify(input).includes('整体视听'),false);assert.equal(JSON.stringify(input).includes('画面内容'),false);
 assert.deepEqual(input.foundation.character[0].names,['李大川']);
 assert.match(sceneDistributionMessages(f.snapshot,f.entry,f.decision)[0].content,/内置分发 Skill/);
});
test('分发只接受基础设定证据，省略的卡片安全标记为未使用',()=>{
 const f=fixture(),raw={assignments:[{cardUid:'person',visibility:'visible',evidence:'李大川',reason:'基础设定人物'}],missing:[]};
 const d=applySceneDistribution(f.snapshot,f.entry,f.decision,raw);
 assert.equal(d.needs.find(n=>n.cardUid==='person').visibility,'visible');
 assert.equal(d.needs.filter(n=>n.visibility==='excluded').length,3);
 assert.throws(()=>applySceneDistribution(f.snapshot,f.entry,f.decision,{assignments:[{cardUid:'person',visibility:'visible',evidence:'他接起电话',reason:'画面人物'}],missing:[]}),/基础设定范围/);
});
test('完整逐卡判断拒绝遗漏、重复、跨场卡片和无原文证据',()=>{
 const f=fixture(),run=raw=>applySceneDistribution(f.snapshot,f.entry,f.decision,raw);
 const partial=run({...f.raw,assignments:f.raw.assignments.slice(0,2)});assert.equal(partial.needs.filter(n=>n.visibility==='excluded').length,2);
 assert.throws(()=>run({...f.raw,assignments:[...f.raw.assignments,f.raw.assignments[0]]}),/重复/);
 assert.throws(()=>run({...f.raw,assignments:f.raw.assignments.map(r=>r.cardUid==='room'?{...r,cardUid:'other'}:r)}),/本场/);
 assert.throws(()=>run({...f.raw,assignments:f.raw.assignments.map(r=>r.cardUid==='room'?{...r,evidence:'不存在的地方'}:r)}),/原文/);
});
test('人工补选无同名片段的场景可导出，AI 及来源更新保留人工锁定',()=>{
 const f=fixture();let d=assignSceneCard(f.snapshot,f.entry,f.decision,'room',true);
 assert.equal(d.needs.find(n=>n.cardUid==='room').manualReference,true);
 const raw=structuredClone(f.raw);raw.assignments.find(r=>r.cardUid==='room').visibility='excluded';
 d=applySceneDistribution(f.snapshot,f.entry,d,raw);
 assert.equal(d.needs.find(n=>n.cardUid==='room').visibility,'visible');
 const compiled=compileEntryBinding(f.snapshot,f.entry,saveDistribution(f.snapshot,f.entry,d));
 assert.match(compiled.prompt,/人工指定参考[\s\S]*积水道路上的面包车/);
 const updated={...f.entry,prompt:f.entry.prompt+'后续描述'};
 assert.equal(currentEntryBinding(f.snapshot,updated,d).needs.find(n=>n.cardUid==='room').locked,true);
});
test('人工取消会锁定不用，其他场景卡片不能人工添加',()=>{
 const f=fixture(),d=assignSceneCard(f.snapshot,f.entry,f.decision,'room',false);
 assert.equal(applySceneDistribution(f.snapshot,f.entry,d,f.raw).needs.find(n=>n.cardUid==='room').visibility,'excluded');
 assert.throws(()=>assignSceneCard(f.snapshot,f.entry,d,'not-here',true),/本场/);
});
test('缺项必须是有原文依据的实体，描述碎片被拒绝且缺项不自动建卡',()=>{
 const f=fixture();
 assert.throws(()=>applySceneDistribution(f.snapshot,f.entry,f.decision,{...f.raw,missing:[{category:'character',text:'肤色偏深',reason:'缺人物'}]}),/属性/);
 f.entry.prompt=f.entry.prompt.replace('道具：手机','道具：手机；手电筒');
 const d=applySceneDistribution(f.snapshot,f.entry,f.decision,{...f.raw,missing:[{category:'prop',text:'手电筒',reason:'清单没有'}]});
 assert.equal(d.needs.at(-1).cardUid,null);assert.equal(f.snapshot.cards.length,4);assert.equal(saveDistribution(f.snapshot,f.entry,d).confirmed,false);
});
test('自动分发只处理已关联场景，成功及失败指纹阻止重复，内容变更后可再运行',()=>{
 const f=fixture(),ready={'1-1':true},stamp=sceneDistributionStamp(f.snapshot,f.entry);
 assert.equal(shouldDistributeSceneEntry(f.snapshot,f.entry,ready,null,null),true);
 assert.equal(shouldDistributeSceneEntry(f.snapshot,f.entry,{},null,null),false);
 for(const status of ['running','failed','done'])assert.equal(shouldDistributeSceneEntry(f.snapshot,f.entry,ready,null,{stamp,status}),false);
 const d={...f.decision,signature:entryBindingSignature(f.snapshot,f.entry),origin:'scene-inventory-ai'};
 assert.equal(shouldDistributeSceneEntry(f.snapshot,f.entry,ready,d,null),false);
 assert.equal(shouldDistributeSceneEntry(f.snapshot,{...f.entry,prompt:f.entry.prompt+'新内容'},ready,d,{stamp,status:'done'}),true);
});
test('AI误报缺项时可手动指定本场已有卡片，替换不用记录并保留原文引用',()=>{
 const f=fixture();f.raw.assignments.find(r=>r.cardUid==='room').visibility='excluded';f.raw.missing=[{category:'scene',text:'破旧面包车驾驶室',reason:'名称不一致'}];
 const d=applySceneDistribution(f.snapshot,f.entry,f.decision,f.raw),missing=d.needs.find(n=>!n.cardUid);
 const resolved=resolveSceneMissing(f.snapshot,f.entry,d,missing.id,'room');
 assert.equal(resolved.needs.filter(n=>n.cardUid==='room').length,1);
 assert.equal(saveDistribution(f.snapshot,f.entry,resolved).confirmed,true);
 assert.match(compileEntryBinding(f.snapshot,f.entry,saveDistribution(f.snapshot,f.entry,resolved)).prompt,/破旧面包车驾驶室（参考@image/);
 assert.throws(()=>resolveSceneMissing(f.snapshot,f.entry,d,missing.id,'person'),/同类别/);
});

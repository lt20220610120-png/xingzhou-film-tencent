import test from 'node:test';
import assert from 'node:assert/strict';
import {assignCardToPrompts,cardPromptIds,auditedBindingNeeds} from './scenePromptAssignments.js';
import {currentEntryBinding,entryBindingSignature} from './promptArtBinding.js';
import {saveBindingVersion,selectBindingVersion,promptSetId} from './promptBindingVersions.js';

function fixture(){
 const entries=['1-1-1','1-1-2','1-2-1'].map(label=>({id:label,label,sceneId:label.slice(0,-2),sceneReady:true,prompt:'【基础设定】\n人物：李大川\n场景：小院\n道具：无'}));
 const cards=[{uid:'person',name:'【李大川-常服】',category:'character',sceneIds:['1-1','1-2'],images:[],publishedSceneIds:[]}];
 return {snapshot:{projectId:'p',cards,entries},decisions:{}};
}
test('场景卡片可关联多条提示词、取消时锁定不用且不影响另一场',()=>{
 const {snapshot}=fixture();let decisions=assignCardToPrompts(snapshot,{},'1-1','person',['1-1-1','1-1-2']);
 assert.deepEqual(cardPromptIds(snapshot,decisions,'1-1','person'),['1-1-1','1-1-2']);
 assert.equal(decisions['1-2-1'],undefined);
 decisions=assignCardToPrompts(snapshot,decisions,'1-1','person',['1-1-2']);
 assert.deepEqual(cardPromptIds(snapshot,decisions,'1-1','person'),['1-1-2']);
 assert.equal(decisions['1-1-1'].needs.find(n=>n.cardUid==='person').visibility,'excluded');
 assert.equal(decisions['1-1-1'].needs.find(n=>n.cardUid==='person').locked,true);
 assert.equal(decisions['1-1-2'].signature,entryBindingSignature(snapshot,snapshot.entries[1]));
});
test('拒绝跨场提示词和场外卡片，原分发不被修改',()=>{
 const {snapshot,decisions}=fixture();
 assert.throws(()=>assignCardToPrompts(snapshot,decisions,'1-1','person',['1-2-1']),/本场/);
 assert.throws(()=>assignCardToPrompts(snapshot,decisions,'1-1','missing',[]),/本场/);
 assert.deepEqual(decisions,{});
});
test('读取已保存的AI分发和手工分发使用同一份关系',()=>{
 const {snapshot}=fixture(),entry=snapshot.entries[0];
 const d=currentEntryBinding(snapshot,entry);d.origin='scene-inventory-ai';
 assert.deepEqual(cardPromptIds(snapshot,{[entry.id]:d},'1-1','person'),['1-1-1']);
});
test('未保存的规则建议及来源变更后重新猜测的对象不能显示为已关联',()=>{
 const {snapshot}=fixture(),entry=snapshot.entries[0],d=currentEntryBinding(snapshot,entry);
 assert.deepEqual(auditedBindingNeeds(snapshot,entry),[]);
 assert.deepEqual(auditedBindingNeeds(snapshot,{...entry,prompt:entry.prompt+'改词'},d),[]);
 const assigned=assignCardToPrompts(snapshot,{},'1-1','person',['1-1-1']);
 assert.equal(auditedBindingNeeds(snapshot,{...entry,prompt:entry.prompt+'改词'},assigned[entry.id])[0].locked,true);
});
test('场景手工提示词关联按版本隔离，改版不覆盖旧分发',()=>{
 const {snapshot}=fixture(),old=assignCardToPrompts(snapshot,{},'1-1','person',['1-1-1']);
 let saved=saveBindingVersion(null,snapshot,old);
 const revised={...snapshot,entries:snapshot.entries.map(e=>({...e,id:'v2-'+e.id,prompt:e.prompt+'新划分'}))};
 const second=assignCardToPrompts(revised,{},'1-1','person',['v2-1-1-2']);
 saved=saveBindingVersion(saved,revised,second);
 const restored=selectBindingVersion(revised,saved,promptSetId(snapshot));
 assert.deepEqual(cardPromptIds(restored.snapshot,restored.decisions,'1-1','person'),['1-1-1']);
 assert.deepEqual(cardPromptIds(revised,second,'1-1','person'),['v2-1-1-2']);
});

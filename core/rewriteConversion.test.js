import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedIdentityProject,identityCandidate,identityProject} from './test-support/rewriteIdentity.test.js';
import {changeRewriteIdentity,rewriteIdentity} from './rewriteIdentity.js';
import {readRewriteOutline,copyOutlineGroups} from './rewriteOutline.js';
import {conversionTaskInput,validateIdentityConversion,applyIdentityConversion,assertRewriteIdentityReady} from './rewriteConversion.js';
import {conversionCandidate} from './test-support/rewriteConversion.test.js';
test('conversion preserves IDs, source references and canonical metadata through normalization',()=>{
 const p=confirmedIdentityProject(),before=readRewriteOutline(p.creator.sections.macroOutline.output),next=applyIdentityConversion(p,{},conversionCandidate()),after=readRewriteOutline(next.creator.sections.macroOutline.output);
 assert.equal(after.groups[0].id,'g');assert.equal(after.groups[0].events[0].id,'e');assert.deepEqual(after.groups[0].events[0].references,before.groups[0].events[0].references);
 assert.deepEqual(after.groups[0].events[0].participantIds,['hero','mother']);assert.match(after.groups[0].events[0].summary,/夏初雪/);
 assert.doesNotThrow(()=>assertRewriteIdentityReady(next,['e']));assert.equal(next.creator.sections.macroOutline.accepted,false);
 assert.match(p.creator.sections.macroOutline.output,/宋馨雅/);
});
test('conversion rejects foreign names, invented people, missing nodes and cross-book actor guesses',()=>{
 const p=confirmedIdentityProject();let c=conversionCandidate();c.groups[0].events[0].summary='宋馨雅赴宴';assert.throws(()=>validateIdentityConversion(p,{},c),/来源人物|原名/);
 c=conversionCandidate();c.groups[0].participantIds=['invented'];assert.throws(()=>validateIdentityConversion(p,{},c),/人物/);
 c=conversionCandidate();c.groups[0].events=[];assert.throws(()=>validateIdentityConversion(p,{},c),/范围|遗漏/);
 c=conversionCandidate();c.groups[0].events[0].sourceActorRefs=[{sourceId:'b2',actorId:'not-found'}];assert.throws(()=>validateIdentityConversion(p,{},c),/角色/);
});
test('unresolved referenced relationships block conversion while unused source actors do not',()=>{
 const raw=identityCandidate();raw.bindings[1].personId='';let p=changeRewriteIdentity(changeRewriteIdentity(identityProject(),{type:'candidate',value:raw}),{type:'confirm'});
 assert.throws(()=>conversionTaskInput(p,{}, {strict:true}),/对应|确认/);
 raw.bindings[1].personId='mother';raw.sourceActors.push({sourceId:'b1',id:'unused',name:'路人甲',role:'support',evidence:'宋馨雅归还失物。',appearances:[]});
 p=changeRewriteIdentity(changeRewriteIdentity(identityProject(),{type:'candidate',value:raw}),{type:'confirm'});
 assert.doesNotThrow(()=>conversionTaskInput(p,{}, {strict:true}));
});
test('changing cast, converted text or referenced source stales conversion without deleting manuscript',()=>{
 const p=applyIdentityConversion(confirmedIdentityProject(),{},conversionCandidate());
 let next=changeRewriteIdentity(p,{type:'person.update',id:'hero',patch:{name:'夏宁'}});next=changeRewriteIdentity(next,{type:'confirm'});assert.throws(()=>assertRewriteIdentityReady(next,['e']),/转换|复核/);
 next=structuredClone(p);next.creator.source.content+='来源增加新证据。';assert.throws(()=>assertRewriteIdentityReady(next,['e']),/转换|复核/);
 next=structuredClone(p);const outline=readRewriteOutline(next.creator.sections.macroOutline.output);outline.groups[0].events[0].summary='人工改稿';next.creator.sections.macroOutline.output=JSON.stringify(outline);assert.throws(()=>assertRewriteIdentityReady(next,['e']),/转换|复核/);
});
test('partial conversion cannot touch another group or a locked manuscript',()=>{
 const p=confirmedIdentityProject();let outline=readRewriteOutline(p.creator.sections.macroOutline.output);outline.groups.push({...outline.groups[0],id:'other',title:'其他阶段',events:[{...outline.groups[0].events[0],id:'other-e'}]});p.creator.sections.macroOutline.output=JSON.stringify(outline);
 const next=applyIdentityConversion(p,{groupIds:['g']},conversionCandidate());assert.deepEqual(readRewriteOutline(next.creator.sections.macroOutline.output).groups[1],outline.groups[1]);
 assert.throws(()=>applyIdentityConversion(p,{groupIds:['other']},conversionCandidate()),/范围/);
 p.creator.sections.macroOutline.locked=true;assert.throws(()=>applyIdentityConversion(p,{},conversionCandidate()),/锁定|解锁/);
});
test('new copied references are pending and never inherit conversion proofs from the source',()=>{
 const g=readRewriteOutline(applyIdentityConversion(confirmedIdentityProject(),{},conversionCandidate()).creator.sections.macroOutline.output).groups[0];
 const copy=copyOutlineGroups([g],'b1')[0];assert.equal(copy.identityState,'pending');assert.ok(!copy.identityFingerprint);assert.ok(!copy.events[0].identityFingerprint);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteIdentity,validateIdentityCandidate,changeRewriteIdentity,identityTaskInput} from './rewriteIdentity.js';

export const identityProject=()=>({id:'identity-project',episodes:[],creator:{mode:'rewrite',records:[],sections:{settings:{output:'现代城市。新作女主夏初雪，男主陆舟。',accepted:true},characters:{output:'旧性格命运分析',accepted:true},macroOutline:{output:JSON.stringify({groups:[{id:'g',title:'相遇',goal:'宋馨雅与林宁的经历用于新作相遇',events:[{id:'e',title:'归还失物',summary:'宋馨雅归还失物，王梅邀请她赴宴。',purpose:'引出相遇',references:[{sourceId:'b1',groupId:'sg',eventId:'se'},{sourceId:'b2',groupId:'sg',eventId:'se'}]}]}]}),accepted:false}},rewrite:{},source:{id:'b1',name:'书一',content:'宋馨雅归还失物。王梅是宋馨雅母亲。',analysis:{macroOutline:{groups:[{id:'sg',title:'相遇',goal:'原书目标',events:[{id:'se',title:'归还失物',summary:'原书行动',purpose:'相遇'}]}]}}},references:[{id:'b2',name:'书二',content:'林宁归还失物。王梅是林宁母亲。',analysis:{macroOutline:{groups:[{id:'sg',title:'相遇',goal:'另一原书目标',events:[{id:'se',title:'归还失物',summary:'另一原书行动',purpose:'相遇'}]}]}}}]}});
export const identityCandidate=()=>({people:[{id:'hero',name:'夏初雪',role:'femaleLead'},{id:'mother',label:'女主母亲',role:'support'}],relations:[{id:'mother-edge',fromId:'hero',toId:'mother',type:'mother'}],sourceActors:[{sourceId:'b1',id:'lead',name:'宋馨雅',role:'femaleLead',evidence:'宋馨雅归还失物。',appearances:[{groupId:'sg',eventId:'se'}]},{sourceId:'b1',id:'mom',name:'王梅',role:'support',anchorActorId:'lead',relation:'mother',evidence:'王梅是宋馨雅母亲。',appearances:[{groupId:'sg',eventId:'se'}]},{sourceId:'b2',id:'lead',name:'林宁',role:'femaleLead',evidence:'林宁归还失物。',appearances:[{groupId:'sg',eventId:'se'}]},{sourceId:'b2',id:'mom',name:'王梅',role:'support',anchorActorId:'lead',relation:'mother',evidence:'王梅是林宁母亲。',appearances:[{groupId:'sg',eventId:'se'}]}],bindings:[{sourceId:'b1',actorId:'lead',personId:'hero'},{sourceId:'b1',actorId:'mom',personId:'mother'},{sourceId:'b2',actorId:'lead',personId:'hero'},{sourceId:'b2',actorId:'mom',personId:'mother'}]});
export const confirmedIdentityProject=()=>changeRewriteIdentity(changeRewriteIdentity(identityProject(),{type:'candidate',value:identityCandidate()}),{type:'confirm'});

test('same source names and actor IDs across books remain independent bindings to one canonical cast',()=>{
 const r=validateIdentityCandidate(identityProject(),identityCandidate());assert.equal(r.sourceActors.length,4);assert.equal(r.bindings.length,4);assert.equal(r.accepted,false);
 assert.equal(r.bindings.filter(b=>b.personId==='hero').length,2);assert.equal(r.bindings.filter(b=>b.personId==='mother').length,2);
});
test('identity candidate rejects missing relation endpoints, invented provenance and unknown actor bindings',()=>{
 let c=identityCandidate();c.relations[0].toId='missing';assert.throws(()=>validateIdentityCandidate(identityProject(),c),/人物|关系/);
 c=identityCandidate();c.sourceActors[0].evidence='原文没有这句话';assert.throws(()=>validateIdentityCandidate(identityProject(),c),/证据|原文/);
 c=identityCandidate();c.bindings[0].actorId='missing';assert.throws(()=>validateIdentityCandidate(identityProject(),c),/来源角色/);
});
test('ambiguous bindings remain unresolved and confirmation never invents a person',()=>{
 const c=identityCandidate();c.bindings[1].personId='';c.bindings[1].reason='母亲还是继母待确认';
 let p=changeRewriteIdentity(identityProject(),{type:'candidate',value:c});p=changeRewriteIdentity(p,{type:'confirm'});
 const f=rewriteIdentity(p);assert.equal(f.accepted,true);assert.equal(f.bindings[1].status,'unresolved');assert.equal(f.bindings[1].personId,'');
});
test('candidate adoption does not confirm automatically; edits invalidate downstream text without deleting it',()=>{
 const p=confirmedIdentityProject();p.episodes=[{id:'ep',result:'原正文',finalConfirmed:true}];
 const next=changeRewriteIdentity(p,{type:'person.update',id:'hero',patch:{name:'夏宁'}});
 assert.equal(rewriteIdentity(next).accepted,false);assert.equal(next.episodes[0].result,'原正文');assert.equal(next.episodes[0].stale,true);
 assert.equal(rewriteIdentity(p).people[0].name,'夏初雪');assert.equal(next.creator.sections.characters.accepted,false);
 assert.ok(rewriteIdentity(next).history.length>0);
});
test('identity edits preserve stable IDs and locked character information',()=>{
 const p=confirmedIdentityProject();assert.throws(()=>changeRewriteIdentity(p,{type:'person.update',id:'hero',patch:{id:'renamed'}}),/编号/);
 p.creator.sections.characters.locked=true;assert.throws(()=>changeRewriteIdentity(p,{type:'person.update',id:'hero',patch:{name:'夏宁'}}),/锁定|解锁/);
});
test('removed source keeps existing cast and historical bindings but cannot create new fake actors',()=>{
 const p=confirmedIdentityProject();p.creator.references=[];assert.equal(rewriteIdentity(p).people[0].id,'hero');
 const next=changeRewriteIdentity(p,{type:'person.update',id:'hero',patch:{name:'夏宁'}});assert.equal(rewriteIdentity(next).sourceActors.length,4);
 const c=identityCandidate();c.sourceActors.push({...c.sourceActors[0],sourceId:'missing',id:'fake'});assert.throws(()=>validateIdentityCandidate(p,c),/来源/);
});
test('identity context uses source namespaces, current settings and actual referenced event evidence',()=>{
 const input=identityTaskInput(identityProject(),{});const raw=JSON.stringify(input);assert.match(raw,/夏初雪/);assert.match(raw,/书一/);assert.match(raw,/书二/);assert.match(raw,/b1/);assert.match(raw,/b2/);
});

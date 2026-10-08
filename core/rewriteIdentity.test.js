import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteIdentity,validateIdentityCandidate,changeRewriteIdentity,identityTaskInput} from './rewriteIdentity.js';

import {identityProject,identityCandidate,confirmedIdentityProject} from './test-support/rewriteIdentity.test.js';

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
test('a source mother cannot silently become a different canonical relationship',()=>{
 const c=identityCandidate();c.relations[0].type='继母';let p=changeRewriteIdentity(identityProject(),{type:'candidate',value:c});
 p=changeRewriteIdentity(p,{type:'confirm'});assert.equal(rewriteIdentity(p).bindings[1].status,'unresolved');assert.equal(rewriteIdentity(p).bindings[1].conflict,true);
 p=changeRewriteIdentity(p,{type:'binding.update',sourceId:'b1',actorId:'mom',personId:'mother',approveRelationshipChange:true});p=changeRewriteIdentity(p,{type:'confirm'});
 assert.equal(rewriteIdentity(p).bindings[1].status,'confirmed');assert.equal(rewriteIdentity(p).bindings[3].status,'unresolved');
});
test('reorganizing cast cannot silently discard existing source actors and their name checks',()=>{
 const p=confirmedIdentityProject(),c=identityCandidate();c.sourceActors.pop();c.bindings.pop();
 assert.throws(()=>validateIdentityCandidate(p,c),/来源角色|保留/);
});
test('a changed source display name keeps its old name as an alias of the same source identity',()=>{
 const p=confirmedIdentityProject();p.creator.source.content=p.creator.source.content.replaceAll('宋馨雅','宋新雅');const c=identityCandidate();
 c.sourceActors[0].name='宋新雅';c.sourceActors[0].evidence='宋新雅归还失物。';c.sourceActors[1].evidence='王梅是宋新雅母亲。';
 const value=validateIdentityCandidate(p,c);assert.equal(value.sourceActors[0].id,'lead');assert.ok(value.sourceActors[0].aliases.includes('宋馨雅'));
});
test('ensemble leads remain separate identities instead of being merged by gender labels',()=>{
 const c=identityCandidate();c.people.push({id:'hero2',name:'林昭',role:'femaleLead'});c.relations.push({id:'mother-edge2',fromId:'hero2',toId:'mother',type:'mother'});c.bindings[2].personId='hero2';
 assert.equal(validateIdentityCandidate(identityProject(),c).people.length,3);
});

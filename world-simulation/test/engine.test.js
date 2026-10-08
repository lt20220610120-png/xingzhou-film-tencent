import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,branchState,addCandidate,commitCandidate,forkAt,compareBranches,exportLife,worldFingerprint,observeActor} from '../engine.js';
export const seed=()=>({characters:[{id:'hero',name:'主角',goal:'找到出路',locationId:'city',resources:{money:10}},{id:'general',name:'将军',locationId:'city'}],locations:[{id:'city',name:'城里'},{id:'north',name:'北方'}],routes:[{from:'city',to:'north',minutes:60}],rules:[{id:'law',text:'人不能同时出现在两个地点',public:true}],facts:[{id:'secret',text:'将军其实是反方首领',knownBy:['general']}]});
export const rescue=()=>({id:'rescue',title:'救将军',summary:'主角救下将军',time:1,actorIds:['hero','general'],effects:[{entityId:'hero',field:'relations.general',op:'set',value:'信任'}],observations:[{actorId:'hero',text:'将军承诺回报'}]});
const recruit=()=>({id:'recruit',title:'加入军队',summary:'将军引荐主角',time:2,actorIds:['hero'],dependsOn:['rescue'],reads:[{entityId:'hero',field:'relations.general',value:'信任'}],effects:[{entityId:'hero',field:'resources.money',op:'add',value:5}]});
const drought=()=>({id:'drought',title:'北方旱灾',summary:'北方降水不足',time:3,actorIds:[],effects:[]});
const commit=(w,events)=>commitCandidate(addCandidate(w,'main',{id:'choice',name:'路线',events}), 'main','choice');
test('candidate proposals do not change canonical world state; adoption is atomic and idempotent',()=>{
 const w=createWorld(seed(),{id:'w'}),before=JSON.stringify(w),c=addCandidate(w,'main',{id:'route',name:'营救',events:[rescue()]});assert.equal(branchState(c).time,0);assert.equal(JSON.stringify(w),before);
 const committed=commitCandidate(c,'main','route');assert.equal(branchState(committed).characters.hero.relations.general,'信任');assert.equal(branchState(committed).memories.length,1);assert.deepEqual(commitCandidate(committed,'main','route'),committed);
});
test('a changed past forks without overwriting old life; dependency closure is invalidated and unrelated future retained',()=>{
 const w=commit(createWorld(seed()),[rescue(),recruit(),drought()]),old=JSON.stringify(w);
 const changed={...rescue(),title:'拒绝相救',summary:'主角没有救将军',effects:[],observations:[]};
 const fork=forkAt(w,'main','rescue',changed,{id:'other',name:'另一人生'});
 assert.equal(JSON.stringify(w),old);assert.deepEqual(fork.branches.find(b=>b.id==='other').pending.map(e=>e.id),['recruit']);assert.deepEqual(fork.branches.find(b=>b.id==='other').scheduled.map(e=>e.id),['drought']);
 assert.equal(branchState(fork,'other').characters.hero.resources.money,10);assert.equal(branchState(fork,'other').characters.hero.relations.general,undefined);assert.equal(branchState(fork,'other').memories.length,0);assert.ok(compareBranches(fork,'main','other').changed.includes('rescue'));
});
test('retained future events fire only when a new branch advances to their time',()=>{
 const w=commit(createWorld(seed()),[rescue(),recruit(),drought()]);let fork=forkAt(w,'main','rescue',{...rescue(),effects:[],observations:[]},{id:'other'});
 assert.equal(branchState(fork).time,1);fork=commitCandidate(addCandidate(fork,'other',{id:'next',name:'新后续',events:[{id:'trade',time:4,title:'经商',summary:'主角赚取报酬',actorIds:['hero'],effects:[]}]}),'other','next');
 assert.deepEqual(fork.branches.find(b=>b.id==='other').events.map(e=>e.id),['rescue','drought','trade']);
});
test('stale candidates cannot be adopted after the branch has advanced',()=>{
 let w=createWorld(seed());w=addCandidate(w,'main',{id:'first',name:'一路',events:[rescue()]});w=addCandidate(w,'main',{id:'second',name:'二路',events:[{...rescue(),id:'other'}]});w=commitCandidate(w,'main','first');assert.throws(()=>commitCandidate(w,'main','second'),/过期/);
});
test('invalid money changes, unknown identities and forbidden keys cannot partially commit',()=>{
 const w=createWorld(seed());for(const effects of [[{entityId:'hero',field:'resources.money',op:'add',value:-20}],[{entityId:'stranger',field:'alive',op:'set',value:false}],[{entityId:'hero',field:'__proto__.polluted',op:'set',value:true}]])assert.throws(()=>addCandidate(w,'main',{id:'bad',name:'坏路线',events:[{...rescue(),effects}]}));assert.equal(branchState(w).characters.hero.resources.money,10);assert.equal({}.polluted,undefined);
});
test('dead actors cannot act and travel requires enough world time',()=>{
 let w=commit(createWorld(seed()),[{...rescue(),effects:[{entityId:'hero',field:'alive',op:'set',value:false}]}]);assert.throws(()=>addCandidate(w,'main',{id:'dead',name:'死人行动',events:[recruit()]}),/存活/);
 w=createWorld(seed());assert.throws(()=>addCandidate(w,'main',{id:'trip',name:'瞬移',events:[{...rescue(),effects:[{entityId:'hero',field:'locationId',op:'set',value:'north'}],duration:1}]}),/旅行/);
});
test('an actor does not receive another persons secrets or future branch information',()=>{
 const w=createWorld(seed());const observation=observeActor(w,'main','hero');assert.ok(!JSON.stringify(observation).includes('反方首领'));assert.ok(JSON.stringify(observeActor(w,'main','general')).includes('反方首领'));
 assert.throws(()=>addCandidate(w,'main',{id:'know',name:'偷知',events:[{...rescue(),requiresKnowledge:[{actorId:'hero',factId:'secret'}]}]}),/知情/);
});
test('locked events require explicit unlock through a new seed, not silent intervention',()=>{
 const w=commit(createWorld(seed()),[{...rescue(),locked:true}]);assert.throws(()=>forkAt(w,'main','rescue',{...rescue(),summary:'更改'}),/锁定/);
});
test('JSON persistence can replay every committed state and fingerprints ignore unrelated run history',()=>{
 const w=commit(createWorld(seed()),[rescue(),recruit()]),roundtrip=JSON.parse(JSON.stringify(w));assert.deepEqual(branchState(roundtrip),branchState(w));assert.equal(worldFingerprint({...w,runs:[{id:'history'}]}),worldFingerprint(w));assert.ok(exportLife(w,'main','hero').includes('加入军队'));
});
test('branches cannot share mutable memory or adopt candidates of another branch',()=>{
 const w=commit(createWorld(seed()),[rescue()]);let fork=forkAt(w,'main','rescue',{...rescue(),observations:[]},{id:'other'});fork=addCandidate(fork,'main',{id:'c',name:'后续',events:[recruit()]});assert.throws(()=>commitCandidate(fork,'other','c'),/候选/);
});

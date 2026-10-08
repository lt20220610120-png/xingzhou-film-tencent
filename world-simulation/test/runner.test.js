import test from 'node:test';import assert from 'node:assert/strict';
import {createWorld,branchState} from '../engine.js';
import {proposeNext} from '../runner.js';
import {chunkDocument,retrieveEvidence} from '../documents.js';
const fixture=()=>createWorld({characters:[{id:'hero',name:'主角',locationId:'city'},{id:'other',name:'另一人',locationId:'city'}],locations:[{id:'city',name:'城'}],facts:[{id:'secret',text:'另一人准备背叛',knownBy:['other']}],rules:[]});
const response=()=>JSON.stringify({routes:[{name:'继续寻找',reasoning:'动机成立',conditions:'需到达门口',events:[{id:'next',title:'寻找线索',summary:'主角询问路人',time:1,actorIds:['hero'],effects:[]}]}]});
test('role reasoning has a filtered view, while world arbitration sees facts; canonical state is unchanged',async()=>{
 const w=fixture(),requests=[];const result=await proposeNext(w,'main',{actorIds:['hero'],request:async messages=>{requests.push(messages);return requests.length===1?'主角准备寻找线索':response();},horizon:3,maxCalls:2});
 assert.ok(!JSON.stringify(requests[0]).includes('准备背叛'));assert.ok(JSON.stringify(requests[1]).includes('准备背叛'));assert.equal(result.routes.length,1);assert.equal(result.usage.calls,2);assert.equal(branchState(w).time,0);
});
test('existing story plans and relationships guide arbitration without becoming actor knowledge or history',async()=>{
 const w=fixture(),requests=[],authorPlan={groups:[{id:'planned',title:'未来结局',locked:true}],relations:[{fromId:'hero',toId:'other',type:'mother'}]};
 await proposeNext(w,'main',{authorPlan,actorIds:['hero'],request:async messages=>{requests.push(messages);return requests.length===1?'寻找线索':response();}});
 assert.ok(!JSON.stringify(requests[0]).includes('未来结局'));assert.deepEqual(JSON.parse(requests[1][1].content).authorPlan,authorPlan);assert.equal(branchState(w).eventIds.length,0);
});
test('call budget rejects before making excess calls and cancellation preserves traces',async()=>{
 let calls=0;await assert.rejects(proposeNext(fixture(),'main',{actorIds:['hero','other'],maxCalls:2,request:async()=>{calls++;return response();}}),/预算/);assert.equal(calls,0);
 const controller=new AbortController();await assert.rejects(proposeNext(fixture(),'main',{actorIds:['hero'],signal:controller.signal,request:async()=>{controller.abort();return '已输出';}}),e=>e.code==='STOPPED'&&e.trace.length===1);
});
test('malformed or conflicting AI events are kept as trace and not eligible routes',async()=>{
 await assert.rejects(proposeNext(fixture(),'main',{actorIds:[],request:async()=>JSON.stringify({routes:[{name:'未知人',events:[{id:'x',title:'假设',summary:'未知人物行动',time:1,actorIds:['missing']}]}]})}),e=>e.trace.length===1&&/未知/.test(e.message));
});
test('future events beyond the requested horizon are rejected',async()=>{
 await assert.rejects(proposeNext(fixture(),'main',{actorIds:[],horizon:2,request:async()=>JSON.stringify({routes:[{name:'遥远',events:[{id:'x',title:'远未来',summary:'很久以后',time:30,actorIds:[]}]}]})}),/期限/);
});
test('million-character evidence retains exact offsets and retrieval is bounded and private by default',()=>{
 const raw='原文'.repeat(500000)+'稀有证据',doc=chunkDocument({id:'novel',name:'长前文',content:raw});assert.equal(doc.chunks.map(c=>raw.slice(c.start,c.end)).join(''),raw);
 const w={documents:[doc]};assert.equal(retrieveEvidence(w,'稀有证据',{actorId:'hero'}).length,0);const results=retrieveEvidence(w,'稀有证据',{maxChars:5000});assert.ok(results.reduce((n,c)=>n+c.text.length,0)<=5000);assert.ok(results.some(c=>c.text.includes('稀有证据')));
});

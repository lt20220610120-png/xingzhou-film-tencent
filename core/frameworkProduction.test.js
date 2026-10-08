import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFrameworkProject} from './frameworkWorkflow.js';
import {prepareFrameworkTask,validateFrameworkOutput,frameworkTaskRule} from './frameworkAi.js';
import {runCreatorTask} from './creatorAi.js';

const project=()=>normalizeFrameworkProject({id:'production',name:'原创',creator:{mode:'framework',framework:{version:2,settings:{confirmed:true,items:[],pending:[]},groups:[{id:'g',title:'相遇',goal:'归还失物',confirmed:true,events:[{id:'e',title:'归还失物',summary:'甲归还包，乙邀请甲赴宴',confirmed:true}]}],mainline:{confirmed:true,orderConfirmed:true},plans:[{id:'p',name:'当前版',episodes:[{id:'ep',title:'第1集',content:'甲归还包，乙邀请甲赴宴',eventIds:['e']}]}],activePlanId:'p'}}});
const valid='第1集\n1-1 门口 日 外\n人物：甲、乙\n△甲拿起包交给乙。\n甲：是你的吧？\n乙：谢谢，请你来赴宴。';
test('minimum episode counts are an enforced constraint independent of exact counts',()=>{
 const p=project(),target={task:'frameworkPlan',minEpisodeCount:40},episodes=Array.from({length:40},(_,i)=>({number:i+1,content:'完整集纲',eventIds:['e']}));
 assert.doesNotThrow(()=>validateFrameworkOutput(p,target,{episodes}));
 assert.throws(()=>validateFrameworkOutput(p,target,{episodes:episodes.slice(0,39)}),/至少|40/);
 assert.throws(()=>prepareFrameworkTask(p,{...target,episodeCount:30}),/至少|冲突/);
 assert.throws(()=>prepareFrameworkTask(p,{...target,minEpisodeCount:0}),/集数/);
});
test('a summary response is repaired into screenplay scenes using the original adopted context',async()=>{
 const requests=[],result=await runCreatorTask({api:{aiChat:async r=>(requests.push(r),requests.length===1?'甲归还了包，然后赴宴。':valid)},state:{skills:[]},project:project(),target:{task:'frameworkEpisode',planId:'p',episodeId:'ep'},profile:{id:'mock',model:'mock'},taskId:'repair'});
 assert.equal(result.output,valid);assert.equal(requests.length,2);assert.match(requests[1].messages.at(-1).content,/动作|对白/);
 assert.match(requests[1].messages.map(m=>m.content).join('\n'),/甲归还了包/);assert.equal(result.meta.screenplayAttempts.length,2);
 assert.match(frameworkTaskRule('frameworkEpisode'),/设计|补全/);
});
test('bounded repair preserves all invalid responses and never retries a provider or cancellation error',async()=>{
 let calls=0;await assert.rejects(()=>runCreatorTask({api:{aiChat:async()=>{calls++;return '仍是摘要';}},state:{skills:[]},project:project(),target:{task:'frameworkEpisode',planId:'p',episodeId:'ep'},profile:{id:'mock',model:'mock'},taskId:'fail'}),e=>e.partialText==='仍是摘要'&&e.meta?.screenplayAttempts.length===3);
 assert.equal(calls,3);calls=0;
 await assert.rejects(()=>runCreatorTask({api:{aiChat:async()=>{calls++;throw Object.assign(new Error('额度不足'),{code:'WEB_QUOTA_EXHAUSTED'});}},state:{skills:[]},project:project(),target:{task:'frameworkEpisode',planId:'p',episodeId:'ep'},profile:{id:'mock',model:'mock'}}),/额度/);assert.equal(calls,1);
});


test('a provider failure during repair preserves earlier candidates without retrying the provider error',async()=>{
 let calls=0;const original='甲遇到乙，归还了包。';
 await assert.rejects(()=>runCreatorTask({api:{aiChat:async()=>{if(++calls===1)return original;throw Object.assign(new Error('网络中断'),{code:'WEB_NETWORK_ERROR'});}},state:{skills:[]},project:project(),target:{task:'frameworkEpisode',planId:'p',episodeId:'ep'},profile:{id:'mock',model:'mock'}}),e=>e.code==='WEB_NETWORK_ERROR'&&e.partialText===original&&e.meta.screenplayAttempts[0].output===original);
 assert.equal(calls,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {requestVideoDurationText} from './videoDurationRequest.js';
import {estimateVideoDurations} from './videoDurationEstimator.js';
import provider from '../electron/text-provider.cjs';

const profile={id:'duration-model',endpoint:'https://fixture.invalid/v1',model:'cn:deepseek-v4.1-flash',requiresApiKey:false};
const messages=[{role:'system',content:'Return duration semantics.'},{role:'user',content:'Fixture'}];

test('duration request streams DeepSeek final content with its own reasoning defaults',async()=>{
 const bodies=[];
 const fetchFn=async(_,options)=>{
  bodies.push(JSON.parse(options.body));
  return new Response('data: {"choices":[{"delta":{"reasoning_content":"Reasoning is not the response"}}]}\n\n'+
   'data: {"choices":[{"delta":{"content":"semantic result"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
 };
 const api={aiChat:async config=>{
  assert.equal(config.profileId,profile.id);
  assert.equal(config.reasoningEffort,'high');
  assert.equal(config.resultEnvelope,true);
  return {ok:true,output:await provider.requestText(config,{fetchFn})};
 }};
 const result=await requestVideoDurationText({api,profile:{...profile,analysisMode:true,reasoningEffort:'high'},taskId:'estimate',messages,maxOutputTokens:4096});
 assert.equal(result,'semantic result');
 assert.deepEqual(bodies[0],{model:profile.model,messages,stream:true,max_tokens:4096});
 await provider.requestText({...profile,messages,analysisMode:true},{fetchFn});
 assert.deepEqual(bodies[1].thinking,{type:'disabled'});
});

test('duration request propagates failure details and cancels only its own active task',async()=>{
 const cancelled=[];
 let fail;
 const api={aiChat:()=>new Promise(resolve=>{fail=resolve;}),cancelAiTask:async ({taskId})=>{cancelled.push(taskId);}};
 const abort=new AbortController();
 const task=requestVideoDurationText({api,profile,taskId:'active-estimate',messages,signal:abort.signal});
 abort.abort();
 fail({ok:false,code:'REQUEST_FAILED',error:'模型请求失败',httpStatus:429});
 await assert.rejects(task,{code:'REQUEST_FAILED',message:'模型请求失败',httpStatus:429});
 assert.deepEqual(cancelled,['active-estimate']);
 await assert.rejects(requestVideoDurationText({api:{aiChat:()=>assert.fail('invalid request')},profile,messages,signal:abort.signal}),{name:'AbortError'});

 const completed=new AbortController();
 assert.equal(await requestVideoDurationText({api:{...api,aiChat:async()=>({ok:true,output:'done'})},profile,taskId:'done',messages,signal:completed.signal}),'done');
 completed.abort();
 assert.deepEqual(cancelled,['active-estimate']);
});

test('completed SSE without final text and reasoning-only JSON retain specific pending causes',async()=>{
 const streamed='data: {"choices":[{"delta":{"reasoning_content":"内部推理"}}]}\n\ndata: [DONE]\n\n';
 const reasoning=JSON.stringify({choices:[{message:{reasoning_content:'内部推理'}}]});
 const empty=JSON.stringify({choices:[{message:{content:''}}]});
 const failure=JSON.stringify({error:{message:'接口已响应，但事件流没有返回正文。'}});
 for(const [body,status,expected,notice] of [
  [streamed,200,'EMPTY_RESPONSE',/没有返回.*正文/],
  [empty,200,'EMPTY_RESPONSE',/没有返回.*正文/],
  [reasoning,200,'REASONING_ONLY',/只返回了推理过程/],
  [failure,503,'REQUEST_FAILED',/HTTP 503/],
 ]){
  let calls=0;
  const api={aiChat:async config=>{
   calls++;
   try{return {ok:true,output:await provider.requestText(config,{fetchFn:async()=>new Response(body,{status})})};}
   catch(error){return {ok:false,error:error.message,code:error.code||'FAILED',httpStatus:error.httpStatus};}
  }};
  const estimates=await estimateVideoDurations({segments:[{id:'1-1-1',prompt:'她抬头。'}],maxDurationSeconds:15,
   request:options=>requestVideoDurationText({api,profile,taskId:'empty-result',...options})});
  const result=estimates.get('1-1-1');
  assert.equal(result.status,'pending');assert.equal(result.recommendedSeconds,undefined);
  assert.equal(result.error.code,expected);assert.match(result.error.message,notice);
  assert.equal(calls,1);
 }
});

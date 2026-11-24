import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateVideoDurations,normalizeVideoDurationLimit,parseVideoDurationResponse} from './videoDurationEstimator.js';
import {recommendedPromptDuration,recommendedStoryboardTiming} from './promptDisplay.js';
import {extractPromptTimingMetadata,formatPromptTimingMetadata,markPromptTimingStale} from './promptTiming.js';
import {parsePromptBook} from './promptBook.js';

const segments=[{id:'22-2-1',script:'- 她从地上爬起，拿起手机。\n【我发定位，快来接我。】',prompt:'动作：起身、取手机。\n声音：角色在心里读出定位短信。'},{id:'22-2-2',script:'',prompt:'VO：读上文'}];
const response=(cap, results, errors=[])=>JSON.stringify({max_duration_seconds:cap,limit_defaulted:false,schema_version:'1.0',results,errors});
const result=(id,natural,recommended,{cap=30,speech=9.04,action=1,buffer=0.8}={})=>({segment_id:id,timing:{natural_seconds:natural,recommended_seconds:recommended,needs_resegment:natural>(cap===15?18:35)},breakdown:{speech_seconds:speech,nonparallel_action_seconds:action,pause_buffer_seconds:buffer},reason:natural>(cap===15?18:35)?'对白和动作依次执行；需重新划分片段并重新生成提示词。':'对白与看屏并行，保留尾缓冲。',capacity_status:natural<=cap?'正常':natural>(cap===15?18:35)?'超载需重分':'略偏紧'});
const semanticFailure={segment_id:segments[1].id,code:'MISSING_SPOKEN_CONTENT',message:'缺少朗读原文'};

test('both supplied sources reach one fixed Skill request, with per-segment errors and no heuristic fallback',async()=>{
 let calls=0;
 const values=await estimateVideoDurations({segments,maxDurationSeconds:30,request:async({messages})=>{
  calls++;
  assert.equal(messages.length,2);
  assert.match(messages[0].content,/多回合长对白防漏算/);
  assert.match(messages[0].content,/稳定输出协议 v1\.0/);
  assert.doesNotMatch(messages[0].content,/experiment-cases\.json/);
  assert.deepEqual(JSON.parse(messages[1].content),{max_duration_seconds:30,segments:segments.map(({id,script,prompt})=>({segment_id:id,script,prompt}))});
  return response(30,[result(segments[0].id,11,11)],[semanticFailure]);
 }});
 assert.equal(calls,1);
 assert.equal(values.get(segments[0].id).recommendedSeconds,11);
 assert.deepEqual(values.get(segments[1].id),{version:'2.0.0',status:'pending',maxDurationSeconds:30,error:{code:'MISSING_SPOKEN_CONTENT',message:'缺少朗读原文'}});
});

test('the 15/30 execution values remain capped and overloaded values retain the natural requirement',()=>{
 for(const [cap,natural,recommended] of [[15,17,15],[30,34,30],[15,19,19],[30,36,36]]){
  const doc=response(cap,[result('a',natural,recommended,{cap,speech:natural-1,action:0})]);
  const value=parseVideoDurationResponse(doc,['a'],cap).get('a');
  assert.equal(value.recommendedSeconds,recommended);
  assert.equal(value.capacityStatus,recommended===cap?'略偏紧':'超载需重分');
 }
 assert.deepEqual([0,35,20,15,1,undefined].map(normalizeVideoDurationLimit),[30,30,30,15,15,30]);
});

test('strict protocol rejects duplicate keys, decimals beyond cents, missing IDs, arithmetic mismatch and hidden excess',()=>{
 const row=result('a',11,11);
 const valid=response(30,[row]);
 const invalid=[valid.replace('"schema_version":"1.0"','"schema_version":"1.0","schema_version":"1.0"'),valid.replace('9.04','9.041'),
  response(30,[{...row,segment_id:'b'}]),response(30,[row],[{...semanticFailure,segment_id:'a'}]),
  response(30,[result('a',12,12)]),response(30,[result('a',11,31)]),'```json\n'+valid+'\n```',valid.replace('"reason"','"unknown"')];
 for(const raw of invalid)assert.throws(()=>parseVideoDurationResponse(raw,['a'],30));
 assert.throws(()=>parseVideoDurationResponse(response(30,[row]),['a','b'],30));
 assert.throws(()=>parseVideoDurationResponse(response(30,[result('a',1,1,{speech:0.1,action:0,buffer:0.8})]),['a'],30));
});

test('call-level failure produces only pending metadata and no accidental second request',async()=>{
 let calls=0;
 const values=await estimateVideoDurations({segments,maxDurationSeconds:15,request:async()=>{calls++;throw new Error('private provider details');}});
 assert.equal(calls,1);
 for(const value of values.values()){
  assert.equal(value.status,'pending');
  assert.equal(value.recommendedSeconds,undefined);
  assert.doesNotMatch(value.error.message,/private/);
 }
});

test('canonical values never fall through to legacy seconds, and preserve transport and standalone text metadata',()=>{
 const durationEstimate=parseVideoDurationResponse(response(30,[result('a',36,36,{speech:35,action:0})]),['a'],30).get('a');
 const value={id:'shot',content:'建议生成时长：1秒\n原正文。',recommendedDurationSeconds:1,durationEstimate};
 assert.equal(recommendedPromptDuration(value),null);
 assert.equal(recommendedStoryboardTiming(null,value).durationEstimate.needsResegment,true);
 const exported=formatPromptTimingMetadata(value);
 assert.equal(extractPromptTimingMetadata(`${exported}\n${value.content}`).text,value.content);
 assert.deepEqual(extractPromptTimingMetadata(`${exported}\n${value.content}`).timing.durationEstimate,durationEstimate);
 assert.equal(markPromptTimingStale(value).durationEstimate.status,'needs-review');
});

test('timeout and invalid JSON retain pending independently of the older textual value',async()=>{
 const values=await estimateVideoDurations({segments,maxDurationSeconds:30,timeoutMs:5,request:()=>new Promise(()=>{})});
 assert.equal(values.get(segments[0].id).error.code,'TIMEOUT');
 const invalid=await estimateVideoDurations({segments,maxDurationSeconds:30,request:async()=>'{broken'});
 const value={durationEstimate:invalid.get(segments[0].id),content:'建议生成时长：1秒'};
 assert.equal(value.durationEstimate.error.code,'INVALID_RESPONSE');
 assert.equal(recommendedPromptDuration(value),null);
});

test('reference-like numbering in a written reason does not become a prompt heading on import',()=>{
 const durationEstimate=parseVideoDurationResponse(response(30,[result('a',11,11)]),['a'],30).get('a');
 durationEstimate.reason='对照【1-2-3】与[3-2-1]的台词，保留气口。';
 const header=formatPromptTimingMetadata({durationEstimate});
 const book=parsePromptBook(`【1-1-1】\n${header}\n原稿`);
 assert.equal(book.entries.length,1);
 assert.equal(book.entries[0].durationEstimate.reason,durationEstimate.reason);
 const previous={label:'1-1-1',segmentationMode:'manual',content:'建议生成时长：11秒\n原稿'};
 const edited=markPromptTimingStale({...previous,content:'已改成十一行对白。'},{previous});
 assert.equal(edited.durationEstimate.status,'needs-review');
 assert.equal(recommendedPromptDuration(edited),null);
});

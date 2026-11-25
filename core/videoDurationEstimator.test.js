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
const semantic=(segment_id,groups,more={})=>({segment_id,groups,reason:'按实际发声与动作先后计算。',...more});
const semanticResponse=(results,errors)=>JSON.stringify({results,errors});

test('dual sources reach one initial request, successful rows save before one retry of the failed clip',async()=>{
 const third={id:'22-2-3',script:'她打开门',prompt:'推门入内'};
 const input=[...segments,third],calls=[],saves=[],progress=[];
 const values=await estimateVideoDurations({segments:input,maxDurationSeconds:30,request:async({messages})=>{
  assert.equal(messages.length,2);
  assert.match(messages[0].content,/v3\.0\.0/);
  assert.match(messages[0].content,/turns/);
  assert.match(messages[0].content,/visual_seconds/);
  assert.match(messages[0].content,/tight/);
  assert.doesNotMatch(messages[0].content,/experiment-cases\.json|schema_version|逗顿用 comma/);
  assert.ok(messages[0].content.length<1800,'semantic-only prompt should stay compact');
  const {segments:sent}=JSON.parse(messages[1].content);
  calls.push(sent.map(row=>row.segment_id));
  if(calls.length===1){
   assert.deepEqual(sent,input.map(({id,script,prompt})=>({segment_id:id,script,prompt})));
   return semanticResponse([semantic(third.id,[{visual_seconds:3.5}]),semantic(segments[0].id,[
    {turns:[{text:'我发定位，快来接我。',pace:'normal'}],visual_seconds:2}, {visual_seconds:2},
   ]),semantic(segments[1].id,[{speech:[{text:'',pace:'normal'}]}])]);
  }
  assert.deepEqual(saves,[[segments[0].id,third.id]]);
  return semanticResponse([],[semanticFailure]);
 },onEstimates:async values=>saves.push([...values.keys()]),onProgress:state=>progress.push(state)});
 assert.deepEqual(calls,[input.map(row=>row.id),[segments[1].id]]);
 assert.deepEqual(saves,[[segments[0].id,third.id],[segments[1].id]]);
 assert.equal(values.get(segments[0].id).recommendedSeconds,5);
 assert.equal(values.get(segments[0].id).version,'3.0.0');
 assert.equal(values.get(segments[1].id).error.code,'MISSING_SPOKEN_CONTENT');
 assert.match(values.get(segments[1].id).error.message,/朗读原文/);
 assert.deepEqual(progress.map(({stage,completed})=>[stage,completed]),[['requesting',0],['retrying',2],['complete',3]]);
});

test('the 15/30 execution values remain capped and overloaded values retain the natural requirement',()=>{
 for(const [cap,natural,recommended] of [[15,17,15],[30,34,30],[15,19,19],[30,36,36]]){
  const doc=response(cap,[result('a',natural,recommended,{cap,speech:natural-1,action:0})]);
  const value=parseVideoDurationResponse(doc,['a'],cap).get('a');
  assert.equal(value.version,'2.0.0');
  assert.equal(value.recommendedSeconds,recommended);
  assert.equal(value.capacityStatus,recommended===cap?'略偏紧':'超载需重分');
 }
 assert.deepEqual([0,35,20,15,1,undefined].map(normalizeVideoDurationLimit),[30,30,30,15,15,30]);
});

test('legacy standalone JSON fence and reordered keys produce the same estimate',()=>{
 const row=result('a',11,11);
 const reverseKeys=value=>Array.isArray(value)?value.map(reverseKeys):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).reverse().map(([key,nested])=>[key,reverseKeys(nested)])):value;
 const valid=response(30,[row]);
 const reordered=JSON.stringify(reverseKeys(JSON.parse(valid)));
 const expected=parseVideoDurationResponse(valid,['a'],30);
 for(const raw of [reordered,`\n\`\`\`json\n${valid}\n\`\`\`\n`,`\`\`\`JSON\r\n${reordered}\r\n\`\`\``,`\`\`\`\n${reordered}\n\`\`\``]){
  assert.deepEqual(parseVideoDurationResponse(raw,['a'],30),expected);
 }
});

test('semantic rows ignore old derived fields and produce identical cents across model formats and limits',async()=>{
 const wide=semantic('a',[{turns:[{text:'15万。',pace:'fast'},{text:'OK。',pace:'normal'}],
  parallel_speech:[[{text:'抢话。',pace:'normal'}]],pause_seconds:0.30001,visual_seconds:2.1009},
 {reading:{text:'屏幕正文'.repeat(23)},pause_seconds:.4},{visual_seconds:1}],{tail_buffer_seconds:.75});
 const another={natural_seconds:1,capacity_status:'正常',breakdown:{speech_seconds:999},...wide,groups:[{...wide.groups[0],visual_seconds:'2.1009'},...wide.groups.slice(1)]};
 const call=(raw,maxDurationSeconds)=>estimateVideoDurations({segments:[{id:'a',script:'进门',prompt:'向前走'}],maxDurationSeconds,request:async()=>raw});
 const [fast,pro,otherLimit]=await Promise.all([call(semanticResponse([wide]),15),call(`\`\`\`json\n${semanticResponse([another],[])}\n\`\`\``,15),call(semanticResponse([wide]),30)]);
 const computed=fast.get('a');
 assert.deepEqual(computed,pro.get('a'));
 assert.deepEqual(computed.breakdown,{speechSeconds:.77,nonparallelActionSeconds:13.37,pauseBufferSeconds:4.69});
 assert.equal(computed.naturalSeconds,19);
 assert.equal(computed.capacityStatus,'超载需重分');
 assert.match(computed.reason,/需重新划分片段并重新生成提示词/);
 assert.deepEqual(otherLimit.get('a').breakdown,computed.breakdown);
 assert.equal(otherLimit.get('a').capacityStatus,'正常');
});

test('the semantic ledger carries decimal rounding over the four capacity boundaries',async()=>{
 for(const [maxDurationSeconds,visual_seconds,naturalSeconds,capacityStatus,recommendedSeconds] of [
   [15,14.4,15,'正常',15],[15,14.40001,16,'略偏紧',15],[15,17.4,18,'略偏紧',15],[15,17.40001,19,'超载需重分',19],
   [30,29.4,30,'正常',30],[30,29.40001,31,'略偏紧',30],[30,34.4,35,'略偏紧',30],[30,34.40001,36,'超载需重分',36],
 ]){
  const value=(await estimateVideoDurations({segments:[{id:'a',prompt:'连续完成动作'}],maxDurationSeconds,
   request:async()=>semanticResponse([semantic('a',[{visual_seconds}])])})).get('a');
  assert.deepEqual([value.naturalSeconds,value.capacityStatus,value.recommendedSeconds],[naturalSeconds,capacityStatus,recommendedSeconds]);
 }
});

test('only the last concrete failure survives, and a missing row can recover on its single retry',async()=>{
 const input=[...segments,{id:'third',prompt:'安静的画面'}],calls=[];
 const values=await estimateVideoDurations({segments:input,maxDurationSeconds:30,request:async({messages})=>{
  const ids=JSON.parse(messages[1].content).segments.map(row=>row.segment_id);calls.push(ids);
  if(ids.length===3)return semanticResponse([semantic(segments[0].id,[{visual_seconds:1}]),
   semantic(segments[1].id,[{visual_seconds:1}]),semantic(segments[1].id,[{visual_seconds:2}])]);
  if(ids[0]==='third')return semanticResponse([semantic('third',[{visual_seconds:1}],{kind:'transition'})]);
  throw Object.assign(Error('sensitive provider message'),{httpStatus:503});
 }});
 assert.deepEqual(calls,[input.map(row=>row.id),[segments[1].id],['third']]);
 assert.equal(values.get(segments[1].id).error.message,'估时接口返回 HTTP 503，请检查接口状态。');
 assert.equal(values.get('third').recommendedSeconds,2);
});

test('cancellation during partial save prevents retries',async()=>{
 const controller=new AbortController(),saves=[];
 let calls=0;
 const operation=estimateVideoDurations({segments,maxDurationSeconds:30,signal:controller.signal,request:async()=>{
  calls++;
  return semanticResponse([semantic(segments[0].id,[{turns:[{text:'马'.repeat(16),pace:'normal'}]}])]);
 },onEstimates:async rows=>{saves.push(rows);controller.abort(new DOMException('取消','AbortError'));}});
 await assert.rejects(operation,error=>error.name==='AbortError');
 assert.equal(calls,1);
 assert.deepEqual(saves[0].get(segments[0].id).breakdown,{speechSeconds:2.67,nonparallelActionSeconds:0,pauseBufferSeconds:1.33});
});

test('strict protocol rejects chatter, duplicate keys, incomplete data, invalid numbers and incorrect capacity',()=>{
 const row=result('a',11,11);
 const valid=response(30,[row]);
 const fenced=`\`\`\`json\n${valid}\n\`\`\``;
 const invalid=[valid.replace('"schema_version":"1.0"','"schema_version":"1.0","schema_version":"1.0"'),valid.replace('9.04','9.041'),
  fenced.replace('"natural_seconds":11','"natural_seconds":11,"natural_seconds":11'),valid.replace('"natural_seconds":11','"natural_seconds":11.0'),
  response(30,[{...row,segment_id:'b'}]),response(30,[row],[{...semanticFailure,segment_id:'a'}]),
  response(30,[result('a',12,12)]),response(30,[result('a',11,31)]),response(30,[{...row,capacity_status:'略偏紧'}]),
  response(30,[{...row,reason:undefined}]),valid.replace('"reason"','"unknown"'),
  `估时结果如下\n${fenced}`,`${fenced}\n已完成`,`${fenced}\n${fenced}`,fenced.replace('json','javascript')];
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
 const blank=await estimateVideoDurations({segments,maxDurationSeconds:30,request:async()=>'  '});
 assert.equal(blank.get(segments[0].id).error.message,'估时模型没有返回正文。');
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

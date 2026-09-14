const test=require('node:test'),assert=require('node:assert/strict');const {requestChat}=require('./ai-service.cjs');
test('parallel requests preserve their distinct model, credentials and protocol despite completion order',async()=>{
 const requests=[];let release;const wait=new Promise(r=>release=r);
 const fetchFn=async(url,options)=>{requests.push({url,...options,body:JSON.parse(options.body)});if(url.includes('first'))await wait;return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:url},finish_reason:'stop'}]})};};
 const a=requestChat({endpoint:'https://first.example/v1',apiKey:'a',model:'model-a',messages:[]},{fetchFn});
 const b=await requestChat({endpoint:'https://second.example/v1',apiKey:'b',model:'model-b',messages:[]},{fetchFn});release();const first=await a;
 assert.match(first,/first/);assert.match(b,/second/);assert.deepEqual(requests.map(r=>[r.body.model,r.headers.Authorization]),[['model-a','Bearer a'],['model-b','Bearer b']]);
});
test('bounded analysis sends output budget and documented DeepSeek final-text mode',async()=>{
 let request;await requestChat({endpoint:'https://example.com/v1',model:'deepseek-v4-pro',apiKey:'test',analysisMode:true,maxOutputTokens:16384},{fetchFn:async(_,p)=>{request=JSON.parse(p.body);return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'正文'},finish_reason:'stop'}]})};}});
 assert.equal(request.max_tokens,16384);assert.deepEqual(request.thinking,{type:'disabled'});
});
test('incomplete event streams retain the partial text for a resumable paid request',async()=>{
 let failure;
 try { await requestChat({endpoint:'https://example.com/v1',model:'model-a',apiKey:'test'},{fetchFn:async()=>({ok:true,text:async()=>[
   'data: '+JSON.stringify({choices:[{delta:{content:'第 1 集 人物：'},finish_reason:null}]}),
   'data: '+JSON.stringify({choices:[{delta:{content:'部分结果'},finish_reason:'length'}]})
 ].join('\n\n')})}); } catch (error) { failure=error; }
 assert.ok(failure);
 assert.match(failure.partialText,/部分结果/);
});

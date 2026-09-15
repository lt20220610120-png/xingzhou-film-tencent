const test=require('node:test'),assert=require('node:assert/strict');
const {requestChat}=require('./ai-service.cjs');
test('streamed multibyte analysis produces progress and final text; concurrent profiles keep separate keys/models',async()=>{
 const requests=[],progress=[];
 const fetchFn=async(url,options)=>{requests.push({url,...JSON.parse(options.body),key:options.headers.Authorization});const encoded=new TextEncoder().encode('data: {"choices":[{"delta":{"content":"五官妆发"}}]}\n\ndata: [DONE]\n\n');
 return new Response(new ReadableStream({start(c){for(let i=0;i<encoded.length;i+=3)c.enqueue(encoded.slice(i,i+3));c.close();}}));};
 const answers=await Promise.all(['a','b'].map(id=>requestChat({endpoint:`https://${id}.example/v1`,apiKey:id,model:id,analysisMode:true,messages:[]},{fetchFn,onProgress:s=>progress.push(s)})));
 assert.deepEqual(answers,['五官妆发','五官妆发']);assert.deepEqual(requests.map(r=>[r.model,r.key,r.stream]),[['a','Bearer a',true],['b','Bearer b',true]]);assert.ok(progress.some(p=>p.receivedBytes>0));
});
test('truncated streaming output is retained without automatically repeating paid request',async()=>{
 let calls=0;await assert.rejects(requestChat({endpoint:'https://a.example/v1',apiKey:'a',model:'a',analysisMode:true},{fetchFn:async()=>{calls++;return new Response('data: {"choices":[{"delta":{"content":"已完成部分"}}]}\n\n');}}),e=>e.partialText==='已完成部分');assert.equal(calls,1);
});
